import { EmailAddress, FullName } from '../../domain/common/mod.ts';
import {
  type AccountStatus,
  PasswordHash,
  roleFromName,
  Session,
  SessionId,
  SessionTokenHash,
  User,
  UserId,
} from '../../domain/identity/mod.ts';
import {
  type LoginAttemptLimiter,
  type SessionRepository,
  TooManyLoginAttempts,
  type UserDirectory,
  type UserListItem,
  type UserRepository,
} from '../../application/identity/mod.ts';
import { AuditLabels } from '../audit/mod.ts';
import { Row, type Sql } from './sql.ts';

function toUser(row: Row): User {
  return User.restore({
    id: UserId.fromString(row.string('id')),
    email: EmailAddress.fromString(row.string('email')),
    fullName: FullName.fromString(row.string('full_name')),
    role: roleFromName(row.string('role')),
    passwordHash: new PasswordHash(row.string('password_hash')),
    status: row.string('status') as AccountStatus,
    mustChangePassword: row.bool('must_change_password'),
    createdAt: row.date('created_at'),
    passwordChangedAt: row.date('password_changed_at'),
  });
}

export class SqlUserRepository implements UserRepository {
  constructor(private readonly sql: Sql) {}

  async find(id: UserId): Promise<User | null> {
    const rows = await this.sql`SELECT * FROM identity_user WHERE id = ${id.value}`;
    return rows[0] ? toUser(new Row(rows[0])) : null;
  }

  async findByEmail(email: EmailAddress): Promise<User | null> {
    const rows = await this.sql`SELECT * FROM identity_user WHERE email = ${email.value}`;
    return rows[0] ? toUser(new Row(rows[0])) : null;
  }

  async save(user: User): Promise<void> {
    user.releaseEvents();
    const record = {
      id: user.id.value,
      email: user.email.value,
      full_name: user.fullName.value,
      role: user.role(),
      password_hash: user.passwordHash().value,
      status: user.status(),
      must_change_password: user.mustChangePassword(),
      created_at: user.createdAt,
      password_changed_at: user.passwordChangedAt(),
    };
    await this.sql`
      INSERT INTO identity_user ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET ${
      this.sql(
        record,
        'email',
        'full_name',
        'role',
        'password_hash',
        'status',
        'must_change_password',
        'password_changed_at',
      )
    }`;
  }
}

function toSession(row: Row): Session {
  return Session.restore(
    SessionId.fromString(row.string('id')),
    new SessionTokenHash(row.string('token_hash')),
    UserId.fromString(row.string('user_id')),
    row.date('started_at'),
    row.date('last_activity_at'),
    row.nullableString('impersonator_id') === null
      ? null
      : UserId.fromString(row.string('impersonator_id')),
  );
}

export class SqlSessionRepository implements SessionRepository {
  constructor(private readonly sql: Sql) {}

  async findByTokenHash(tokenHash: SessionTokenHash): Promise<Session | null> {
    const rows = await this
      .sql`SELECT * FROM identity_session WHERE token_hash = ${tokenHash.value}`;
    return rows[0] ? toSession(new Row(rows[0])) : null;
  }

  async save(session: Session): Promise<void> {
    const record = {
      id: session.id.value,
      token_hash: session.tokenHash.value,
      user_id: session.userId.value,
      started_at: session.startedAt,
      last_activity_at: session.lastActivityAt(),
      impersonator_id: session.impersonator?.value ?? null,
    };
    await this.sql`
      INSERT INTO identity_session ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET last_activity_at = EXCLUDED.last_activity_at`;
  }

  async remove(id: SessionId): Promise<void> {
    await this.sql`DELETE FROM identity_session WHERE id = ${id.value}`;
  }

  async removeAllForUser(userId: UserId, except?: SessionId): Promise<void> {
    await this.sql`DELETE FROM identity_session WHERE user_id = ${userId.value}
      AND id <> ${except?.value ?? '00000000-0000-0000-0000-000000000000'}`;
  }
}

/**
 * Intentos de acceso fallidos por email (hash, nunca el email en claro) y por IP, en ventanas de 15 minutos:
 * 5 por email y 30 por IP (frena el «password spraying»). Tabla `identity_login_attempt`.
 */
