import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import { newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

async function superadmin(): Promise<ApiClient> {
  await resetDatabase();
  await createUser('junta@club.es', 'superadministrator');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  return client;
}

const items = (body: unknown) => (body as { items: Record<string, unknown>[] }).items;

async function actions(client: ApiClient): Promise<Record<string, unknown>[]> {
  const response = await client.get('/api/admin/audit/actions');
  assertEquals(response.status, 200);
  return items(response.body);
}

async function latestId(client: ApiClient): Promise<string> {
  return String((await actions(client))[0]?.id);
}

async function teacher(client: ApiClient, name: string): Promise<Record<string, unknown> | null> {
  return items((await client.get('/api/admin/teachers')).body).find((t) => t.fullName === name) ??
    null;
}

const rename = (client: ApiClient, id: string, name: string, rate: string) =>
  client.json('PUT', `/api/admin/teachers/${id}`, {
    fullName: name,
    active: true,
    hourlyRate: rate,
  });

Deno.test('audit should be reserved to superadministrators', async () => {
  await superadmin();
  await createUser('admin@club.es');
  const admin = new ApiClient();
  await admin.logIn('admin@club.es');
  assertError(await admin.get('/api/admin/audit/actions'), 403, 'forbidden');
  assertError(
    await admin.json('POST', '/api/admin/audit/actions/01990000-0000-7000-8000-000000000000/undo'),
    403,
    'forbidden',
  );
  assertEquals((await admin.get('/api/admin/students?filter=all')).status, 200);
});

Deno.test('audit should record who did each action with a field by field detail', async () => {
  const client = await superadmin();
  const id = await newTeacher(client, 'Lucía Moreno Gil');
  await rename(client, id, 'Lucía Moreno Gil', '18');

  const list = await actions(client);
  assertEquals(list[0]?.label, 'Editar profesor');
  assertEquals(list[0]?.affected, ['Profesor']);
  assertEquals(list[1]?.label, 'Crear profesor');
  assert(list[0]?.userName !== 'Sistema');
  assert(list.some((a) => a.label === 'Inicio de sesión'));
  assertStringIncludes(String(list[0]?.occurredAt), 'T');

  const detail = (await client.get(`/api/admin/audit/actions/${list[0]?.id}`)).body as {
    changes: Record<string, unknown>[];
    action: Record<string, unknown>;
  };
  assertEquals(detail.changes[0]?.operation, 'U');
  assertEquals(detail.changes[0]?.fields, [{
    field: 'hourly_rate_cents',
    before: 1500,
    after: 1800,
  }]);
  assertEquals(detail.action.id, list[0]?.id);
  assertError(
    await client.get('/api/admin/audit/actions/01990000-0000-7000-8000-000000000000'),
    404,
    'not_found',
  );
});

Deno.test('audit should undo an action unless a later one touched the same records', async () => {
  const client = await superadmin();
  const id = await newTeacher(client, 'Carlos Ruiz Márquez');
  const create = await latestId(client);
  await rename(client, id, 'Carlos Ruiz Márquez', '20');
  const edit = await latestId(client);

  assertError(
    await client.json('POST', `/api/admin/audit/actions/${create}/undo`),
    409,
    'undo_conflict',
  );
  assertEquals((await client.json('POST', `/api/admin/audit/actions/${edit}/undo`)).status, 204);
  assertEquals((await teacher(client, 'Carlos Ruiz Márquez'))?.hourlyRate, '15.00');
  assertEquals((await actions(client))[0]?.label, 'Deshacer: Editar profesor');
  assertError(
    await client.json('POST', `/api/admin/audit/actions/${edit}/undo`),
    409,
    'undo_conflict',
  );
});

Deno.test('audit should go back to any point and undo the restore itself', async () => {
  const client = await superadmin();
  const first = await newTeacher(client, 'Ana Belén Torres');
  const point = await latestId(client);
  await newTeacher(client, 'Javier Ortega Sánchez');
  await rename(client, first, 'Ana Belén Torres', '16');

  const restored = await client.json('POST', `/api/admin/audit/actions/${point}/restore`);
  assertEquals((restored.body as { reverted: number }).reverted, 2);
  assertEquals(await teacher(client, 'Javier Ortega Sánchez'), null);
  assertEquals((await teacher(client, 'Ana Belén Torres'))?.hourlyRate, '15.00');
  const restore = (await actions(client))[0];
  assert(String(restore?.label).startsWith('Volver al punto: Crear profesor'));
  assertEquals(restore?.kind, 'restore');

  assertEquals(
    (await client.json('POST', `/api/admin/audit/actions/${await latestId(client)}/undo`)).status,
    204,
  );
  assert((await teacher(client, 'Javier Ortega Sánchez')) !== null);
  assertEquals((await teacher(client, 'Ana Belén Torres'))?.hourlyRate, '16.00');
  assertError(
    await client.json('POST', `/api/admin/audit/actions/${await latestId(client)}/restore`),
    409,
    'nothing_to_undo',
  );
});

Deno.test('audit should record failed logins, list people and filter by them', async () => {
  const client = await superadmin();
  await new ApiClient().logIn('nadie@club.es', 'incorrecta-123');
  const list = await actions(client);
  assert(list.some((a) => a.label === 'Intento de acceso fallido'));
  const people = ((await client.get('/api/admin/audit/actions')).body as {
    people: { id: string; name: string }[];
  }).people;
  assertEquals(people.map((p) => p.name), ['Lucía Moreno Gil']);
  const filtered = items(
    (await client.get(`/api/admin/audit/actions?userId=${people[0]?.id}&before=${list[0]?.seq}`))
      .body,
  );
  assert(filtered.every((a) => a.userId === people[0]?.id));
  assert(filtered.every((a) => Number(a.seq) < Number(list[0]?.seq)));
});

Deno.test('audit should say where each change can be seen in the app', async () => {
  const client = await superadmin();
  const teacherId = await newTeacher(client, 'Lucía Moreno Gil');
  const created = await client.json('POST', '/api/admin/students', {
    fullName: 'Martina López Herrera',
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const studentId = (created.body as { id: string }).id;

  const detail = async () =>
    (await client.get(`/api/admin/audit/actions/${await latestId(client)}`)).body as {
      changes: { table: string; target: Record<string, unknown> | null }[];
    };
  const student = (await detail()).changes.find((c) => c.table === 'students_student');
  assertEquals(student?.target, { kind: 'student', id: studentId });

  await rename(client, teacherId, 'Lucía Moreno', '16');
  const teacherChange = (await detail()).changes.find((c) => c.table === 'teachers_teacher');
  assertEquals(teacherChange?.target, { kind: 'teacher', id: teacherId });
});
