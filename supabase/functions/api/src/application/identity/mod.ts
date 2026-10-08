import { type Clock, EmailAddress, FullName, InvalidValue } from '../../domain/common/mod.ts';
import {
  PasswordHash,
  PasswordPolicy,
  PlainPassword,
  type Role,
  roleFromName,
  Session,
  SessionId,
  SessionPolicy,
  TeacherLink,
  User,
  UserId,
} from '../../domain/identity/mod.ts';
import {
  CannotChangeOwnAccount,
  CannotImpersonate,
  CurrentPasswordMismatch,
  EmailAlreadyRegistered,
  InvalidCredentials,
  NotImpersonating,
  SessionNotValid,
  TeacherAlreadyLinked,
  UserNotFound,
} from './errors.ts';
import {
  type LoginAttemptLimiter,
  type PasswordHasher,
  type SecurityEventLog,
  type SessionRepository,
  SessionToken,
  type SessionTokenGenerator,
  type TeacherAccounts,
  type TemporaryPasswordGenerator,
  type UserRepository,
} from './ports.ts';

export * from './errors.ts';
export * from './ports.ts';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  fullName: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  /** Profesor vinculado a una cuenta de profesorado, o null. */
  teacherId: string | null;
  /** Quien suplanta esta cuenta (superadministración), o null en una sesión normal. */
  impersonatedBy: { id: string; fullName: string } | null;
}

export function authenticatedUser(
  user: User,
  session: Session,
  impersonator: User | null = null,
): AuthenticatedUser {
  return {
    id: user.id.value,
    sessionId: session.id.value,
    fullName: user.fullName.value,
    email: user.email.value,
    role: user.role(),
    teacherId: user.linkedTeacher()?.value ?? null,
    // Quien suplanta no tiene que cambiar la contraseña temporal de otra persona.
    mustChangePassword: impersonator === null && user.mustChangePassword(),
    impersonatedBy: impersonator === null
      ? null
      : { id: impersonator.id.value, fullName: impersonator.fullName.value },
  };
}

export interface LoginResult {
  token: SessionToken;
  user: AuthenticatedUser;
}

export class LogIn {
  private decoyHash: PasswordHash | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: SessionTokenGenerator,
    private readonly limiter: LoginAttemptLimiter,
    private readonly log: SecurityEventLog,
    private readonly clock: Clock,
  ) {}

  /** @throws InvalidCredentials @throws TooManyLoginAttempts */
  async execute(email: string, password: string, clientIp: string): Promise<LoginResult> {
    let address: EmailAddress;
    let plain: PlainPassword;
    try {
      address = EmailAddress.fromString(email);
      plain = PlainPassword.fromString(password);
    } catch (error) {
      if (!(error instanceof InvalidValue)) throw error;
      await this.log.record('login', 'failure');
      throw new InvalidCredentials();
    }
    await this.limiter.assertCanAttempt(address, clientIp);
    const user = await this.users.findByEmail(address);
    if (!(await this.passwordMatches(user, plain)) || user === null || !user.canAuthenticate()) {
      await this.limiter.recordFailure(address, clientIp);
      await this.log.record('login', 'failure', user?.id);
      throw new InvalidCredentials();
    }
    await this.limiter.reset(address);
    await this.upgradeHashIfNeeded(user, plain);
    const token = this.tokens.generate();
    const session = Session.start(
      SessionId.generate(),
      this.tokens.hash(token),
      user.id,
      this.clock.now(),
    );
    await this.sessions.save(session);
    await this.log.record('login', 'success', user.id);
    return { token, user: authenticatedUser(user, session) };
  }

  /** Verifica siempre un hash, aunque el usuario no exista, para no revelar cuentas por el tiempo de respuesta. */
  private async passwordMatches(user: User | null, password: PlainPassword): Promise<boolean> {
    const matches = await this.hasher.verify(
      user?.passwordHash() ?? (await this.decoy()),
      password,
    );
    return matches && user !== null;
  }

  private async decoy(): Promise<PasswordHash> {
    this.decoyHash ??= await this.hasher.hash(PlainPassword.fromString(crypto.randomUUID()));
    return this.decoyHash;
  }

  private async upgradeHashIfNeeded(user: User, password: PlainPassword): Promise<void> {
    if (this.hasher.needsRehash(user.passwordHash())) {
      user.upgradePasswordHash(await this.hasher.hash(password));
      await this.users.save(user);
    }
  }
}

export class LogOut {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: SessionTokenGenerator,
    private readonly log: SecurityEventLog,
  ) {}

  async execute(token: string): Promise<void> {
    const session = await this.sessions.findByTokenHash(this.tokens.hash(new SessionToken(token)));
    if (session === null) return;
    await this.sessions.remove(session.id);
    await this.log.record('logout', 'success', session.userId);
  }
}

