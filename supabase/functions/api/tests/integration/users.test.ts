import { assert, assertEquals, assertMatch } from '@std/assert';

import { newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  teacher: { id: string; name: string } | null;
  otherEmails: string[];
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

Deno.test('teacher accounts should be linked to one teacher each and see only teacher routes', async () => {
  const { client } = await superadmin();
  const lucia = await newTeacher(client, 'Lucía Moreno Gil');
  const created = await client.json('POST', '/api/admin/users', {
    email: 'lucia@club.es',
    fullName: 'Lucía Moreno Gil',
    role: 'teacher',
    teacherId: lucia,
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const listed = items((await client.get('/api/admin/users')).body);
  assertEquals(listed.find((u) => u.email === 'lucia@club.es')?.teacher, {
    id: lucia,
    name: 'Lucía Moreno Gil',
  });

  // Un profesor, una cuenta; el asistente no se vincula.
  const other = await createUser('otra@club.es', 'teacher');
  assertError(
    await client.json('PUT', `/api/admin/users/${other.id.value}/teacher`, { teacherId: lucia }),
    409,
    'teacher_already_linked',
  );
  const assistant = await createUser('asistente@club.es', 'assistant');
  assertError(
    await client.json('PUT', `/api/admin/users/${assistant.id.value}/teacher`, {
      teacherId: await newTeacher(client, 'Carlos Ruiz Márquez'),
    }),
    422,
    'unprocessable',
  );

  // Una cuenta de profesorado sin vincular no tiene profesor; al vincularla (libre ya el de Lucía), lo tiene.
  const teacher = new ApiClient();
  const profe = await createUser('profe@club.es', 'teacher');
  await teacher.logIn('profe@club.es');
  const linkedTo = async () =>
    ((await teacher.get('/api/auth/me')).body as { user: { teacherId: string | null } }).user
      .teacherId;
  assertEquals(await linkedTo(), null);
  const luciaAccount = (created.body as { id: string }).id;
  assertEquals(
    (await client.json('PUT', `/api/admin/users/${luciaAccount}/teacher`, { teacherId: null }))
      .status,
    204,
  );
  assertEquals(
    (await client.json('PUT', `/api/admin/users/${profe.id.value}/teacher`, { teacherId: lucia }))
      .status,
    204,
  );
  assertEquals(await linkedTo(), lucia);
  assertError(await teacher.get('/api/admin/students'), 403, 'forbidden');

  // Pasar a asistente quita el vínculo.
  assertEquals(
    (await client.json('PUT', `/api/admin/users/${profe.id.value}/role`, { role: 'assistant' }))
      .status,
    204,
  );
  assertEquals(
    items((await client.get('/api/admin/users')).body).find((u) => u.email === 'profe@club.es')
      ?.teacher,
    null,
  );
});

Deno.test('administration linked to a teacher should use the teacher routes as that teacher', async () => {
  const { client, selfId } = await superadmin();
  const lucia = await newTeacher(client, 'Lucía Moreno Gil');
  const junta = await createUser('junta@club.es');
  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  assertError(await admin.get('/api/teacher/classes'), 403, 'forbidden');

  assertEquals(
    (await client.json('PUT', `/api/admin/users/${junta.id.value}/teacher`, { teacherId: lucia }))
      .status,
    204,
  );
  const meAsAdmin = (await admin.get('/api/auth/me')).body as {
    user: { role: string; teacherId: string | null };
  };
  assertEquals([meAsAdmin.user.role, meAsAdmin.user.teacherId], ['administrator', lucia]);
  assertEquals((await admin.get('/api/teacher/classes')).status, 200);
  assertEquals((await admin.get('/api/admin/students')).status, 200);

  // Superadministración también puede vincular su propia cuenta.
  const carlos = await newTeacher(client, 'Carlos Ruiz Márquez');
  assertEquals(
    (await client.json('PUT', `/api/admin/users/${selfId}/teacher`, { teacherId: carlos }))
      .status,
    204,
  );
  assertEquals((await client.get('/api/teacher/classes')).status, 200);
});

Deno.test('an account can have extra emails to sign in with, set only by superadministration', async () => {
  const { client } = await superadmin();
  const junta = await createUser('junta@club.es');
  const add = (email: string) =>
    client.json('POST', `/api/admin/users/${junta.id.value}/emails`, { email });
  assertEquals((await add('Lucia.Personal@Gmail.com')).status, 204);
  assertError(await add('super@club.es'), 409, 'email_already_registered');
  assertEquals(
    items((await client.get('/api/admin/users')).body).find((u) => u.email === 'junta@club.es')
      ?.otherEmails,
    ['lucia.personal@gmail.com'],
  );

  // Con el email adicional se entra en la misma cuenta.
  const other = new ApiClient();
  assertEquals((await other.logIn('lucia.personal@gmail.com')).status, 200);
  const me = (await other.get('/api/auth/me')).body as { user: { id: string; email: string } };
  assertEquals([me.user.id, me.user.email], [junta.id.value, 'junta@club.es']);
  // Solo superadministración los gestiona.
  assertError(
    await other.json('POST', `/api/admin/users/${junta.id.value}/emails`, { email: 'x@club.es' }),
    403,
    'forbidden',
  );

  assertEquals(
    (await client.json('DELETE', `/api/admin/users/${junta.id.value}/emails`, {
      email: 'lucia.personal@gmail.com',
    })).status,
    204,
  );
  assertError(await new ApiClient().logIn('lucia.personal@gmail.com'), 401, 'invalid_credentials');
});