export class SqlLoginAttemptLimiter implements LoginAttemptLimiter {
  static readonly WINDOW_SECONDS = 15 * 60;
  static readonly PER_EMAIL = 5;
  static readonly PER_IP = 30;

  constructor(
    private readonly sql: Sql,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async assertCanAttempt(email: EmailAddress, clientIp: string): Promise<void> {
    for (
      const [key, limit] of [
        [await emailKey(email), SqlLoginAttemptLimiter.PER_EMAIL],
        [ipKey(clientIp), SqlLoginAttemptLimiter.PER_IP],
      ] as const
    ) {
      const rows = await this
        .sql`SELECT failures, window_started_at FROM identity_login_attempt WHERE key = ${key}`;
      const row = rows[0] ? new Row(rows[0]) : null;
      if (row === null) continue;
      const resetsAt = row.date('window_started_at').getTime() +
        SqlLoginAttemptLimiter.WINDOW_SECONDS * 1000;
      const remaining = Math.ceil((resetsAt - this.now().getTime()) / 1000);
      if (row.int('failures') >= limit && remaining > 0) throw new TooManyLoginAttempts(remaining);
    }
  }

  async recordFailure(email: EmailAddress, clientIp: string): Promise<void> {
    const now = this.now();
    const windowStart = new Date(now.getTime() - SqlLoginAttemptLimiter.WINDOW_SECONDS * 1000);
    for (const key of [await emailKey(email), ipKey(clientIp)]) {
      await this.sql`
        INSERT INTO identity_login_attempt (key, failures, window_started_at) VALUES (${key}, 1, ${now})
        ON CONFLICT (key) DO UPDATE SET
          failures = CASE WHEN identity_login_attempt.window_started_at < ${windowStart} THEN 1 ELSE identity_login_attempt.failures + 1 END,
          window_started_at = CASE WHEN identity_login_attempt.window_started_at < ${windowStart} THEN ${now} ELSE identity_login_attempt.window_started_at END`;
    }
  }

  async reset(email: EmailAddress): Promise<void> {
    await this.sql`DELETE FROM identity_login_attempt WHERE key = ${await emailKey(email)}`;
  }

  /** Las pruebas repetidas no deben quedar bloqueadas por intentos de ejecuciones anteriores. */
  async clear(): Promise<void> {
    await this.sql`DELETE FROM identity_login_attempt`;
  }
}

async function emailKey(email: EmailAddress): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.value));
  return `email:${
    [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }`;
}

function ipKey(clientIp: string): string {
  return `ip:${clientIp}`.slice(0, 80);
}

/** Cuentas para la sección Usuarios, con su última conexión (último inicio de sesión o actividad de sesión). */
export class SqlUserDirectory implements UserDirectory {
  constructor(private readonly sql: Sql) {}

  async list(): Promise<UserListItem[]> {
    const rows = await this.sql`
      SELECT u.id, u.email, u.full_name, u.role, u.status, u.must_change_password, u.created_at,
             GREATEST(
               (SELECT max(s.last_activity_at) FROM identity_session s WHERE s.user_id = u.id),
               (SELECT max(a.occurred_at) FROM audit_action a
                 WHERE a.kind = 'security' AND a.user_id = u.id AND a.label = ${LOGIN_LABEL})
             ) AS last_seen_at
        FROM identity_user u ORDER BY u.full_name, u.email`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      email: r.string('email'),
      fullName: r.string('full_name'),
      role: roleFromName(r.string('role')),
      status: r.string('status') === 'disabled' ? 'disabled' : 'active',
      mustChangePassword: r.bool('must_change_password'),
      createdAt: r.date('created_at').toISOString(),
      lastSeenAt: r.json('last_seen_at') === null ? null : r.date('last_seen_at').toISOString(),
    }));
  }

  async emailOf(id: string): Promise<string | null> {
    const rows = await this.sql`SELECT email FROM identity_user WHERE id::text = ${id}`;
    return rows[0] ? new Row(rows[0]).string('email') : null;
  }
}

const LOGIN_LABEL = AuditLabels.security('login', 'success');
