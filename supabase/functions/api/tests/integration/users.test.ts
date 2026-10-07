import { assert, assertEquals, assertMatch } from '@std/assert';

import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  lastSeenAt: string | null;
}

const items = (body: unknown) => (body as { items: UserRow[] }).items;

async function superadmin(): Promise<{ client: ApiClient; selfId: string }> {
  await resetDatabase();
  const self = await createUser('super@club.es', 'superadministrator');
  const client = new ApiClient();
  await client.logIn('super@club.es');
  return { client, selfId: self.id.value };
}

Deno.test('users should be listed only to superadministrators, with their last connection', async () => {
  const { client } = await superadmin();
  await createUser('junta@club.es');
  const list = items((await client.get('/api/admin/users')).body);
  assertEquals(list.map((u) => u.email), ['junta@club.es', 'super@club.es']);
  const me = list.find((u) => u.email === 'super@club.es');
  assert(me?.lastSeenAt !== null, 'acaba de entrar');
  assertEquals(list.find((u) => u.email === 'junta@club.es')?.lastSeenAt, null);
  assertEquals(me?.role, 'superadministrator');

  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  assertError(await admin.get('/api/admin/users'), 403, 'forbidden');
});

Deno.test('users should be created, reset, disabled, enabled and change role from the app', async () => {
  const { client, selfId } = await superadmin();

  const created = await client.json('POST', '/api/admin/users', {
    email: 'nueva@club.es',
    fullName: 'Cuenta Nueva',
    role: 'administrator',
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const { id, temporaryPassword } = created.body as { id: string; temporaryPassword: string };
  assertMatch(temporaryPassword, /^\S{12,}$/);
  assertError(
    await client.json('POST', '/api/admin/users', {
      email: 'nueva@club.es',
      fullName: 'Otra',
      role: 'teacher',
    }),
    409,
    'email_already_registered',
  );

  const other = new ApiClient();
  assertEquals((await other.logIn('nueva@club.es', temporaryPassword)).status, 200);

  const reset = await client.json('POST', `/api/admin/users/${id}/password-reset`);
  assertEquals(reset.status, 200);
  const fresh = (reset.body as { temporaryPassword: string }).temporaryPassword;
  assert(fresh !== temporaryPassword);
  assertEquals((await other.get('/api/auth/me')).status, 401, 'cierra sus sesiones');

  assertEquals(
    (await client.json('PUT', `/api/admin/users/${id}/role`, { role: 'teacher' })).status,
    204,
  );
  assertEquals((await client.json('POST', `/api/admin/users/${id}/disable`)).status, 204);
  assertEquals((await other.logIn('nueva@club.es', fresh)).status, 401);
  assertEquals((await client.json('POST', `/api/admin/users/${id}/enable`)).status, 204);
  const row = items((await client.get('/api/admin/users')).body).find((u) => u.id === id);
  assertEquals([row?.role, row?.status, row?.mustChangePassword], ['teacher', 'active', true]);

  // Nadie se deja fuera a sí mismo.
  assertError(await client.json('POST', `/api/admin/users/${selfId}/disable`), 409, 'own_account');
  assertError(
    await client.json('PUT', `/api/admin/users/${selfId}/role`, { role: 'administrator' }),
    409,
    'own_account',
  );
  assertError(
    await client.json('POST', '/api/admin/users/01a11381-2833-782f-9c2b-ddc95b817821/disable'),
    404,
    'not_found',
  );
});

Deno.test('superadministrators can act as another account and come back, signing what they do', async () => {
  const { client, selfId } = await superadmin();
  const junta = await createUser('junta@club.es');
  const otherSuper = await createUser('otro@club.es', 'superadministrator');

  const started = await client.json('POST', `/api/admin/users/${junta.id.value}/impersonate`);
  assertEquals(started.status, 200, JSON.stringify(started.body));
  const me = (await client.get('/api/auth/me')).body as {
    user: { email: string; role: string; impersonatedBy: { id: string; fullName: string } | null };
  };
  assertEquals(me.user.email, 'junta@club.es');
  assertEquals(me.user.impersonatedBy?.id, selfId);
  assertError(await client.get('/api/admin/users'), 403, 'forbidden');
  assertError(
    await client.json('PUT', '/api/auth/password', {
      currentPassword: 'x',
      newPassword: 'otra-contraseña-larga',
    }),
    403,
    'impersonating',
  );

  // Lo que hace queda firmado por la cuenta y por quien la suplanta.
  const teacher = await client.json('POST', '/api/admin/teachers', {
    fullName: 'Ana Belén Torres',
  });
  assertEquals(teacher.status, 201);

  const stopped = await client.json('POST', '/api/auth/impersonation/stop');
  assertEquals(stopped.status, 200, JSON.stringify(stopped.body));
  const back = (await client.get('/api/auth/me')).body as {
    user: { email: string; impersonatedBy: unknown };
  };
  assertEquals([back.user.email, back.user.impersonatedBy], ['super@club.es', null]);

  const actions = (await client.get('/api/admin/audit/actions')).body as {
    items: { label: string; userName: string }[];
  };
  const created = actions.items.find((a) => a.label === 'Crear profesor');
  assertEquals(created?.userName, 'Lucía Moreno Gil (suplantada por Lucía Moreno Gil)');
  // Empezar y dejar de suplantar son eventos de sesión: se registran, pero el historial no los lista.
  assert(!actions.items.some((a) => a.label === 'Empieza a suplantar una cuenta'));

  // Límites: ni a sí mismo, ni a otra superadministración, ni cuentas desactivadas.
  assertError(
    await client.json('POST', `/api/admin/users/${selfId}/impersonate`),
    409,
    'cannot_impersonate',
  );
  assertError(
    await client.json('POST', `/api/admin/users/${otherSuper.id.value}/impersonate`),
    409,
    'cannot_impersonate',
  );
  await client.json('POST', `/api/admin/users/${junta.id.value}/disable`);
  assertError(
    await client.json('POST', `/api/admin/users/${junta.id.value}/impersonate`),
    409,
    'cannot_impersonate',
  );
  assertError(await client.json('POST', '/api/auth/impersonation/stop'), 409, 'not_impersonating');
});
