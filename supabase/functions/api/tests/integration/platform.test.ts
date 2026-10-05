import { assertEquals, assertMatch } from '@std/assert';

import { ApiClient } from '../support/http.ts';

Deno.test('health should report the database and carry a request id', async () => {
  const response = await new ApiClient().get('/api/health');

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Content-Type'), 'application/json');
  assertEquals(response.body, { status: 'healthy', database: 'reachable' });
  assertMatch(response.headers.get('X-Request-Id') ?? '', /^[0-9a-f-]{36}$/);
});

Deno.test('unknown routes should answer a JSON error envelope', async () => {
  const response = await new ApiClient().get('/api/does-not-exist');

  assertEquals(response.status, 404);
  assertEquals(response.headers.get('Content-Type'), 'application/json');
  assertEquals(response.body, { error: { code: 'not_found', message: 'Recurso no encontrado.' } });
});

Deno.test('unsupported verbs on a known route should answer method not allowed', async () => {
  const response = await new ApiClient().request('DELETE', '/api/health');

  assertEquals(response.status, 405);
  assertEquals(response.body, {
    error: { code: 'method_not_allowed', message: 'Método no permitido.' },
  });
});
