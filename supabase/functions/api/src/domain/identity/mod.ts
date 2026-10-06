import { EmailAddress, FullName, InvalidValue, Uuid } from '../common/mod.ts';

export class UserId extends Uuid {}
export class SessionId extends Uuid {}

/**
 * Roles. El asistente es la cuenta con la que la IA consulta y cambia datos a petición de la junta:
 * tiene permisos de administración y todo lo que hace queda en el historial a su nombre.
 */
export type Role = 'superadministrator' | 'administrator' | 'teacher' | 'assistant';
export const ROLES: readonly Role[] = [
  'superadministrator',
  'administrator',
  'teacher',
  'assistant',
];

export function roleFromName(name: string): Role {
  if (!(ROLES as readonly string[]).includes(name)) {
    throw new InvalidValue(
      'role',
      'Rol desconocido: usa superadministrator, administrator, teacher o assistant.',
    );
  }
  return name as Role;
}

export type AccountStatus = 'active' | 'disabled';

/** Hash opaco de una contraseña: el dominio no conoce el algoritmo. */
export class PasswordHash {
  constructor(readonly value: string) {
    if (value === '') throw new Error('PasswordHash vacío');
  }
}

/** Huella del token de sesión. El token en claro solo existe en la cookie del navegador. */
export class SessionTokenHash {
  constructor(readonly value: string) {
    if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('SessionTokenHash no válido');
  }
}

/**
 * Contraseña en claro. Solo vive en memoria durante la petición: nunca se imprime ni se registra.
 */
export class PlainPassword {
  private static readonly MAX_LENGTH = 4096;

  private constructor(private readonly secret: string) {}

  static fromString(secret: string): PlainPassword {
    if (secret.length > PlainPassword.MAX_LENGTH) {
      throw new InvalidValue('password', 'La contraseña es demasiado larga.');
    }
    return new PlainPassword(secret);
  }

  reveal(): string {
    return this.secret;
  }

  length(): number {
    return [...this.secret].length;
  }

  toString(): string {
    return '[oculta]';
  }

  toJSON(): string {
    return '[oculta]';
  }

  [Symbol.for('Deno.customInspect')](): string {
    return 'PlainPassword([oculta])';
  }
}

export class WeakPassword extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeakPassword';
  }

  static tooShort(minimum: number): WeakPassword {
    return new WeakPassword(`La contraseña debe tener al menos ${minimum} caracteres.`);
  }

  static sameAsEmail(): WeakPassword {
    return new WeakPassword('La contraseña no puede ser igual que tu email.');
  }
}

export class PasswordPolicy {
  static readonly MIN_LENGTH = 12;

  assertAcceptable(password: PlainPassword, owner: EmailAddress): void {
    if (password.length() < PasswordPolicy.MIN_LENGTH) {
      throw WeakPassword.tooShort(PasswordPolicy.MIN_LENGTH);
    }
    if (password.reveal().trim().toLowerCase() === owner.value) {
      throw WeakPassword.sameAsEmail();
    }
  }
}

export class SessionPolicy {
  private constructor(
    readonly idleSeconds: number,
    readonly absoluteSeconds: number,
    readonly activityResolutionSeconds: number,
  ) {}

  /** 2 h sin actividad, 12 h como máximo, actividad registrada como mucho una vez por minuto. */
  static standard(): SessionPolicy {
    return new SessionPolicy(2 * 3600, 12 * 3600, 60);
  }
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** Sesión iniciada por un usuario en un navegador. */
export class Session {
  private constructor(
    readonly id: SessionId,
    readonly tokenHash: SessionTokenHash,
    readonly userId: UserId,
    readonly startedAt: Date,
    private lastActivity: Date,
  ) {}

  static start(id: SessionId, tokenHash: SessionTokenHash, userId: UserId, now: Date): Session {
    return new Session(id, tokenHash, userId, now, now);
  }

  static restore(
    id: SessionId,
    tokenHash: SessionTokenHash,
    userId: UserId,
    startedAt: Date,
    lastActivityAt: Date,
  ): Session {
    return new Session(id, tokenHash, userId, startedAt, lastActivityAt);
  }

