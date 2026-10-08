import { assertEquals } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, db, resetDatabase } from '../support/http.ts';

const today = LocalDate.fromInstant(new Date());
// El lunes de la semana que viene (siempre en el futuro, así las inscripciones de hoy cuentan).
const monday = today.plusDays(8 - today.isoWeekday());
const day = (offset: number) => monday.plusDays(offset).toString();
const outsideSeason = Season.teachingSeason(YearMonth.of(monday.plusDays(6))) === null ||
  Season.teachingSeason(YearMonth.of(monday)) === null;

const body = <T>(response: { body: unknown }) => response.body as T;

/** Lucía da un grupo los lunes y miércoles; Carlos, uno los martes que el martes que viene da Lucía. */
async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  const lucia = await newTeacher(admin, 'Lucía Moreno Gil');
  const carlos = await newTeacher(admin, 'Carlos Ruiz Márquez');
  const groupA = await newGroup(admin, lucia, {
    name: 'Iniciación A',
    days: ['mon', 'wed'],
    start: '17:00',
    end: '18:00',
    classroom: 'alfil',
  });
  const groupB = await newGroup(admin, carlos, {
    name: 'Adultos I',
    days: ['tue'],
    start: '19:00',
    end: '20:30',
    classroom: 'caballo',
  });
  for (
    const [fullName, attendance] of [['Martina López Herrera', null], ['Pablo Gil Ruiz', {
      days: ['mon'],
    }]] as const
  ) {
    const created = await admin.json('POST', '/api/admin/students', { fullName, groupIds: [] });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    const id = body<{ id: string }>(created).id;
    const enrol = await admin.json('POST', `/api/admin/students/${id}/enrolments`, {
      groupId: groupA,
      attendance,
    });
    assertEquals(enrol.status, 204, JSON.stringify(enrol.body));
  }
  const planned = await admin.json('POST', '/api/admin/payroll/substitutions', {
    groupId: groupB,
    date: day(1),
    teacherId: lucia,
  });
  assertEquals(planned.status, 201, JSON.stringify(planned.body));

  await createUser('profe@club.es', 'teacher');
  await db()`UPDATE identity_user SET teacher_id = ${lucia} WHERE email = 'profe@club.es'`;
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  return { admin, teacher, lucia, groupA, groupB };
}

Deno.test({
  name:
    'a linked teacher should see their classes of the week and their students, and nothing else',
  ignore: outsideSeason,
  async fn() {
    const { admin, teacher, lucia, groupA } = await fixture();

    assertEquals(body(await teacher.get('/api/teacher/me')), {
      teacher: { id: lucia, name: 'Lucía Moreno Gil' },
    });

    const week = body<{ items: Record<string, unknown>[] }>(
      await teacher.get(`/api/teacher/classes?from=${day(0)}&to=${day(6)}`),
    ).items;
    assertEquals(
      week.map((c) => [c.date, c.label, c.start, c.classroom, c.students, c.substitution]),
      [
        [day(0), 'Iniciación A', '17:00', 'alfil', 2, false],
        [day(1), 'Adultos I', '19:00', 'caballo', 0, true],
        [day(2), 'Iniciación A', '17:00', 'alfil', 1, false],
      ],
    );

    const students = body<{ items: { groupId: string; students: Record<string, unknown>[] }[] }>(
      await teacher.get('/api/teacher/students'),
    ).items;
    assertEquals(students.map((g) => g.groupId), [groupA]);
    assertEquals(students[0]?.students, [
      { id: students[0]?.students[0]?.id, name: 'Martina López Herrera', days: ['mon', 'wed'] },
      { id: students[0]?.students[1]?.id, name: 'Pablo Gil Ruiz', days: ['mon'] },
    ]);

    // Sus horas y pagos de la temporada, sin ingresos ni márgenes del club.
    const pay = body<{ months: Record<string, unknown>[]; totals: Record<string, number> }>(
      await teacher.get('/api/teacher/pay'),
    );
    assertEquals(pay.months.at(-1)?.month, today.toString().slice(0, 7));
    assertEquals(pay.months.some((m) => 'incomeCents' in m || 'marginCents' in m), false);
    assertEquals(Object.keys(pay.totals), ['minutes', 'amountCents', 'receivedCents', 'owedCents']);

    // Nada de administración para el profesorado, ni del profesorado para administración.
    assertError(await teacher.get('/api/admin/payroll/settlements'), 403, 'forbidden');
    assertError(await admin.get('/api/teacher/classes'), 403, 'forbidden');
  },
});