export class AuthenticateSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly tokens: SessionTokenGenerator,
    private readonly clock: Clock,
  ) {}

  /** @throws SessionNotValid */
  async execute(token: string): Promise<AuthenticatedUser> {
    const session = await this.sessions.findByTokenHash(this.tokens.hash(new SessionToken(token)));
    if (session === null) throw new SessionNotValid();
    const now = this.clock.now();
    if (session.isExpiredAt(now, SessionPolicy.standard())) {
      await this.sessions.remove(session.id);
      throw new SessionNotValid();
    }
    const user = await this.users.find(session.userId);
    if (user === null || !user.canAuthenticate()) throw new SessionNotValid();
    let impersonator: User | null = null;
    if (session.impersonator !== null) {
      // Si quien suplanta deja de poder entrar o de ser superadministración, la suplantación acaba.
      impersonator = await this.users.find(session.impersonator);
      if (
        impersonator === null || !impersonator.canAuthenticate() ||
        impersonator.role() !== 'superadministrator'
      ) {
        await this.sessions.remove(session.id);
        throw new SessionNotValid();
      }
    }
    if (session.touch(now)) await this.sessions.save(session);
    return authenticatedUser(user, session, impersonator);
  }
}

export class ChangeOwnPassword {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly log: SecurityEventLog,
    private readonly clock: Clock,
  ) {}

  /** @throws CurrentPasswordMismatch @throws WeakPassword */
  async execute(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.find(UserId.fromString(userId));
    if (user === null) throw new SessionNotValid();
    if (
      !(await this.hasher.verify(user.passwordHash(), PlainPassword.fromString(currentPassword)))
    ) {
      await this.log.record('password_change', 'failure', user.id);
      throw new CurrentPasswordMismatch();
    }
    const fresh = PlainPassword.fromString(newPassword);
    new PasswordPolicy().assertAcceptable(fresh, user.email);
    user.changePassword(await this.hasher.hash(fresh), this.clock.now());
    await this.users.save(user);
    await this.sessions.removeAllForUser(user.id, SessionId.fromString(currentSessionId));
    await this.log.record('password_change', 'success', user.id);
  }
}

async function lookUp(users: UserRepository, email: string): Promise<User> {
  const user = await users.findByEmail(EmailAddress.fromString(email));
  if (user === null) throw new UserNotFound();
  return user;
}

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly temporaryPasswords: TemporaryPasswordGenerator,
    private readonly log: SecurityEventLog,
    private readonly clock: Clock,
  ) {}

  /**
   * Da de alta una cuenta y devuelve su contraseña temporal, que solo se muestra esta vez.
   * @throws EmailAlreadyRegistered
   */
  async execute(email: string, fullName: string, role: string): Promise<string> {
    const address = EmailAddress.fromString(email);
    if ((await this.users.findByEmail(address)) !== null) throw new EmailAlreadyRegistered();
    const temporary = this.temporaryPasswords.generate();
    const user = User.register(
      UserId.generate(),
      address,
      FullName.fromString(fullName),
      roleFromName(role),
      await this.hasher.hash(temporary),
      this.clock.now(),
    );
    await this.users.save(user);
    await this.log.record('user_registered', 'success', user.id);
    return temporary.reveal();
  }
}

export class ResetUserPassword {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly temporaryPasswords: TemporaryPasswordGenerator,
    private readonly log: SecurityEventLog,
    private readonly clock: Clock,
  ) {}

  /** Asigna una contraseña temporal (que hay que cambiar al entrar) y cierra todas las sesiones. */
  async execute(email: string): Promise<string> {
    const user = await lookUp(this.users, email);
    const temporary = this.temporaryPasswords.generate();
    user.resetPassword(await this.hasher.hash(temporary), this.clock.now());
    await this.users.save(user);
    await this.sessions.removeAllForUser(user.id);
    await this.log.record('password_reset', 'success', user.id);
    return temporary.reveal();
  }
}

export class DisableUser {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly log: SecurityEventLog,
  ) {}

  /** `actorId`: quien lo pide desde la aplicación, que no puede desactivarse a sí mismo. */
  async execute(email: string, actorId?: string): Promise<void> {
    const user = await lookUp(this.users, email);
    if (user.id.value === actorId) throw new CannotChangeOwnAccount();
    user.disable();
    await this.users.save(user);
    await this.sessions.removeAllForUser(user.id);
    await this.log.record('user_disabled', 'success', user.id);
  }
}

export class EnableUser {
  constructor(
    private readonly users: UserRepository,
    private readonly log: SecurityEventLog,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await lookUp(this.users, email);
    user.enable();
    await this.users.save(user);
    await this.log.record('user_enabled', 'success', user.id);
  }
}

