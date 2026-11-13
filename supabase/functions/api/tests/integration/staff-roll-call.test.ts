import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, db, resetDatabase } from '../support/http.ts';

const body = <T>(response: { body: unknown }) => response.body as T;

/** Carlos (con cuenta) da un grupo los martes; superadministración y administración entran en el panel. */
async function fixture() {
  await resetDatabase();
  await db()`INSERT INTO attendance_settings (id, since) VALUES (1, '2026-10-01')`;
  await createUser('super@club.es', 'superadministrator');
  await createUser('junta@club.es');
  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  const carlos = await newTeacher(admin, 'Carlos Ruiz Márquez');
  const group = await newGroup(admin, carlos, {
    name: 'Martes 19:00',
    days: ['tue'],
    start: '19:00',
    end: '20:00',
    classroom: 'caballo',
  });
  const created = await admin.json('POST', '/api/admin/students', {
    fullName: 'Pablo Gil Ruiz',
    groupIds: [],
  });
  const student = body<{ id: string }>(created).id;
  await admin.json('POST', `/api/admin/students/${student}/enrolments`, {
    groupId: group,
  });
  await createUser('carlos@club.es', 'teacher');
  await db()`UPDATE identity_user SET teacher_id = ${carlos},
               teacher_linked_at = '2026-10-01T00:00:00+02:00' WHERE email = 'carlos@club.es'`;
  const superadmin = new ApiClient();
  await superadmin.logIn('super@club.es');
  return { admin, superadmin, carlos, group, student };
}

const sessionsOf = async (group: string) =>
  (await db()`SELECT session_date::text AS day FROM payroll_session
                WHERE group_id = ${group} ORDER BY session_date`).map((r) => r.day as string);

Deno.test('superadministration should take the roll call of any class any day and record its hours', async () => {
  const { admin, superadmin, carlos, group, student } = await atTime(
    '2026-10-01T10:00:00+02:00',
    fixture,
  );
  await atTime('2026-11-20T09:00:00+01:00', async () => {
    await superadmin.logIn('super@club.es');
    await admin.logIn('junta@club.es');
    // Nadie ha confirmado la clase del 6: sale en el aviso y no tiene horas.
    assertEquals(await sessionsOf(group), []);
    const pending = () =>
      admin.get('/api/admin/attendance/pending').then((r) =>
        body<{ items: { date: string }[] }>(r).items.map((i) => i.date)
      );
    assertEquals((await pending()).includes('2026-10-06'), true);

    const url = (date: string) => `/api/admin/roll-calls/${group}/${date}`;
    const opened = await superadmin.get(url('2026-10-13'));
    assertEquals(opened.status, 200, JSON.stringify(opened.body));
    const view = body<{ teacher: { name: string }; list: { id: string; present: boolean }[] }>(
      opened,
    );
    assertEquals([view.teacher.name, view.list], ['Carlos Ruiz Márquez', [
      { id: student, present: false, name: 'Pablo Gil Ruiz' },
    ]]);

    // Pasa la del 6 y la del 13 (dos veces): se apuntan, sin duplicar.
    for (const date of ['2026-10-06', '2026-10-13', '2026-10-13']) {
      const taken = await superadmin.json('PUT', url(date), { absent: [student], guests: [] });
      assertEquals(taken.status, 204, JSON.stringify(taken.body));
    }
    assertEquals(await sessionsOf(group), ['2026-10-06', '2026-10-13']);
    assertEquals((await pending()).includes('2026-10-06'), false, 'deja de salir en el aviso');
    const [roll] =
      await db()`SELECT kind, taken_by_teacher::text AS teacher FROM attendance_roll_call
                                WHERE group_id = ${group} AND roll_date = '2026-10-13'`;
    assertEquals([roll?.kind, roll?.teacher], ['taken', carlos]);

    // Con la liquidación de octubre pagada, la lista se guarda pero las horas no se tocan.
    await db()`INSERT INTO payroll_settlement (teacher_id, month, minutes, rate_cents, amount_cents, lines, paid_on)
               VALUES (${carlos}, '2026-10', 120, 1500, 3000, '[]', '2026-11-05')`;
    assertEquals((await superadmin.json('PUT', url('2026-10-20'), { absent: [] })).status, 204);
    assertEquals(await sessionsOf(group), ['2026-10-06', '2026-10-13']);

    assertError(await superadmin.get(url('2026-10-14')), 404, 'not_found');
    assertError(
      await superadmin.json('PUT', url('2026-11-24'), { absent: [] }),
      409,
      'roll_call_not_open',
    );
    assertError(await admin.get(url('2026-10-13')), 403, 'forbidden');
    assertError(await admin.json('PUT', url('2026-10-13'), { absent: [] }), 403, 'forbidden');
  });
});

Deno.test('a teacher should see the classes whose roll call is overdue until taking it late', async () => {
  const { admin, group, student } = await atTime('2026-10-01T10:00:00+02:00', fixture);
  await atTime('2026-10-14T12:00:00+02:00', async () => {
    await admin.logIn('junta@club.es');
    // Salen del horario: no hace falta que las clases estén apuntadas en las horas.
    const teacher = new ApiClient();
    await teacher.logIn('carlos@club.es');
    const overdue = async () =>
      body<
        { items: { groupId: string; date: string; label: string; start: string; end: string }[] }
      >(
        await teacher.get('/api/teacher/overdue-roll-calls'),
      ).items;

    // La del 13 (ayer) aún está en plazo: solo sale la del 6.
    assertEquals(await overdue(), [{
      groupId: group,
      date: '2026-10-06',
      label: 'Martes 19:00',
      start: '19:00',
      end: '20:00',
    }]);

    // La pasa tarde (confirmándolo) y deja de salir.
    const taken = await teacher.json('PUT', `/api/teacher/roll-calls/${group}/2026-10-06`, {
      absent: [student],
      guests: [],
      past: true,
    });
    assertEquals(taken.status, 204, JSON.stringify(taken.body));
    assertEquals(await overdue(), []);
    // Administración no la ve.
    assertEquals((await admin.get('/api/teacher/overdue-roll-calls')).status, 403);
  });
});
