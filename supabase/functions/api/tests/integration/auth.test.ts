import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import { SqlUserRepository } from '../../src/infrastructure/persistence/identity.ts';
import {
  ApiClient,
  assertError,
  createUser,
  db,
  errorMessage,
  PASSWORD,
  resetDatabase,
  userIn,
} from '../support/http.ts';

Deno.test('login should start a session cookie and return the user when credentials are valid', async () => {
  await resetDatabase();
  const user = await createUser('junta@club.es');
  const client = new ApiClient();

  const response = await client.logIn('Junta@Club.es');

  assertEquals(response.status, 200);
  assertEquals(response.body, {
    user: {
      id: user.id.value,
      fullName: 'Lucía Moreno Gil',
      email: 'junta@club.es',
      role: 'administrator',
      teacherId: null,
      mustChangePassword: false,
      impersonatedBy: null,
    },
  });
  const cookie = response.headers.getSetCookie()[0] ?? '';
  assertStringIncludes(cookie, 'pe_session=');
  assertStringIncludes(cookie, 'HttpOnly');
  assertStringIncludes(cookie, 'SameSite=Strict');
  assertStringIncludes(cookie, 'Path=/');
  assert(
    !/Expires=|Max-Age=/i.test(cookie),
    'Cookie de sesión del navegador, sin fecha de caducidad',
  );
});

Deno.test('login should answer a generic error when the password is wrong or the email unknown', async () => {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();

  const wrong = await client.logIn('junta@club.es', 'contraseña-incorrecta');
  assertError(wrong, 401, 'invalid_credentials');
  assertEquals(errorMessage(wrong), 'Email o contraseña incorrectos.');
  assertError(await client.logIn('nadie@club.es'), 401, 'invalid_credentials');
});

Deno.test('login should block further attempts after five failures', async () => {
  await resetDatabase();
  await createUser('bloqueo@club.es');
  const client = new ApiClient();
  for (let i = 0; i < 5; i++) await client.logIn('bloqueo@club.es', 'contraseña-incorrecta');

  const blocked = await client.logIn('bloqueo@club.es');

  assertError(blocked, 429, 'too_many_requests');
  assert(Number(blocked.headers.get('Retry-After')) > 0);
  const actions = await db()`SELECT label FROM audit_action ORDER BY seq`;
  assert(
    actions.some((a) => a.label === 'Intento de acceso fallido'),
    'el intento fallido queda en el historial',
  );
});

Deno.test('login should reject a body without the required fields and non-JSON requests', async () => {
  await resetDatabase();
  const client = new ApiClient();
  assertError(
    await client.json('POST', '/api/auth/login', { email: 'junta@club.es' }),
    422,
    'unprocessable',
  );
  const form = await client.request('POST', '/api/auth/login', {
    body: new URLSearchParams({ email: 'junta@club.es', password: PASSWORD }),
  });
  assertError(form, 415, 'unsupported_media_type');
});

Deno.test('me should require a session, forbid caching and reflect logout', async () => {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  assertError(await client.get('/api/auth/me'), 401, 'unauthorized');

  await client.logIn('junta@club.es');
  const me = await client.get('/api/auth/me');
  assertEquals(me.status, 200);
  assertEquals(userIn(me).email, 'junta@club.es');
  assertStringIncludes(me.headers.get('Cache-Control') ?? '', 'no-store');

  const logout = await client.json('POST', '/api/auth/logout');
  assertEquals(logout.status, 204);
  assertStringIncludes(logout.headers.getSetCookie()[0] ?? '', 'Max-Age=0');
  assertError(await client.get('/api/auth/me'), 401, 'unauthorized');
});

Deno.test('session should stop working on the next request when the account is disabled', async () => {
  await resetDatabase();
  const user = await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');

  user.disable();
  await new SqlUserRepository(db()).save(user);

  assertError(await client.get('/api/auth/me'), 401, 'unauthorized');
});

Deno.test('password change should work with the right current password and explain refusals', async () => {
  await resetDatabase();
  await createUser('junta@club.es', 'administrator', true);
  const client = new ApiClient();
  await client.logIn('junta@club.es');

  const mismatch = await client.json('PUT', '/api/auth/password', {
    currentPassword: 'otra-distinta-123',
    newPassword: 'apertura-espanola',
  });
  assertError(mismatch, 422, 'current_password_mismatch');
  const weak = await client.json('PUT', '/api/auth/password', {
    currentPassword: PASSWORD,
    newPassword: 'corta',
  });
  assertError(weak, 422, 'weak_password');
  assertEquals(errorMessage(weak), 'La contraseña debe tener al menos 12 caracteres.');

  const changed = await client.json('PUT', '/api/auth/password', {
    currentPassword: PASSWORD,
    newPassword: 'apertura-espanola',
  });
  assertEquals(changed.status, 204);
  assertEquals(userIn(await client.get('/api/auth/me')).mustChangePassword, false);
});

Deno.test('temporary password should block everything but the session routes', async () => {
  await resetDatabase();
  await createUser('nueva@club.es', 'administrator', true);
  const client = new ApiClient();
  await client.logIn('nueva@club.es');

  assertError(await client.get('/api/admin/_ping'), 403, 'password_change_required');
  assertEquals((await client.get('/api/auth/me')).status, 200);
});

Deno.test('administration should be reserved to administrators; the history to superadministrators', async () => {
  await resetDatabase();
  await createUser('profe@club.es', 'teacher');
  await createUser('junta@club.es');
  await createUser('super@club.es', 'superadministrator');
  await createUser('ia@club.es', 'assistant');
  const client = new ApiClient();

  await client.logIn('profe@club.es');
  assertEquals((await client.get('/api/_ping')).status, 200);
  assertError(await client.get('/api/admin/_ping'), 403, 'forbidden');
  await client.logIn('junta@club.es');
  assertEquals((await client.get('/api/admin/_ping')).status, 200);
  assertError(await client.get('/api/admin/audit/_ping'), 403, 'forbidden');
  await client.logIn('ia@club.es');
  assertEquals((await client.get('/api/admin/_ping')).status, 200, 'el asistente administra');
  assertError(await client.get('/api/admin/audit/_ping'), 403, 'forbidden');
  await client.logIn('super@club.es');
  assertEquals((await client.get('/api/admin/audit/_ping')).status, 200);
  assertError(await new ApiClient().get('/api/admin/_ping'), 401, 'unauthorized');
});

Deno.test('login should keep the client IP in the audit trail of the request (rate limit per IP)', async () => {
  await resetDatabase();
  const client = new ApiClient();
  for (let i = 0; i < 30; i++) {
    await client.logIn(`alguien${i}@club.es`, 'incorrecta-123', '203.0.113.9');
  }

  assertError(
    await client.logIn('otra@club.es', 'incorrecta-123', '203.0.113.9'),
    429,
    'too_many_requests',
  );
  assertError(
    await client.logIn('otra@club.es', 'incorrecta-123', '203.0.113.10'),
    401,
    'invalid_credentials',
  );
});
