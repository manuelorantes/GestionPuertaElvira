import { assertEquals } from '@std/assert';

import { LocalDate } from '../../src/domain/common/mod.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';

interface Fixture {
  client: ApiClient;
  groupA: string;
  groupB: string;
  tiny: string;
}

async function fixture(): Promise<Fixture> {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const teacher = await newTeacher(client);
  return {
    client,
    groupA: await newGroup(client, teacher, {
      name: 'Iniciación A',
      days: ['mon', 'wed'],
      start: '17:00',
      end: '18:00',
      classroom: 'alfil',
      capacity: 12,
    }),
    groupB: await newGroup(client, teacher, {
      name: 'Particular',
      days: ['fri'],
      start: '17:30',
      end: '19:00',
      classroom: 'caballo',
      capacity: 2,
    }),
    tiny: await newGroup(client, teacher, {
      name: 'Peques B',
      days: ['tue'],
      start: '16:00',
      end: '17:00',
      classroom: 'caballo',
      capacity: 1,
    }),
  };
}

const body = <T>(response: { body: unknown }) => response.body as T;

function student(fx: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Martina López Herrera',
    birthDate: '2014-03-12',
    nationalId: '12345678Z',
    contactEmail: 'familia@ejemplo.com',
    guardians: [{ name: 'Rocío Herrera', phone: '612481930' }],
    ownPhone: null,
    federationLicence: 'AND-20417',
    imageConsent: true,
    groupIds: [fx.groupA],
    ...overrides,
  };
}

async function register(fx: Fixture, overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await fx.client.json('POST', '/api/admin/students', student(fx, overrides));
  assertEquals(response.status, 201, JSON.stringify(response.body));
  return (response.body as { id: string }).id;
}

const items = (body: unknown) => (body as { items: Record<string, unknown>[] }).items;

Deno.test('students should be registered, listed with search and shown in detail', async () => {
  const fx = await fixture();
  const id = await register(fx, { groupIds: [fx.groupA, fx.groupB] });

  const list = await fx.client.get('/api/admin/students?q=lopez&filter=active');
  assertEquals(list.status, 200);
  assertEquals((list.body as { total: number }).total, 1);
  const first = items(list.body)[0];
  assertEquals(first?.fullName, 'Martina López Herrera');
  assertEquals((first?.groups as { name: string }[]).map((g) => g.name), [
    'Iniciación A',
    'Particular',
  ]);
  assertEquals(first?.hasSiblings, false);

  const detail = (await fx.client.get(`/api/admin/students/${id}`)).body as Record<string, unknown>;
  assertEquals(detail.birthDate, '2014-03-12');
  assertEquals(detail.guardians, [{ name: 'Rocío Herrera', phone: '612 48 19 30' }]);
  assertEquals(detail.federationLicence, 'AND-20417');
  assertEquals(detail.status, 'active');
  assertEquals((detail.groups as { teacherName: string }[])[0]?.teacherName, 'Lucía Moreno Gil');
});

