import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';

import { EmailAddress, InvalidValue } from '../../../src/domain/common/mod.ts';
import {
  AuthenticateSession,
  ChangeOwnPassword,
  ChangeUserRole,
  CurrentPasswordMismatch,
  DisableUser,
  EmailAlreadyRegistered,
  EnableUser,
  InvalidCredentials,
  LinkTeacher,
  LogIn,
  LogOut,
  RegisterUser,
  ResetUserPassword,
  SessionNotValid,
  type TeacherAccounts,
  TeacherAlreadyLinked,
  TooManyLoginAttempts,
  UserNotFound,
} from '../../../src/application/identity/mod.ts';
import { WeakPassword } from '../../../src/domain/identity/mod.ts';
import { FixedTemporaryPasswordGenerator, IdentityFixture } from '../../support/identity.ts';

const IP = '10.0.0.1';

function logIn(fx: IdentityFixture): LogIn {
  return new LogIn(fx.users, fx.sessions, fx.hasher, fx.tokens, fx.limiter, fx.log, fx.clock);
}

Deno.test('LogIn should start a session when the credentials are correct', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser();

  const result = await logIn(fx).execute('  JUNTA@club.es', IdentityFixture.PASSWORD, IP);

  assertEquals(result.token.value, 'token-1');
  assertEquals(result.user.id, user.id.value);
  assertEquals(result.user.role, 'administrator');
  assertEquals(fx.sessions.forUser(user.id).length, 1);
  assertEquals(fx.log.events, [{ event: 'login', outcome: 'success', userId: user.id.value }]);
});

async function assertInvalidCredentials(
  fx: IdentityFixture,
  password: string,
  email = IdentityFixture.EMAIL,
) {
  await assertRejects(
    () => logIn(fx).execute(email, password, IP),
    InvalidCredentials,
    'Email o contraseña incorrectos.',
  );
  assertEquals(fx.log.events[0]?.outcome, 'failure');
}

Deno.test('LogIn should reject and count a failure when the password is wrong', async () => {
  const fx = new IdentityFixture();
  await fx.existingUser();
  await assertInvalidCredentials(fx, 'contraseña-incorrecta');
  assertEquals(fx.limiter.failures.get(IdentityFixture.EMAIL), 1);
});

Deno.test('LogIn should reject with the same error and still verify a hash when the email is unknown', async () => {
  const fx = new IdentityFixture();
  await assertInvalidCredentials(fx, IdentityFixture.PASSWORD, 'nadie@club.es');
  assertEquals(fx.hasher.verifications, 1);
});

Deno.test('LogIn should reject with the same error when the email is malformed or the account is disabled', async () => {
  const fx = new IdentityFixture();
  await assertInvalidCredentials(fx, IdentityFixture.PASSWORD, 'no-es-un-email');
  const user = await fx.existingUser();
  user.disable();
  await assertInvalidCredentials(fx, IdentityFixture.PASSWORD);
  assertEquals(fx.sessions.forUser(user.id), []);
});

Deno.test('LogIn should refuse without checking the password when attempts are exhausted', async () => {
  const fx = new IdentityFixture();
  await fx.existingUser();
  fx.limiter.failures.set(IdentityFixture.EMAIL, 5);
  await assertRejects(
    () => logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP),
    TooManyLoginAttempts,
  );
  assertEquals(fx.hasher.verifications, 0);
});

Deno.test('LogIn should reset the failure counter and upgrade outdated hashes when login succeeds', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser({ passwordHash: `old:${IdentityFixture.PASSWORD}` });
  fx.limiter.failures.set(IdentityFixture.EMAIL, 3);

  await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP);

  assertFalse(fx.limiter.failures.has(IdentityFixture.EMAIL));
  assertEquals(
    (await fx.users.find(user.id))?.passwordHash().value,
    `hashed:${IdentityFixture.PASSWORD}`,
  );
});

Deno.test('LogIn should report a pending password change when the account has a temporary password', async () => {
  const fx = new IdentityFixture();
  await fx.existingUser({ mustChangePassword: true });
  const result = await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP);
  assert(result.user.mustChangePassword);
});