Deno.test('an unlinked teacher account is told to ask administration', async () => {
  await resetDatabase();
  await createUser('profe@club.es', 'teacher');
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  assertError(await teacher.get('/api/teacher/classes'), 403, 'teacher_not_linked');
});

// Martes 13 de octubre de 2026 a las 18:00, al acabar la clase de Lucía de los martes.
const TUESDAY_EVENING = '2026-10-13T18:00:00+02:00';

Deno.test('a teacher should take the roll call of their class, all present by default, until the next day', async () => {
  const { teacher, group, other, pablo } = await atTime(TUESDAY_EVENING, async () => {
    await resetDatabase();
    await createUser('junta@club.es');
    const admin = new ApiClient();
    await admin.logIn('junta@club.es');
    const lucia = await newTeacher(admin, 'Lucía Moreno Gil');
    const group = await newGroup(admin, lucia, {
      name: 'Martes 17:00',
      days: ['tue'],
      start: '17:00',
      end: '18:00',
      classroom: 'alfil',
    });
    const other = await newGroup(admin, await newTeacher(admin, 'Carlos Ruiz Márquez'), {
      name: 'Martes 19:00',
      days: ['tue'],
      start: '19:00',
      end: '20:00',
      classroom: 'caballo',
    });
    const ids: string[] = [];
    for (const fullName of ['Martina López Herrera', 'Pablo Gil Ruiz']) {
      const created = await admin.json('POST', '/api/admin/students', {
        fullName,
        groupIds: [group],
      });
      assertEquals(created.status, 201, JSON.stringify(created.body));
      ids.push(body<{ id: string }>(created).id);
    }
    await createUser('profe@club.es', 'teacher');
    await db()`UPDATE identity_user SET teacher_id = ${lucia} WHERE email = 'profe@club.es'`;
    const teacher = new ApiClient();
    await teacher.logIn('profe@club.es');
    return { teacher, group, other, pablo: ids[1] ?? '' };
  });
  const url = `/api/teacher/roll-calls/${group}/2026-10-13`;

  const list = async () =>
    body<{ list: { id: string; name: string; present: boolean }[] }>(await teacher.get(url)).list
      .map((s) => [s.name, s.present]);

  await atTime(TUESDAY_EVENING, async () => {
    const today = body<{ items: { rollCall: string }[] }>(
      await teacher.get('/api/teacher/classes'),
    );
    assertEquals(today.items.map((c) => c.rollCall), ['open']);
    assertEquals(await list(), [['Martina López Herrera', true], ['Pablo Gil Ruiz', true]]);

    assertEquals((await teacher.json('PUT', url, { absent: [pablo] })).status, 204);
    assertEquals(await list(), [['Martina López Herrera', true], ['Pablo Gil Ruiz', false]]);
    const taken = body<{ items: { rollCall: string }[] }>(
      await teacher.get('/api/teacher/classes'),
    );
    assertEquals(taken.items.map((c) => c.rollCall), ['taken']);

    assertError(
      await teacher.json('PUT', url, { absent: ['01990000-0000-7000-8000-000000000000'] }),
      422,
      'unprocessable',
    );
    assertError(
      await teacher.json('PUT', `/api/teacher/roll-calls/${other}/2026-10-13`, { absent: [] }),
      404,
      'not_found',
    );
  });

  // Se corrige hasta el final del día siguiente; después, ya no (entrando de nuevo: la sesión caduca).
  await atTime('2026-10-14T23:30:00+02:00', async () => {
    await teacher.logIn('profe@club.es');
    assertEquals((await teacher.json('PUT', url, { absent: [] })).status, 204);
  });
  await atTime('2026-10-15T09:00:00+02:00', async () => {
    await teacher.logIn('profe@club.es');
    assertError(await teacher.json('PUT', url, { absent: [pablo] }), 409, 'roll_call_closed');
    assertEquals(await list(), [['Martina López Herrera', true], ['Pablo Gil Ruiz', true]]);
  });
});

