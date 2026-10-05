import { assertEquals } from '@std/assert';

import { groupPayload, newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

async function admin(): Promise<ApiClient> {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  return client;
}

Deno.test('teachers should be created, listed, renamed and deactivated', async () => {
  const client = await admin();
  const id = await newTeacher(client, 'Carlos Ruiz Márquez');

  const update = await client.json('PUT', `/api/admin/teachers/${id}`, {
    fullName: 'Carlos Ruiz',
    active: false,
    hourlyRate: '18',
  });
  assertEquals(update.status, 204);
  const list = await client.get('/api/admin/teachers');
  assertEquals(list.status, 200);
  assertEquals(list.body, {
    items: [{ id, fullName: 'Carlos Ruiz', active: false, groupCount: 0, hourlyRate: '18.00' }],
  });
});

Deno.test('teachers with groups cannot be deactivated; administration is required', async () => {
  const client = await admin();
  const teacherId = await newTeacher(client);
  await newGroup(client, teacherId);
  assertError(
    await client.json('PUT', `/api/admin/teachers/${teacherId}`, {
      fullName: 'Lucía Moreno Gil',
      active: false,
    }),
    409,
    'teacher_has_groups',
  );
  assertEquals((await client.get('/api/admin/teachers')).body, {
    items: [{
      id: teacherId,
      fullName: 'Lucía Moreno Gil',
      active: true,
      groupCount: 1,
      hourlyRate: '15.00',
    }],
  });

  assertError(await new ApiClient().get('/api/admin/teachers'), 401, 'unauthorized');
  await createUser('profe@club.es', 'teacher');
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  assertError(await teacher.get('/api/admin/teachers'), 403, 'forbidden');
});

Deno.test('groups should be created and shown in the schedule, then updated', async () => {
  const client = await admin();
  const teacherId = await newTeacher(client);
  const id = await newGroup(client, teacherId);

  const list = await client.get('/api/admin/groups');
  assertEquals(list.body, {
    items: [{
      id,
      name: 'Iniciación A',
      level: 'beginner',
      teacher: { id: teacherId, fullName: 'Lucía Moreno Gil' },
      days: ['mon', 'wed'],
      start: '17:00',
      end: '18:00',
      slotLabel: 'Lun y Mié · 17:00–18:00',
      classroom: 'alfil',
      capacity: 12,
      occupied: 0,
      weeklyPlan: 'two_hours',
    }],
  });

  const update = await client.json(
    'PUT',
    `/api/admin/groups/${id}`,
    groupPayload(teacherId, { name: 'Iniciación A (tarde)', capacity: 10 }),
  );
  assertEquals(update.status, 204);
  const shown = await client.get(`/api/admin/groups/${id}`);
  assertEquals((shown.body as { name: string }).name, 'Iniciación A (tarde)');
  assertEquals((shown.body as { capacity: number }).capacity, 10);
  assertEquals((shown.body as { students: unknown[] }).students, []);
});

Deno.test('groups should reject classroom conflicts, invalid fields, unknown ids and teachers', async () => {
  const client = await admin();
  const teacherId = await newTeacher(client);
  await newGroup(client, teacherId, { name: 'Intermedio A', start: '17:30', end: '19:00' });

  const conflict = await client.json('POST', '/api/admin/groups', groupPayload(teacherId));
  assertError(conflict, 409, 'classroom_conflict');
  assertEquals(
    (conflict.body as { error: { details: { groupName: string } } }).error.details.groupName,
    'Intermedio A',
  );

  const invalid = await client.json(
    'POST',
    '/api/admin/groups',
    groupPayload(teacherId, { end: '16:30' }),
  );
  assertError(invalid, 422, 'unprocessable');
  assertEquals(
    (invalid.body as { error: { details: { field: string } } }).error.details.field,
    'end',
  );

  assertError(
    await client.get('/api/admin/groups/01990000-0000-7000-8000-000000000000'),
    404,
    'not_found',
  );
  assertError(
    await client.request('DELETE', `/api/admin/groups/${teacherId}`),
    405,
    'method_not_allowed',
  );

  await createUser('profe@club.es', 'teacher');
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  assertError(await teacher.get('/api/admin/groups'), 403, 'forbidden');
});
