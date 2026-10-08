import { assertEquals } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, db, resetDatabase } from '../support/http.ts';

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