Deno.test('administration should see the classes without a roll call once the deadline is over, and settle them', async () => {
  const { admin, teacher, lucia, carlos, luciaGroup, carlosGroup } = await atTime(
    TUESDAY_EVENING,
    async () => {
      await resetDatabase();
      await db()`INSERT INTO attendance_settings (id, since) VALUES (1, '2026-10-01')`;
      await createUser('junta@club.es');
      const admin = new ApiClient();
      await admin.logIn('junta@club.es');
      const lucia = await newTeacher(admin, 'Lucía Moreno Gil');
      const carlos = await newTeacher(admin, 'Carlos Ruiz Márquez');
      const luciaGroup = await newGroup(admin, lucia, {
        name: 'Martes 17:00',
        days: ['tue'],
        start: '17:00',
        end: '18:00',
        classroom: 'alfil',
      });
      const carlosGroup = await newGroup(admin, carlos, {
        name: 'Martes 19:00',
        days: ['tue'],
        start: '19:00',
        end: '20:00',
        classroom: 'caballo',
      });
      await createUser('profe@club.es', 'teacher');
      await db()`UPDATE identity_user SET teacher_id = ${lucia} WHERE email = 'profe@club.es'`;
      const teacher = new ApiClient();
      await teacher.logIn('profe@club.es');
      return { admin, teacher, lucia, carlos, luciaGroup, carlosGroup };
    },
  );
  const record = async (teacherId: string, groupId: string, date: string) => {
    const response = await admin.json('POST', '/api/admin/payroll/sessions', {
      teacherId,
      groupId,
      date,
      hours: 1,
    });
    assertEquals(response.status, 201, JSON.stringify(response.body));
    return body<{ id: string }>(response).id;
  };

  await atTime(TUESDAY_EVENING, async () => {
    await record(lucia, luciaGroup, '2026-10-13');
    await record(carlos, carlosGroup, '2026-10-13');
    await record(carlos, carlosGroup, '2026-10-06');
    // Lucía pasa su lista; Carlos no pasa ninguna.
    const taken = await teacher.json('PUT', `/api/teacher/roll-calls/${luciaGroup}/2026-10-13`, {
      absent: [],
    });
    assertEquals(taken.status, 204);
  });

  await atTime('2026-10-15T20:00:00+02:00', async () => {
    await admin.logIn('junta@club.es');
    const pending = body<{ items: { date: string; label: string; teacherName: string }[] }>(
      await admin.get('/api/admin/attendance/pending'),
    ).items;
    // La del martes 13 aún se puede pasar hasta el final del 14… y el 15 ya no: sale.
    assertEquals(pending.map((p) => [p.date, p.label, p.teacherName]), [
      ['2026-10-06', 'Martes 19:00', 'Carlos Ruiz Márquez'],
      ['2026-10-13', 'Martes 19:00', 'Carlos Ruiz Márquez'],
    ]);
    assertError(
      await admin.json(
        'POST',
        `/api/admin/attendance/pending/${carlosGroup}/2026-10-14/confirm`,
        {},
      ),
      409,
      'roll_call_still_open',
    );
  });

  await atTime('2026-10-16T09:00:00+02:00', async () => {
    await admin.logIn('junta@club.es');
    const pending = () =>
      admin.get('/api/admin/attendance/pending').then((r) =>
        body<{ items: { sessionId: string; date: string }[] }>(r).items
      );
    const [first] = await pending();
    // La del 6 no se dio: se quita su sesión. La del 13 sí: se da por buena.
    assertEquals(
      (await admin.json('DELETE', `/api/admin/payroll/sessions/${first?.sessionId}`, {})).status,
      204,
    );
    assertEquals(
      (await admin.json(
        'POST',
        `/api/admin/attendance/pending/${carlosGroup}/2026-10-13/confirm`,
        {},
      ))
        .status,
      204,
    );
    assertEquals(await pending(), []);
    await teacher.logIn('profe@club.es');
    assertError(await teacher.get('/api/admin/attendance/pending'), 403, 'forbidden');
  });
});
