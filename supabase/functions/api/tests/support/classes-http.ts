import { assertEquals } from '@std/assert';

import type { ApiClient } from './http.ts';

export async function newTeacher(client: ApiClient, name = 'Lucía Moreno Gil'): Promise<string> {
  const response = await client.json('POST', '/api/admin/teachers', { fullName: name });
  assertEquals(response.status, 201);
  return (response.body as { id: string }).id;
}

export function groupPayload(teacherId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Iniciación A',
    level: 'beginner',
    teacherId,
    days: ['mon', 'wed'],
    start: '17:00',
    end: '18:00',
    classroom: 1,
    capacity: 12,
    ...overrides,
  };
}

export async function newGroup(
  client: ApiClient,
  teacherId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await client.json(
    'POST',
    '/api/admin/groups',
    groupPayload(teacherId, overrides),
  );
  assertEquals(response.status, 201, JSON.stringify(response.body));
  return (response.body as { id: string }).id;
}
