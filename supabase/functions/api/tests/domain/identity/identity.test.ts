import { assert, assertEquals, assertFalse, assertStringIncludes, assertThrows } from '@std/assert';

import { EmailAddress, FullName, InvalidValue } from '../../../src/domain/common/mod.ts';
import {
  PasswordHash,
  PasswordPolicy,
  PlainPassword,
  roleFromName,
  Session,
  SessionId,
  SessionPolicy,
  SessionTokenHash,
  TeacherLink,
  User,
  UserId,
  WeakPassword,
} from '../../../src/domain/identity/mod.ts';

const NOW = new Date('2026-10-02T10:00:00+02:00');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

Deno.test('Role should parse known roles and reject unknown ones', () => {
  assertEquals(roleFromName('superadministrator'), 'superadministrator');
  assertEquals(roleFromName('administrator'), 'administrator');
  assertEquals(roleFromName('teacher'), 'teacher');
  assertEquals(roleFromName('assistant'), 'assistant');
  assertThrows(() => roleFromName('superuser'), InvalidValue);
});

Deno.test('PasswordPolicy should require twelve characters and differ from the email', () => {
  const email = EmailAddress.fromString('junta@club.es');
  new PasswordPolicy().assertAcceptable(PlainPassword.fromString('caballo-alfil'), email);
  assertThrows(
    () => new PasswordPolicy().assertAcceptable(PlainPassword.fromString('enroque-123'), email),
    WeakPassword,
    'La contraseña debe tener al menos 12 caracteres.',
  );
  assertThrows(
    () => new PasswordPolicy().assertAcceptable(PlainPassword.fromString('Junta@Club.es'), email),
    WeakPassword,
    'La contraseña no puede ser igual que tu email.',
  );
});

Deno.test('PlainPassword should never reveal the secret when printed or serialised', () => {
  const password = PlainPassword.fromString('dama-de-negras');
  assertEquals(String(password), '[oculta]');
  assertEquals(JSON.stringify({ password }), '{"password":"[oculta]"}');
  assertStringIncludes(Deno.inspect(password), '[oculta]');
  assertEquals(password.reveal(), 'dama-de-negras');
  assertThrows(() => PlainPassword.fromString('x'.repeat(4097)), InvalidValue);
});

function sessionStartedNow(): Session {
  return Session.start(
    SessionId.generate(),
    new SessionTokenHash('a'.repeat(64)),
    UserId.generate(),
    NOW,
  );
}

Deno.test('Session should expire after two hours without activity', () => {
  const policy = SessionPolicy.standard();
  assertFalse(sessionStartedNow().isExpiredAt(at(0), policy));
  assertFalse(sessionStartedNow().isExpiredAt(at(7199), policy));
  assert(sessionStartedNow().isExpiredAt(at(7200), policy));
});

Deno.test('Session should stay alive with regular activity but expire after twelve hours', () => {
  const session = sessionStartedNow();
  session.touch(at(90 * 60));
  assertFalse(session.isExpiredAt(at(3 * 3600), SessionPolicy.standard()));
  for (let minutes = 60; minutes < 720; minutes += 60) session.touch(at(minutes * 60));
  assertFalse(session.isExpiredAt(at(11 * 3600 + 59 * 60), SessionPolicy.standard()));
  assert(session.isExpiredAt(at(12 * 3600), SessionPolicy.standard()));
});

Deno.test('Session should record activity only when more than a minute has passed', () => {
  const session = sessionStartedNow();
  assertFalse(session.touch(at(59)));
  assertEquals(session.lastActivityAt(), at(0));
  assert(session.touch(at(61)));
  assertEquals(session.lastActivityAt(), at(61));
});

function registeredUser(): User {
  return User.register(
    UserId.generate(),
    EmailAddress.fromString('junta@club.es'),
    FullName.fromString('Lucía Moreno Gil'),
    'administrator',
    new PasswordHash('temporary-hash'),
    NOW,
  );
}