Deno.test('LogOut should end the session and be harmless when repeated', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser();
  const { token } = await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP);
  const logOut = new LogOut(fx.sessions, fx.tokens, fx.log);

  await logOut.execute(token.value);
  await logOut.execute(token.value);

  assertEquals(fx.sessions.forUser(user.id), []);
  assertEquals(fx.log.events[1], { event: 'logout', outcome: 'success', userId: user.id.value });
});

Deno.test('AuthenticateSession should identify the user and record activity when the session is valid', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser();
  const session = await fx.sessionFor(user, 'token-a');
  const authenticate = new AuthenticateSession(fx.sessions, fx.users, fx.tokens, fx.clock);

  const authenticated = await authenticate.execute('token-a');
  assertEquals(authenticated.id, user.id.value);
  assertEquals(authenticated.sessionId, session.id.value);

  fx.clock.advanceSeconds(30 * 60);
  await authenticate.execute('token-a');
  assertEquals(fx.sessions.forUser(user.id)[0]?.lastActivityAt(), fx.clock.now());
});

Deno.test('AuthenticateSession should reject unknown tokens, expired sessions (removing them) and disabled accounts', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser();
  const authenticate = new AuthenticateSession(fx.sessions, fx.users, fx.tokens, fx.clock);
  await assertRejects(() => authenticate.execute('token-desconocido'), SessionNotValid);

  await fx.sessionFor(user, 'token-a');
  fx.clock.advanceSeconds(2 * 3600);
  await assertRejects(() => authenticate.execute('token-a'), SessionNotValid);
  assertEquals(fx.sessions.forUser(user.id), []);

  await fx.sessionFor(user, 'token-b');
  user.disable();
  await assertRejects(() => authenticate.execute('token-b'), SessionNotValid);
});

Deno.test('ChangeOwnPassword should store the new password and close other sessions when valid', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser({ mustChangePassword: true });
  const current =
    (await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP)).user;
  await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP);
  const change = new ChangeOwnPassword(fx.users, fx.sessions, fx.hasher, fx.log, fx.clock);

  await change.execute(
    user.id.value,
    current.sessionId,
    IdentityFixture.PASSWORD,
    'nueva-defensa-siciliana',
  );

  const stored = await fx.users.find(user.id);
  assertEquals(stored?.passwordHash().value, 'hashed:nueva-defensa-siciliana');
  assertFalse(stored?.mustChangePassword());
  const remaining = fx.sessions.forUser(user.id);
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0]?.id.value, current.sessionId);
});

Deno.test('ChangeOwnPassword should refuse a wrong current password or a weak new one', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser();
  const session =
    (await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP)).user.sessionId;
  const change = new ChangeOwnPassword(fx.users, fx.sessions, fx.hasher, fx.log, fx.clock);

  await assertRejects(
    () => change.execute(user.id.value, session, 'otra-cosa-distinta', 'nueva-defensa-siciliana'),
    CurrentPasswordMismatch,
  );
  await assertRejects(
    () => change.execute(user.id.value, session, IdentityFixture.PASSWORD, 'corta'),
    WeakPassword,
  );
});

function register(fx: IdentityFixture): RegisterUser {
  return new RegisterUser(fx.users, fx.hasher, fx.temporaryPasswords, fx.log, fx.clock);
}

Deno.test('RegisterUser should create an account with a temporary password to be changed', async () => {
  const fx = new IdentityFixture();
  const temporary = await register(fx).execute('Profe@Club.es', 'Carlos Ruiz Márquez', 'teacher');
  const user = await fx.users.findByEmail(EmailAddress.fromString('profe@club.es'));
  assertEquals(temporary, FixedTemporaryPasswordGenerator.PASSWORD);
  assertEquals(user?.role(), 'teacher');
  assert(user?.mustChangePassword());
  assertEquals(user?.passwordHash().value, `hashed:${temporary}`);
});

Deno.test('RegisterUser should refuse a taken email or an unknown role', async () => {
  const fx = new IdentityFixture();
  await fx.existingUser();
  await assertRejects(
    () => register(fx).execute(IdentityFixture.EMAIL, 'Otra Persona', 'administrator'),
    EmailAlreadyRegistered,
  );
  await assertRejects(
    () => register(fx).execute('nuevo@club.es', 'Otra Persona', 'superuser'),
    InvalidValue,
  );
});

