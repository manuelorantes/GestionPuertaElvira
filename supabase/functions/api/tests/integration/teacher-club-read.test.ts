import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, db, resetDatabase } from '../support/http.ts';

const body = <T>(response: { body: unknown }) => response.body as T;

/** Lucía (profesorado) y un grupo de Carlos con Martina, que no es alumna de Lucía. */
async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  const lucia = await newTeacher(admin, 'Lucía Moreno Gil');
  const group = await newGroup(admin, await newTeacher(admin, 'Carlos Ruiz Márquez'), {
    name: 'Adultos I',
    days: ['tue'],
    start: '19:00',
    end: '20:30',
    classroom: 'caballo',
  });
  const created = await admin.json('POST', '/api/admin/students', {
    fullName: 'Martina López Herrera',
    groupIds: [group],
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  await createUser('profe@club.es', 'teacher');
  await db()`UPDATE identity_user SET teacher_id = ${lucia} WHERE email = 'profe@club.es'`;
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  return { teacher, group, martina: body<{ id: string }>(created).id };
}

Deno.test('teachers should read the classes and any student of the club, payments included', async () => {
  const { teacher, group, martina } = await fixture();
  const month = new Date().toISOString().slice(0, 7);

  const groups = body<{ items: { id: string; teacher: { fullName: string } }[] }>(
    await teacher.get('/api/admin/groups'),
  ).items;
  assertEquals(groups.map((g) => [g.id, g.teacher.fullName]), [[group, 'Carlos Ruiz Márquez']]);
  const readable = [
    `/api/admin/groups/${group}`,
    '/api/admin/students',
    `/api/admin/students/${martina}`,
    `/api/admin/students/${martina}/attendance`,
    `/api/admin/students/${martina}/class-comments`,
    `/api/admin/attendance/groups/${group}?month=${month}`,
    `/api/admin/attendance/groups/${group}/comments?month=${month}`,
    `/api/admin/billing/accounts/${martina}`,
    `/api/admin/billing/payments?studentId=${martina}`,
    `/api/admin/equipment/orders?studentId=${martina}`,
  ];
  for (const path of readable) {
    const response = await teacher.get(path);
    assertEquals(response.status, 200, `${path}: ${JSON.stringify(response.body)}`);
  }
  assertEquals(
    body<{ fullName: string }>(await teacher.get(`/api/admin/students/${martina}`)).fullName,
    'Martina López Herrera',
  );
});

Deno.test('teachers should not change the club data nor see the teachers rates or the club accounts', async () => {
  const { teacher, group, martina } = await fixture();

  for (
    const path of [
      '/api/admin/teachers',
      '/api/admin/students/pending-data',
      '/api/admin/billing/charges?month=2026-10&kind=monthly',
      '/api/admin/billing/settings',
      '/api/admin/equipment/margins',
      '/api/admin/payroll/settlements',
      '/api/admin/attendance/pending',
      '/api/admin/dashboard',
    ]
  ) {
    assertError(await teacher.get(path), 403, 'forbidden');
  }
  assertError(
    await teacher.json('POST', '/api/admin/students', { fullName: 'Nuevo', groupIds: [] }),
    403,
    'forbidden',
  );
  assertError(
    await teacher.json('PUT', `/api/admin/students/${martina}`, { fullName: 'Otro' }),
    403,
    'forbidden',
  );
  assertError(
    await teacher.json('POST', `/api/admin/students/${martina}/enrolments`, {
      groupId: group,
      attendance: null,
    }),
    403,
    'forbidden',
  );
  assertError(
    await teacher.json('POST', `/api/admin/attendance/groups/${group}/comments`, {
      date: '2026-10-06',
      studentId: null,
      text: 'Hola',
    }),
    403,
    'forbidden',
  );
});