Deno.test('students need only a name; what is missing shows up in pending data and members without classes are listed', async () => {
  const fx = await fixture();
  const created = await fx.client.json('POST', '/api/admin/students', {
    fullName: 'Socio Sin Clases',
    guardians: [{ name: 'Tutor Sin Teléfono' }],
    groupIds: [],
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const id = (created.body as { id: string }).id;
  const detail = body<Record<string, unknown>>(await fx.client.get(`/api/admin/students/${id}`));
  assertEquals(detail.birthDate, null);
  assertEquals(detail.age, null);
  assertEquals(detail.guardians, [{ name: 'Tutor Sin Teléfono', phone: null }]);
  assertEquals(detail.missingData, ['birth_date', 'guardian_phone', 'email']);
  assertEquals(
    body<{ member: boolean }>(await fx.client.get(`/api/admin/billing/accounts/${id}`)).member,
    true,
    'sin clases, es socio',
  );

  const pending = body<{ items: Record<string, unknown>[] }>(
    await fx.client.get('/api/admin/students/pending-data'),
  ).items;
  assertEquals(pending, [{
    id,
    fullName: 'Socio Sin Clases',
    missing: ['birth_date', 'guardian_phone', 'email'],
  }]);

  const complete = await fx.client.json('POST', '/api/admin/students', student(fx));
  assertEquals(complete.status, 201);
  const noClasses = body<{ items: { id: string }[] }>(
    await fx.client.get('/api/admin/students?filter=no_classes'),
  ).items;
  assertEquals(noClasses.map((s) => s.id), [id]);
  assertEquals(
    body<{ items: unknown[] }>(await fx.client.get('/api/admin/students/pending-data')).items
      .length,
    1,
  );
});

Deno.test('students should need confirmation when the group is full, leaving no trace of the failed registration', async () => {
  const fx = await fixture();
  await register(fx, { fullName: 'Mateo Cano Robles', groupIds: [fx.tiny] });

  const full = await fx.client.json(
    'POST',
    '/api/admin/students',
    student(fx, { groupIds: [fx.tiny] }),
  );
  assertError(full, 409, 'group_full');
  assertEquals((full.body as { error: { details: unknown } }).error.details, {
    occupied: 1,
    capacity: 1,
  });
  assertEquals(
    ((await fx.client.get('/api/admin/students')).body as { total: number }).total,
    1,
    'El alta fallida no deja rastro',
  );

  await register(fx, { groupIds: [fx.tiny], confirmOverCapacity: true });
});

Deno.test('students should add, move and remove groups keeping at least one', async () => {
  const fx = await fixture();
  const id = await register(fx);
  assertEquals(
    (await fx.client.json('POST', `/api/admin/students/${id}/enrolments`, { groupId: fx.groupB }))
      .status,
    204,
  );
  assertEquals(
    (await fx.client.json('POST', `/api/admin/students/${id}/enrolments/${fx.groupB}/move`, {
      toGroupId: fx.tiny,
    })).status,
    204,
  );
  assertEquals(
    (await fx.client.json('DELETE', `/api/admin/students/${id}/enrolments/${fx.tiny}`)).status,
    204,
  );
  assertError(
    await fx.client.json('DELETE', `/api/admin/students/${id}/enrolments/${fx.groupA}`),
    409,
    'last_enrolment',
  );
  assertError(
    await fx.client.json('DELETE', `/api/admin/students/${id}/enrolments/${fx.tiny}`),
    404,
    'not_enrolled',
  );

  const group = (await fx.client.get(`/api/admin/groups/${fx.groupA}`)).body as {
    students: unknown[];
    occupied: number;
  };
  assertEquals(group.students, [{ id, fullName: 'Martina López Herrera', age: 12 }]);
  assertEquals(group.occupied, 1);
});

Deno.test('students should be updated, withdrawn and linked as siblings', async () => {
  const fx = await fixture();
  const martina = await register(fx);
  const pablo = await register(fx, { fullName: 'Pablo López Herrera' });

  assertEquals(
    (await fx.client.json(
      'PUT',
      `/api/admin/students/${martina}`,
      student(fx, { fullName: 'Martina López' }),
    )).status,
    204,
  );
  assertEquals(
    (await fx.client.json('POST', `/api/admin/students/${martina}/siblings`, { siblingId: pablo }))
      .status,
    204,
  );
  assertEquals(
    ((await fx.client.get(`/api/admin/students/${pablo}`)).body as { siblings: unknown }).siblings,
    [{ id: martina, fullName: 'Martina López' }],
  );
  assertEquals(items((await fx.client.get('/api/admin/students?filter=siblings')).body).length, 2);
  assertEquals(
    (await fx.client.json('DELETE', `/api/admin/students/${pablo}/siblings/${martina}`)).status,
    204,
  );

  const today = LocalDate.fromInstant(new Date()).toString();
  assertEquals(
    (await fx.client.json('POST', `/api/admin/students/${martina}/withdrawal`, { date: today }))
      .status,
    204,
  );
  assertEquals(
    items((await fx.client.get('/api/admin/students?filter=withdrawn')).body).map((s) =>
      s.fullName
    ),
    ['Martina López'],
  );
  assertEquals(
    ((await fx.client.get(`/api/admin/groups/${fx.groupA}`)).body as { occupied: number }).occupied,
    1,
  );
  assertError(
    await fx.client.json('POST', `/api/admin/students/${pablo}/withdrawal`, { date: '2020-01-01' }),
    422,
    'unprocessable',
  );
});

Deno.test('students should answer not found and forbid teachers', async () => {
  const fx = await fixture();
  assertError(
    await fx.client.get('/api/admin/students/01990000-0000-7000-8000-000000000000'),
    404,
    'not_found',
  );
  assertError(
    await fx.client.json(
      'PUT',
      '/api/admin/students/01990000-0000-7000-8000-000000000000',
      student(fx),
    ),
    404,
    'not_found',
  );
  await createUser('profe@club.es', 'teacher');
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  assertError(await teacher.get('/api/admin/students'), 403, 'forbidden');
});