Deno.test('DisableUser should close every session; EnableUser should allow access again', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser();
  await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP);

  await new DisableUser(fx.users, fx.sessions, fx.log).execute(IdentityFixture.EMAIL);
  assertEquals((await fx.users.find(user.id))?.status(), 'disabled');
  assertEquals(fx.sessions.forUser(user.id), []);

  await new EnableUser(fx.users, fx.log).execute(IdentityFixture.EMAIL);
  assert((await fx.users.find(user.id))?.canAuthenticate());
  await assertRejects(
    () => new DisableUser(fx.users, fx.sessions, fx.log).execute('nadie@club.es'),
    UserNotFound,
  );
});

Deno.test('ResetUserPassword should issue a temporary password and close sessions; ChangeUserRole should change the role', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser();
  await logIn(fx).execute(IdentityFixture.EMAIL, IdentityFixture.PASSWORD, IP);

  const temporary = await new ResetUserPassword(
    fx.users,
    fx.sessions,
    fx.hasher,
    fx.temporaryPasswords,
    fx.log,
    fx.clock,
  ).execute(IdentityFixture.EMAIL);
  const stored = await fx.users.find(user.id);
  assertEquals(stored?.passwordHash().value, `hashed:${temporary}`);
  assert(stored?.mustChangePassword());
  assertEquals(fx.sessions.forUser(user.id), []);

  await new ChangeUserRole(fx.users, fx.log).execute(IdentityFixture.EMAIL, 'teacher');
  assertEquals((await fx.users.find(user.id))?.role(), 'teacher');
});

const LUCIA = '01990000-0000-7000-8000-0000000000aa';

/** Profesores del club y la cuenta vinculada a cada uno, sobre el repositorio de cuentas del fixture. */
function teacherAccounts(fx: IdentityFixture, teachers: string[]): TeacherAccounts {
  return {
    exists: (teacher) => Promise.resolve(teachers.includes(teacher.value)),
    linkedUser: async (teacher) =>
      (await fx.users.all()).find((u) => u.linkedTeacher()?.value === teacher.value)?.id ?? null,
  };
}

Deno.test('LinkTeacher should link a teacher account to an existing teacher and unlink it', async () => {
  const fx = new IdentityFixture();
  const user = await fx.existingUser({ role: 'teacher' });
  const link = new LinkTeacher(fx.users, teacherAccounts(fx, [LUCIA]), fx.log);

  await link.execute(IdentityFixture.EMAIL, LUCIA);
  assertEquals((await fx.users.find(user.id))?.linkedTeacher()?.value, LUCIA);
  assertEquals(fx.log.events.at(-1)?.event, 'teacher_linked');

  await link.execute(IdentityFixture.EMAIL, null);
  assertEquals((await fx.users.find(user.id))?.linkedTeacher(), null);
});

Deno.test('LinkTeacher should refuse unknown teachers, teachers with another account and other roles', async () => {
  const fx = new IdentityFixture();
  await fx.existingUser({ role: 'teacher' });
  await fx.existingUser({ email: 'otra@club.es', role: 'teacher' });
  await fx.existingUser({ email: 'admin@club.es', role: 'administrator' });
  const free = '01990000-0000-7000-8000-0000000000cc';
  const link = new LinkTeacher(fx.users, teacherAccounts(fx, [LUCIA, free]), fx.log);

  await assertRejects(
    () => link.execute(IdentityFixture.EMAIL, '01990000-0000-7000-8000-0000000000bb'),
    InvalidValue,
    'Ese profesor no existe.',
  );
  await link.execute(IdentityFixture.EMAIL, LUCIA);
  await assertRejects(() => link.execute('otra@club.es', LUCIA), TeacherAlreadyLinked);
  await link.execute(IdentityFixture.EMAIL, LUCIA);
  await assertRejects(() => link.execute('admin@club.es', free), InvalidValue, 'profesorado');
});