  isExpiredAt(now: Date, policy: SessionPolicy): boolean {
    const idle = seconds(now) - seconds(this.lastActivity);
    const age = seconds(now) - seconds(this.startedAt);
    return idle >= policy.idleSeconds || age >= policy.absoluteSeconds;
  }

  /** Registra actividad si ha pasado más de un minuto desde la última. Devuelve si hubo cambio. */
  touch(now: Date, policy: SessionPolicy = SessionPolicy.standard()): boolean {
    if (seconds(now) - seconds(this.lastActivity) <= policy.activityResolutionSeconds) {
      return false;
    }
    this.lastActivity = now;
    return true;
  }

  lastActivityAt(): Date {
    return this.lastActivity;
  }
}

export type UserEvent =
  | { type: 'UserRegistered'; userId: UserId; role: Role }
  | { type: 'UserPasswordChanged'; userId: UserId }
  | { type: 'UserPasswordReset'; userId: UserId }
  | { type: 'UserDisabled'; userId: UserId };

/** Cuenta de una persona con acceso al panel. */
export class User {
  private events: UserEvent[] = [];

  private constructor(
    readonly id: UserId,
    readonly email: EmailAddress,
    readonly fullName: FullName,
    private currentRole: Role,
    private hash: PasswordHash,
    private currentStatus: AccountStatus,
    private passwordChangePending: boolean,
    readonly createdAt: Date,
    private passwordChanged: Date,
  ) {}

  /** Toda cuenta nace con una contraseña temporal que hay que cambiar al entrar. */
  static register(
    id: UserId,
    email: EmailAddress,
    fullName: FullName,
    role: Role,
    temporaryPassword: PasswordHash,
    now: Date,
  ): User {
    const user = new User(id, email, fullName, role, temporaryPassword, 'active', true, now, now);
    user.events.push({ type: 'UserRegistered', userId: id, role });
    return user;
  }

  /** Reconstruye una cuenta ya existente desde la persistencia, sin registrar eventos. */
  static restore(fields: {
    id: UserId;
    email: EmailAddress;
    fullName: FullName;
    role: Role;
    passwordHash: PasswordHash;
    status: AccountStatus;
    mustChangePassword: boolean;
    createdAt: Date;
    passwordChangedAt: Date;
  }): User {
    return new User(
      fields.id,
      fields.email,
      fields.fullName,
      fields.role,
      fields.passwordHash,
      fields.status,
      fields.mustChangePassword,
      fields.createdAt,
      fields.passwordChangedAt,
    );
  }

  changePassword(newPassword: PasswordHash, now: Date): void {
    this.hash = newPassword;
    this.passwordChangePending = false;
    this.passwordChanged = now;
    this.events.push({ type: 'UserPasswordChanged', userId: this.id });
  }

  resetPassword(temporaryPassword: PasswordHash, now: Date): void {
    this.hash = temporaryPassword;
    this.passwordChangePending = true;
    this.passwordChanged = now;
    this.events.push({ type: 'UserPasswordReset', userId: this.id });
  }

  /** Sustituye el hash por otro equivalente (p. ej. con un algoritmo más robusto) sin más efectos. */
  upgradePasswordHash(rehashed: PasswordHash): void {
    this.hash = rehashed;
  }

  disable(): void {
    this.currentStatus = 'disabled';
    this.events.push({ type: 'UserDisabled', userId: this.id });
  }

  enable(): void {
    this.currentStatus = 'active';
  }

  changeRole(role: Role): void {
    this.currentRole = role;
  }

  canAuthenticate(): boolean {
    return this.currentStatus === 'active';
  }

  role(): Role {
    return this.currentRole;
  }

  passwordHash(): PasswordHash {
    return this.hash;
  }

  status(): AccountStatus {
    return this.currentStatus;
  }

  mustChangePassword(): boolean {
    return this.passwordChangePending;
  }

  passwordChangedAt(): Date {
    return this.passwordChanged;
  }

  releaseEvents(): UserEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
