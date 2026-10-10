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
  name: 'a linked teacher should see their classes of the week and their pay, and nothing else',
  ignore: outsideSeason,
  async fn() {
    const { admin, teacher, lucia } = await fixture();

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

interface GroupItem {
  groupId: string;
  name: string;
  substitution: boolean;
  students: { name: string; days: string[]; attended: number; classes: number }[];
}

Deno.test('a teacher should see in their groups what was commented on Thursday when Tuesday comes', async () => {
  // Jueves 1 de octubre de 2026: Lucía da martes y jueves; el martes 13 sustituye a Carlos.
  const { teacher, mine, carlos } = await atTime('2026-10-01T16:00:00+02:00', async () => {
    await resetDatabase();
    await createUser('junta@club.es');
    const admin = new ApiClient();
    await admin.logIn('junta@club.es');
    const lucia = await newTeacher(admin, 'Lucía Moreno Gil');
    const mine = await newGroup(admin, lucia, {
      name: 'Martes y jueves 17:00',
      days: ['tue', 'thu'],
      start: '17:00',
      end: '18:00',
      classroom: 'alfil',
    });
    const carlos = await newGroup(admin, await newTeacher(admin, 'Carlos Ruiz Márquez'), {
      name: 'Adultos I',
      days: ['tue'],
      start: '19:00',
      end: '20:30',
      classroom: 'caballo',
    });
    for (const fullName of ['Martina López Herrera', 'Pablo Gil Ruiz']) {
      const created = await admin.json('POST', '/api/admin/students', {
        fullName,
        groupIds: [mine],
      });
      assertEquals(created.status, 201, JSON.stringify(created.body));
    }
    const planned = await admin.json('POST', '/api/admin/payroll/substitutions', {
      groupId: carlos,
      date: '2026-10-13',
      teacherId: lucia,
    });
    assertEquals(planned.status, 201, JSON.stringify(planned.body));
    await createUser('profe@club.es', 'teacher');
    await db()`UPDATE identity_user SET teacher_id = ${lucia} WHERE email = 'profe@club.es'`;
    const teacher = new ApiClient();
    await teacher.logIn('profe@club.es');
    return { teacher, mine, carlos };
  });
  const roll = `/api/teacher/roll-calls/${mine}/2026-10-01`;

  await atTime('2026-10-01T18:00:00+02:00', async () => {
    await teacher.logIn('profe@club.es');
    const opened = await teacher.get(roll);
    assertEquals(opened.status, 200, JSON.stringify(opened.body));
    const list = body<{ list: { id: string; name: string }[] }>(opened).list;
    const pablo = list.find((s) => s.name === 'Pablo Gil Ruiz')?.id;
    assertEquals((await teacher.json('PUT', roll, { absent: [pablo], guests: [] })).status, 204);
    for (
      const [studentId, text] of [[null, 'Hemos dado mates de torres'], [pablo, 'No ha venido']]
    ) {
      assertEquals(
        (await teacher.json('POST', `${roll}/comments`, { studentId, text })).status,
        201,
      );
    }
  });

  await atTime('2026-10-06T16:00:00+02:00', async () => {
    await teacher.logIn('profe@club.es');
    const groups = body<{ items: GroupItem[] }>(await teacher.get('/api/teacher/groups')).items;
    assertEquals(groups.map((g) => [g.groupId, g.substitution]), [[mine, false], [carlos, true]]);
    assertEquals(groups[0]?.students.map((s) => [s.name, s.attended, s.classes]), [
      ['Martina López Herrera', 1, 1],
      ['Pablo Gil Ruiz', 0, 1],
    ]);

    const comments = body<
      { items: { date: string; studentName: string | null; text: string }[]; nextBefore: string }
    >(
      await teacher.get(`/api/teacher/groups/${mine}/comments`),
    );
    assertEquals(comments.items.map((c) => [c.date, c.studentName, c.text]), [
      // Escritos en el mismo momento: en el orden en que se escribieron.
      ['2026-10-01', null, 'Hemos dado mates de torres'],
      ['2026-10-01', 'Pablo Gil Ruiz', 'No ha venido'],
    ]);
    assertEquals(comments.nextBefore, '2026-09-08');

    const october = body<{ days: { date: string; status: string }[] }>(
      await teacher.get(`/api/teacher/groups/${mine}/attendance?month=2026-10`),
    );
    assertEquals(october.days.map((d) => [d.date, d.status]), [
      ['2026-10-01', 'taken'],
      ['2026-10-06', 'pending'],
    ]);
  });

  // Una semana después de sustituir a Carlos ya no ve su grupo.
  await atTime('2026-10-21T10:00:00+02:00', async () => {
    await teacher.logIn('profe@club.es');
    const groups = body<{ items: GroupItem[] }>(await teacher.get('/api/teacher/groups')).items;
    assertEquals(groups.map((g) => g.groupId), [mine]);
    assertError(await teacher.get(`/api/teacher/groups/${carlos}/comments`), 404, 'not_found');
    assertError(
      await teacher.get(`/api/teacher/groups/${carlos}/attendance?month=2026-10`),
      404,
      'not_found',
    );
  });
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
  const { admin, teacher, group, other, ids, pablo } = await atTime(TUESDAY_EVENING, async () => {
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
    // Lola es del grupo de Carlos: vendrá a recuperar a la clase de Lucía (asistencia especial).
    const lola = await admin.json('POST', '/api/admin/students', {
      fullName: 'Lola Ruiz Pardo',
      groupIds: [other],
    });
    ids.push(body<{ id: string }>(lola).id);
    await createUser('profe@club.es', 'teacher');
    await db()`UPDATE identity_user SET teacher_id = ${lucia} WHERE email = 'profe@club.es'`;
    const teacher = new ApiClient();
    await teacher.logIn('profe@club.es');
    return { admin, teacher, group, other, ids, pablo: ids[1] ?? '' };
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
    // Sin pasar, nadie está marcado.
    assertEquals(await list(), [['Martina López Herrera', false], ['Pablo Gil Ruiz', false]]);

    // Antes de pasarla no hay horas; al pasarla se apuntan ya (sin esperar a la noche), una sola vez.
    const hours = async () =>
      body<{ items: { date: string; minutes: number }[] }>(
        await admin.get('/api/admin/payroll/sessions?month=2026-10'),
      ).items.map((s) => [s.date, s.minutes]);
    assertEquals(await hours(), []);
    assertEquals((await teacher.json('PUT', url, { absent: [pablo] })).status, 204);
    assertEquals((await teacher.json('PUT', url, { absent: [pablo] })).status, 204);
    assertEquals(await hours(), [['2026-10-13', 60]]);
    assertEquals(await list(), [['Martina López Herrera', true], ['Pablo Gil Ruiz', false]]);
    // En la ficha de Pablo: una clase con lista, y la faltó.
    assertEquals(body(await admin.get(`/api/admin/students/${pablo}/attendance`)), {
      season: 2026,
      classes: 1,
      absences: [{ date: '2026-10-13', label: 'Martes 17:00' }],
      specials: [],
      attended: 0,
    });
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
    // Una lista pasada se cambia confirmándolo: Lola vino a recuperar (asistencia especial).
    const lola = ids[2] ?? '';
    const opened = body<{ period: string; others: { name: string }[] }>(await teacher.get(url));
    assertEquals([opened.period, opened.others.map((o) => o.name)], ['past', ['Lola Ruiz Pardo']]);
    assertEquals(
      (await teacher.json('PUT', url, { absent: [], guests: [lola], past: true })).status,
      204,
    );
    assertEquals(
      body<{ guests: { name: string }[] }>(await teacher.get(url)).guests.map((g) => g.name),
      ['Lola Ruiz Pardo'],
    );
    assertError(
      await teacher.json('PUT', url, { absent: [], guests: [pablo], past: true }),
      422,
      'unprocessable',
    );
    // Administración ve la asistencia del grupo en el mes: martes 6 sin lista (aún no estaban) y martes 13.
    await admin.logIn('junta@club.es');
    assertEquals(body(await admin.get(`/api/admin/attendance/groups/${group}?month=2026-10`)), {
      groupId: group,
      name: 'Martes 17:00',
      month: '2026-10',
      days: [{ date: '2026-10-06', status: 'pending' }, { date: '2026-10-13', status: 'taken' }],
      students: [
        {
          id: lola,
          name: 'Lola Ruiz Pardo',
          marks: [null, 'special'],
          attended: 0,
          classes: 0,
          member: false,
        },
        {
          id: ids[0],
          name: 'Martina López Herrera',
          marks: [null, 'present'],
          attended: 1,
          classes: 1,
          member: true,
        },
        {
          id: pablo,
          name: 'Pablo Gil Ruiz',
          marks: [null, 'present'],
          attended: 1,
          classes: 1,
          member: true,
        },
      ],
    });
    // En la ficha de Lola, aparte de sus clases.
    assertEquals(
      body<{ specials: unknown[] }>(await admin.get(`/api/admin/students/${lola}/attendance`))
        .specials,
      [{ date: '2026-10-13', label: 'Martes 17:00' }],
    );
    assertError(
      await admin.get(
        '/api/admin/attendance/groups/01990000-0000-7000-8000-000000000000?month=2026-10',
      ),
      404,
      'not_found',
    );
    // La asistencia de cualquier grupo la consulta también el profesorado (Clases → Asistencia).
    assertEquals(
      (await teacher.get(`/api/admin/attendance/groups/${group}?month=2026-10`)).status,
      200,
    );
  });
});

Deno.test('administration should see the classes without a roll call once the deadline is over, and settle them', async () => {
  const { admin, teacher, lucia, carlos, ana, luciaGroup, carlosGroup, anaGroup } = await atTime(
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
      // Ana no tiene cuenta: no puede pasar lista y sus clases no avisan.
      const ana = await newTeacher(admin, 'Ana Belén Torres');
      const anaGroup = await newGroup(admin, ana, {
        name: 'Martes 16:00',
        days: ['tue'],
        start: '16:00',
        end: '17:00',
        classroom: 'peon',
      });
      // Las cuentas de Lucía y Carlos están vinculadas desde el día 1.
      for (const [email, teacherId] of [['profe@club.es', lucia], ['carlos@club.es', carlos]]) {
        await createUser(email ?? '', 'teacher');
        await db()`UPDATE identity_user SET teacher_id = ${teacherId ?? ''},
                     teacher_linked_at = '2026-10-01T00:00:00+02:00' WHERE email = ${email ?? ''}`;
      }
      const teacher = new ApiClient();
      await teacher.logIn('profe@club.es');
      return { admin, teacher, lucia, carlos, ana, luciaGroup, carlosGroup, anaGroup };
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
    await record(ana, anaGroup, '2026-10-13');
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
