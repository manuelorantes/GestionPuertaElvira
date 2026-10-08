import type { Clock } from '../../src/domain/common/mod.ts';
import { EmailAddress, FullName } from '../../src/domain/common/mod.ts';
import {
  PasswordHash,
  PlainPassword,
  type Role,
  Session,
  SessionId,
  SessionTokenHash,
  User,
  UserId,
} from '../../src/domain/identity/mod.ts';
import {
  type LoginAttemptLimiter,
  type PasswordHasher,
  type SecurityEventLog,
  type SecurityOutcome,
  type SessionRepository,
  SessionToken,
  type SessionTokenGenerator,
  type TemporaryPasswordGenerator,
  TooManyLoginAttempts,
  type UserRepository,
} from '../../src/application/identity/mod.ts';

export class FrozenClock implements Clock {
  private current: Date;

  constructor(now = '2026-10-02T10:00:00+02:00') {
    this.current = new Date(now);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();

  find(id: UserId): Promise<User | null> {
    return Promise.resolve(this.users.get(id.value) ?? null);
  }

  findByEmail(email: EmailAddress): Promise<User | null> {
    return Promise.resolve([...this.users.values()].find((u) => u.email.equals(email)) ?? null);
  }

  save(user: User): Promise<void> {
    user.releaseEvents();
    this.users.set(user.id.value, user);
    return Promise.resolve();
  }

  all(): Promise<User[]> {
    return Promise.resolve([...this.users.values()]);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, Session>();

  findByTokenHash(tokenHash: SessionTokenHash): Promise<Session | null> {
    return Promise.resolve(
      [...this.sessions.values()].find((s) => s.tokenHash.value === tokenHash.value) ?? null,
    );
  }

  save(session: Session): Promise<void> {
    this.sessions.set(session.id.value, session);
    return Promise.resolve();
  }

  remove(id: SessionId): Promise<void> {
    this.sessions.delete(id.value);
    return Promise.resolve();
  }

  removeAllForUser(userId: UserId, except?: SessionId): Promise<void> {
    for (const [key, session] of this.sessions) {
      if (session.userId.equals(userId) && !(except && session.id.equals(except))) {
        this.sessions.delete(key);
      }
    }
    return Promise.resolve();
  }

  forUser(userId: UserId): Session[] {
    return [...this.sessions.values()].filter((s) => s.userId.equals(userId));
  }
}

/** Hash reversible y legible para tests: "hashed:<secreto>". */
export class FakePasswordHasher implements PasswordHasher {
  verifications = 0;

  hash(password: PlainPassword): Promise<PasswordHash> {
    return Promise.resolve(new PasswordHash(`hashed:${password.reveal()}`));
  }

  verify(hash: PasswordHash, password: PlainPassword): Promise<boolean> {
    this.verifications++;
    const secret = password.reveal();
    return Promise.resolve(hash.value === `hashed:${secret}` || hash.value === `old:${secret}`);
  }

  needsRehash(hash: PasswordHash): boolean {
    return hash.value.startsWith('old:');
  }
}

/** Tokens predecibles («token-1», «token-2»…) con un hash determinista. */
export class SequentialSessionTokenGenerator implements SessionTokenGenerator {
  private sequence = 0;

  generate(): SessionToken {
    return new SessionToken(`token-${++this.sequence}`);
  }

  hash(token: SessionToken): SessionTokenHash {
    return new SessionTokenHash(fakeHash(token.value));
  }
}

function fakeHash(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(8, '0').repeat(8);
}

export class InMemoryLoginAttemptLimiter implements LoginAttemptLimiter {
  failures = new Map<string, number>();

  constructor(private readonly maxFailures = 5) {}

  assertCanAttempt(email: EmailAddress): Promise<void> {
    if ((this.failures.get(email.value) ?? 0) >= this.maxFailures) {
      return Promise.reject(new TooManyLoginAttempts(900));
    }
    return Promise.resolve();
  }

  recordFailure(email: EmailAddress): Promise<void> {
    this.failures.set(email.value, (this.failures.get(email.value) ?? 0) + 1);
    return Promise.resolve();
  }

  reset(email: EmailAddress): Promise<void> {
    this.failures.delete(email.value);
    return Promise.resolve();
  }
}

export interface RecordedEvent {
  event: string;
  outcome: SecurityOutcome;
  userId: string | null;
}

export class InMemorySecurityEventLog implements SecurityEventLog {
  events: RecordedEvent[] = [];

  record(event: string, outcome: SecurityOutcome, userId?: UserId | null): Promise<void> {
    this.events.push({ event, outcome, userId: userId?.value ?? null });
    return Promise.resolve();
  }
}

export class FixedTemporaryPasswordGenerator implements TemporaryPasswordGenerator {
  static readonly PASSWORD = 'temporal-peon-c4';

  generate(): PlainPassword {
    return PlainPassword.fromString(FixedTemporaryPasswordGenerator.PASSWORD);
  }
}

/** Conjunto de dobles de Identity listo para montar casos de uso en tests. */
export class IdentityFixture {
  static readonly EMAIL = 'junta@club.es';
  static readonly PASSWORD = 'torre-de-marfil';

  readonly users = new InMemoryUserRepository();
  readonly sessions = new InMemorySessionRepository();
  readonly hasher = new FakePasswordHasher();
  readonly tokens = new SequentialSessionTokenGenerator();
  readonly limiter = new InMemoryLoginAttemptLimiter();
  readonly log = new InMemorySecurityEventLog();
  readonly temporaryPasswords = new FixedTemporaryPasswordGenerator();
  readonly clock = new FrozenClock();

  async existingUser(
    options: {
      email?: string;
      passwordHash?: string;
      role?: Role;
      mustChangePassword?: boolean;
    } = {},
  ): Promise<User> {
    const hash = options.passwordHash ?? `hashed:${IdentityFixture.PASSWORD}`;
    const user = User.register(
      UserId.generate(),
      EmailAddress.fromString(options.email ?? IdentityFixture.EMAIL),
      FullName.fromString('Lucía Moreno Gil'),
      options.role ?? 'administrator',
      new PasswordHash(hash),
      this.clock.now(),
    );
    if (!options.mustChangePassword) user.changePassword(new PasswordHash(hash), this.clock.now());
    await this.users.save(user);
    return user;
  }

  async sessionFor(user: User, token: string): Promise<Session> {
    const session = Session.start(
      SessionId.generate(),
      this.tokens.hash(new SessionToken(token)),
      user.id,
      this.clock.now(),
    );
    await this.sessions.save(session);
    return session;
  }
}