Deno.test('User should be active and require a password change when registered', () => {
  const user = registeredUser();
  assertEquals(user.status(), 'active');
  assert(user.mustChangePassword());
  assert(user.canAuthenticate());
  assertEquals(user.releaseEvents(), [{
    type: 'UserRegistered',
    userId: user.id,
    role: 'administrator',
  }]);
  assertEquals(user.releaseEvents(), []);
});

Deno.test('User should stop requiring a change when the password is changed, and again when reset', () => {
  const user = registeredUser();
  const later = at(3600);
  user.changePassword(new PasswordHash('new-hash'), later);
  assertFalse(user.mustChangePassword());
  assertEquals(user.passwordHash().value, 'new-hash');
  assertEquals(user.passwordChangedAt(), later);
  user.resetPassword(new PasswordHash('temporary-hash'), later);
  assert(user.mustChangePassword());
  assertEquals(user.releaseEvents().map((e) => e.type), [
    'UserRegistered',
    'UserPasswordChanged',
    'UserPasswordReset',
  ]);
});

Deno.test('User should not authenticate when disabled and again when enabled; role can change', () => {
  const user = registeredUser();
  user.disable();
  assertFalse(user.canAuthenticate());
  assert(user.releaseEvents().some((e) => e.type === 'UserDisabled'));
  user.enable();
  assert(user.canAuthenticate());
  user.changeRole('teacher');
  assertEquals(user.role(), 'teacher');
});

Deno.test('User should link a teacher only while it has a role that teaches', () => {
  const teacher = TeacherLink.fromString('01990000-0000-7000-8000-0000000000aa');
  const user = registeredUser();
  user.changeRole('assistant');
  assertThrows(() => user.linkTeacher(teacher, NOW), InvalidValue, 'asistente');
  user.changeRole('teacher');
  user.linkTeacher(teacher, NOW);
  assertEquals(user.linkedTeacher()?.value, teacher.value);
  assertEquals(user.linkedSince(), NOW);
  user.linkTeacher(teacher, at(3600));
  assertEquals(user.linkedSince(), NOW, 'volver a elegir el mismo profesor no cambia la fecha');
  user.linkTeacher(null, at(7200));
  assertEquals([user.linkedTeacher(), user.linkedSince()], [null, null]);
});

Deno.test('User should let administration be linked to a teacher too', () => {
  const teacher = TeacherLink.fromString('01990000-0000-7000-8000-0000000000aa');
  for (const role of ['administrator', 'superadministrator'] as const) {
    const user = registeredUser();
    user.changeRole(role);
    user.linkTeacher(teacher, NOW);
    assertEquals(user.linkedTeacher()?.value, teacher.value);
  }
});

Deno.test('User should keep the teacher link between roles that teach and drop it for the assistant', () => {
  const user = registeredUser();
  user.changeRole('teacher');
  user.linkTeacher(TeacherLink.fromString('01990000-0000-7000-8000-0000000000aa'), NOW);
  user.changeRole('administrator');
  assertEquals(user.linkedSince(), NOW);
  user.changeRole('assistant');
  assertEquals(user.linkedTeacher(), null);
});

Deno.test('User should have optional extra emails to sign in with, never repeated', () => {
  const user = registeredUser();
  const extra = EmailAddress.fromString('Lucia.Personal@Gmail.com');
  user.addEmail(extra);
  assertEquals(user.otherEmails().map((e) => e.value), ['lucia.personal@gmail.com']);
  assert(user.hasEmail(EmailAddress.fromString('lucia.personal@gmail.com')));
  assert(user.hasEmail(user.email));
  assertThrows(() => user.addEmail(extra), InvalidValue, 'ya');
  assertThrows(() => user.addEmail(user.email), InvalidValue, 'ya');
  user.removeEmail(extra);
  assertEquals(user.otherEmails(), []);
  assertThrows(() => user.removeEmail(user.email), InvalidValue, 'principal');
});
