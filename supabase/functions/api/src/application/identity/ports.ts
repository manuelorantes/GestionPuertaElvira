import type { EmailAddress } from '../../domain/common/mod.ts';
import type {
  PasswordHash,
  PlainPassword,
  Session,
  SessionId,
  SessionTokenHash,
  TeacherLink,
  User,
  UserId,
} from '../../domain/identity/mod.ts';

export interface UserRepository {
  find(id: UserId): Promise<User | null>;
  findByEmail(email: EmailAddress): Promise<User | null>;
  save(user: User): Promise<void>;
}

/** Fichas de profesores a las que se puede vincular una cuenta de profesorado. */
export interface TeacherAccounts {
  exists(teacher: TeacherLink): Promise<boolean>;
  /** Cuenta ya vinculada a ese profesor, o null. */
  linkedUser(teacher: TeacherLink): Promise<UserId | null>;
}

export interface SessionRepository {
  findByTokenHash(tokenHash: SessionTokenHash): Promise<Session | null>;
  save(session: Session): Promise<void>;
  remove(id: SessionId): Promise<void>;
  removeAllForUser(userId: UserId, except?: SessionId): Promise<void>;
}

export interface PasswordHasher {
  hash(password: PlainPassword): Promise<PasswordHash>;
  verify(hash: PasswordHash, password: PlainPassword): Promise<boolean>;
  needsRehash(hash: PasswordHash): boolean;
}

/** Token de sesión en claro: solo existe en memoria y en la cookie del navegador. */
export class SessionToken {
  constructor(readonly value: string) {}

  toString(): string {
    return '[oculto]';
  }

  toJSON(): string {
    return '[oculto]';
  }
}

export interface SessionTokenGenerator {
  generate(): SessionToken;
  hash(token: SessionToken): SessionTokenHash;
}

export interface TemporaryPasswordGenerator {
  /** Genera una contraseña que cumple la política y es fácil de dictar. */
  generate(): PlainPassword;
}

export interface LoginAttemptLimiter {
  /** @throws TooManyLoginAttempts */
  assertCanAttempt(email: EmailAddress, clientIp: string): Promise<void>;
  recordFailure(email: EmailAddress, clientIp: string): Promise<void>;
  reset(email: EmailAddress): Promise<void>;
}

export type SecurityOutcome = 'success' | 'failure';

/** Registro de eventos de seguridad. Nunca recibe emails ni contraseñas. */
export interface SecurityEventLog {
  record(event: string, outcome: SecurityOutcome, userId?: UserId | null): Promise<void>;
}
