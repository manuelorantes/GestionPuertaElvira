import { assertEquals } from '@std/assert';

import { newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, db, resetDatabase } from '../support/http.ts';

const body = <T>(response: { body: unknown }) => response.body as T;
// Viernes 16 de octubre de 2026, durante la actividad de los viernes (de 17:00 a 20:00).
const FRIDAY = '2026-10-16T18:00:00+02:00';

/** Ángel lleva la actividad «Viernes»; Lucía, un turno normal los viernes de 20:00 a 21:00. Los dos tienen cuenta. */
async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  const angel = await newTeacher(admin, 'Ángel Castillo Rodriguez');
  const lucia = await newTeacher(admin, 'Lucía Moreno Gil');
  const duty = async (teacherId: string, kind: string, start: string, end: string) => {
    const created = await admin.json('POST', '/api/admin/payroll/duties', {
      teacherId,
      weekday: 5,
      start,
      end,
      kind,
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    return body<{ id: string }>(created).id;
  };
  const fridays = await duty(angel, 'fridays', '17:00', '20:00');
  const shift = await duty(lucia, 'shift', '20:00', '21:00');
  const ids: string[] = [];
  for (const fullName of ['Ana Pérez Gil', 'Pablo Ruiz Sanz']) {
    const created = await admin.json('POST', '/api/admin/students', { fullName, groupIds: [] });
    ids.push(body<{ id: string }>(created).id);
  }
  await db()`UPDATE students_student SET joined_on = '2026-09-01'`;
  // La asistencia cuenta desde el 1 de octubre (sin esta fila contaría desde hoy, y el test caducaría).
  await db()`INSERT INTO attendance_settings (id, since) VALUES (1, '2026-10-01')`;
  for (const [email, teacherId] of [['angel@club.es', angel], ['lucia@club.es', lucia]] as const) {
    await createUser(email, 'teacher');
    await db()`UPDATE identity_user SET teacher_id = ${teacherId}, teacher_linked_at = '2026-10-01T00:00:00+02:00'
                WHERE email = ${email}`;
  }
  return { admin, angel, lucia, fridays, shift, ana: ids[0] ?? '', pablo: ids[1] ?? '' };
}

Deno.test('the Friday activity manager takes the Friday attendance and other activities are marked as done', async () => {
  const fx = await atTime(FRIDAY, fixture);
  await atTime(FRIDAY, async () => {
    // Ana vino un viernes de este mes (lo marcó administración): sale propuesta, sin marcar.
    assertEquals(
      (await fx.admin.json('PUT', `/api/admin/points/fridays/2026-10-02/students/${fx.ana}`, {
        present: true,
      }))
        .status,
      204,
    );
    const angel = new ApiClient();
    await angel.logIn('angel@club.es');
    const classes = async () =>
      body<{ items: { label: string; activity: string; rollCall: string }[] }>(
        await angel.get('/api/teacher/classes'),
      ).items.map((c) => [c.label, c.activity, c.rollCall]);
    assertEquals(await classes(), [['Viernes', 'fridays', 'open']]);

    const url = `/api/teacher/fridays/${fx.fridays}/2026-10-16`;
    const list = body<{ list: { name: string; present: boolean }[]; everyone: { name: string }[] }>(
      await angel.get(url),
    );
    assertEquals(list.list.map((s) => [s.name, s.present]), [['Ana Pérez Gil', false]]);
    assertEquals(list.everyone.map((s) => s.name), ['Ana Pérez Gil', 'Pablo Ruiz Sanz']);

    // Pablo no estaba propuesto: lo busca y lo marca. Es la misma asistencia (y punto) que en Puntos.
    assertEquals(
      (await angel.json('PUT', `${url}/students/${fx.pablo}`, { present: true })).status,
      204,
    );
    assertEquals(await classes(), [['Viernes', 'fridays', 'taken']]);
    // Su primera marca apunta ya las 3 horas de la actividad.
    const sessions = body<{ items: { date: string; label: string; minutes: number }[] }>(
      await fx.admin.get(`/api/admin/payroll/sessions?month=2026-10&teacherId=${fx.angel}`),
    ).items;
    assertEquals(sessions.map((s) => [s.date, s.label, s.minutes]), [[
      '2026-10-16',
      'Viernes',
      180,
    ]]);
    const grid = body<{ students: { name: string; present: string[] }[] }>(
      await fx.admin.get('/api/admin/points/fridays?month=2026-10'),
    );
    assertEquals(grid.students.find((s) => s.name === 'Pablo Ruiz Sanz')?.present, ['2026-10-16']);

    // Lucía confirma su turno; no puede tocar la lista de los viernes, que no es suya.
    const lucia = new ApiClient();
    await lucia.logIn('lucia@club.es');
    assertError(await lucia.get(url), 404, 'not_found');
  });
  await atTime('2026-10-16T20:30:00+02:00', async () => {
    const lucia = new ApiClient();
    await lucia.logIn('lucia@club.es');
    assertEquals(
      (await lucia.json('POST', `/api/teacher/activities/${fx.shift}/2026-10-16/done`, {})).status,
      204,
    );
    const items =
      body<{ items: { rollCall: string }[] }>(await lucia.get('/api/teacher/classes')).items;
    assertEquals(items.map((c) => c.rollCall), ['taken']);
    // «Turno hecho» apunta ya la hora del turno.
    await fx.admin.logIn('junta@club.es');
    const sessions = body<{ items: { date: string; minutes: number }[] }>(
      await fx.admin.get(`/api/admin/payroll/sessions?month=2026-10&teacherId=${fx.lucia}`),
    ).items;
    assertEquals(sessions.map((s) => [s.date, s.minutes]), [['2026-10-16', 60]]);
  });
});

Deno.test('activities without confirmation from their manager should show up in the missed roll calls', async () => {
  const fx = await atTime(FRIDAY, fixture);
  // Sesiones apuntadas del viernes 9 (como las apunta la tarea de cada noche).
  const session = (teacherId: string, duty: string, label: string, start: number) =>
    db()`INSERT INTO payroll_session (id, teacher_id, session_date, group_id, label, minutes, from_schedule,
                                      start_minutes, source)
         VALUES (gen_random_uuid(), ${teacherId}, '2026-10-09', NULL, ${label}, 60, true, ${start}, ${`duty:${duty}`})`;
  await session(fx.angel, fx.fridays, 'Viernes', 17 * 60);
  await session(fx.lucia, fx.shift, 'Encargado del club', 20 * 60);

  await atTime('2026-10-12T10:00:00+02:00', async () => {
    await fx.admin.logIn('junta@club.es');
    // Administración marca a Ana el viernes 9: cuenta para sus puntos, pero no confirma la actividad de Ángel.
    await fx.admin.json('PUT', `/api/admin/points/fridays/2026-10-09/students/${fx.ana}`, {
      present: true,
    });
    const pending = async () =>
      body<{ items: { label: string; dutyId: string | null; teacherName: string }[] }>(
        await fx.admin.get('/api/admin/attendance/pending'),
      ).items.map((p) => [p.label, p.teacherName]);
    assertEquals(await pending(), [
      ['Viernes', 'Ángel Castillo Rodriguez'],
      ['Encargado del club', 'Lucía Moreno Gil'],
    ]);
    assertEquals(
      (await fx.admin.json(
        'POST',
        `/api/admin/attendance/pending/activities/${fx.fridays}/2026-10-09/confirm`,
        {},
      ))
        .status,
      204,
    );
    assertEquals(await pending(), [['Encargado del club', 'Lucía Moreno Gil']]);
  });
});