export class ChangeUserRole {
  constructor(
    private readonly users: UserRepository,
    private readonly log: SecurityEventLog,
  ) {}

  async execute(email: string, role: string, actorId?: string): Promise<void> {
    const user = await lookUp(this.users, email);
    if (user.id.value === actorId) throw new CannotChangeOwnAccount();
    user.changeRole(roleFromName(role));
    await this.users.save(user);
    await this.log.record('role_changed', 'success', user.id);
  }
}

/** Vincula una cuenta de profesorado a la ficha de un profesor (o la desvincula con null). Un profesor, una cuenta. */
export class LinkTeacher {
  constructor(
    private readonly users: UserRepository,
    private readonly teachers: TeacherAccounts,
    private readonly log: SecurityEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(email: string, teacherId: string | null): Promise<void> {
    const user = await lookUp(this.users, email);
    const teacher = teacherId === null ? null : TeacherLink.fromString(teacherId);
    if (teacher !== null) {
      if (!(await this.teachers.exists(teacher))) {
        throw new InvalidValue('teacherId', 'Ese profesor no existe.');
      }
      const linked = await this.teachers.linkedUser(teacher);
      if (linked !== null && !linked.equals(user.id)) throw new TeacherAlreadyLinked();
    }
    user.linkTeacher(teacher, this.clock.now());
    await this.users.save(user);
    await this.log.record(
      teacher === null ? 'teacher_unlinked' : 'teacher_linked',
      'success',
      user.id,
    );
  }
}

/** Cuenta tal y como se ve en la sección Usuarios (nunca con la contraseña). */
export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: string;
  /** Profesor vinculado (solo cuentas de profesorado), o null. */
  teacher: { id: string; name: string } | null;
  /** Último inicio de sesión o actividad, o null si nunca ha entrado. */
  lastSeenAt: string | null;
}

export interface UserDirectory {
  /** Todas las cuentas, por nombre. */
  list(): Promise<UserListItem[]>;
  /** Email de una cuenta por su identificador, o null si no existe. */
  emailOf(id: string): Promise<string | null>;
}

export class ListUsers {
  constructor(private readonly directory: UserDirectory) {}

  execute(): Promise<UserListItem[]> {
    return this.directory.list();
  }
}

/**
 * Superadministración entra como otra cuenta para ver lo que ve: se cierra su sesión y se abre una de esa cuenta
 * que recuerda quién la abrió. No se puede suplantar a uno mismo, a otra superadministración ni una cuenta desactivada.
 */
export class StartImpersonation {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: SessionTokenGenerator,
    private readonly log: SecurityEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(actor: AuthenticatedUser, targetId: string): Promise<LoginResult> {
    if (actor.impersonatedBy !== null) {
      throw new CannotImpersonate('Vuelve antes a tu cuenta para suplantar otra.');
    }
    const admin = await this.users.find(UserId.fromString(actor.id));
    if (admin === null || admin.role() !== 'superadministrator') {
      throw new CannotImpersonate('Solo superadministración puede suplantar cuentas.');
    }
    const target = await this.users.find(UserId.fromString(targetId));
    if (target === null) throw new UserNotFound();
    if (target.id.equals(admin.id)) throw new CannotImpersonate('Ya estás en tu cuenta.');
    if (target.role() === 'superadministrator') {
      throw new CannotImpersonate('No se puede suplantar a otra cuenta de superadministración.');
    }
    if (!target.canAuthenticate()) {
      throw new CannotImpersonate('No se puede suplantar una cuenta desactivada.');
    }
    await this.sessions.remove(SessionId.fromString(actor.sessionId));
    const token = this.tokens.generate();
    const session = Session.start(
      SessionId.generate(),
      this.tokens.hash(token),
      target.id,
      this.clock.now(),
      admin.id,
    );
    await this.sessions.save(session);
    await this.log.record('impersonation_start', 'success', admin.id);
    return { token, user: authenticatedUser(target, session, admin) };
  }
}

/** Vuelve a la cuenta de superadministración: se cierra la sesión suplantada y se abre una suya nueva. */
export class StopImpersonation {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: SessionTokenGenerator,
    private readonly log: SecurityEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(current: AuthenticatedUser): Promise<LoginResult> {
    if (current.impersonatedBy === null) throw new NotImpersonating();
    const admin = await this.users.find(UserId.fromString(current.impersonatedBy.id));
    if (admin === null || !admin.canAuthenticate()) throw new SessionNotValid();
    await this.sessions.remove(SessionId.fromString(current.sessionId));
    const token = this.tokens.generate();
    const session = Session.start(
      SessionId.generate(),
      this.tokens.hash(token),
      admin.id,
      this.clock.now(),
    );
    await this.sessions.save(session);
    await this.log.record('impersonation_stop', 'success', admin.id);
    return { token, user: authenticatedUser(admin, session) };
  }
}
