import { assertEquals } from '@std/assert';

import { EmailAddress, FullName } from '../../src/domain/common/mod.ts';
import { PlainPassword, type Role, User, UserId } from '../../src/domain/identity/mod.ts';
import { buildApp, type Config } from '../../src/container.ts';
import type { ApiContext } from '../../src/infrastructure/http/app.ts';
import { BcryptPasswordHasher } from '../../src/infrastructure/identity/security.ts';
import { SilentLogger } from '../../src/infrastructure/logging/mod.ts';
import { SqlUserRepository } from '../../src/infrastructure/persistence/identity.ts';
import { createDb, type Db } from '../../src/infrastructure/persistence/sql.ts';

export const PASSWORD = 'torre-de-marfil';

export const TEST_CONFIG: Config = {
  databaseUrl: Deno.env.get('TEST_DATABASE_URL') ??
    'postgresql://club:club@postgres:5432/club_test',
  sessionCookieName: 'pe_session',
  sessionCookieSecure: false,
  passwordHashCost: 4,
  documents: { kind: 'local', directory: '/tmp/puerta-elvira-test-documents' },
};

interface Shared {
  db: Db;
  fetch: (request: Request) => Promise<Response>;
}

let shared: Shared | null = null;

/** Reloj de la aplicación de test: la hora real, salvo mientras un test la fija con `atTime`. */
let fixedNow: Date | null = null;
const testClock = { now: () => (fixedNow === null ? new Date() : new Date(fixedNow)) };

/** Ejecuta `body` con la aplicación a esa hora (p. ej. para probar plazos) y luego vuelve a la real. */
export async function atTime<T>(instant: string, body: () => Promise<T>): Promise<T> {
  fixedNow = new Date(instant);
  try {
    return await body();
  } finally {
    fixedNow = null;
  }
}

/** Una sola aplicación y un solo pool para todos los tests del proceso. */
function app(): Shared {
  if (shared === null) {
    const db = createDb(TEST_CONFIG.databaseUrl, { max: 2 });
    const api = buildApp(TEST_CONFIG, { db, logger: new SilentLogger(), clock: testClock });
    // Rutas solo de test para probar el control de acceso por rol sin depender de un contexto concreto.
    const pong = (c: ApiContext) => Promise.resolve(c.json({ pong: true }));
    api.defineRoute({ method: 'GET', path: '/api/_ping', access: 'user' }, pong);
    api.defineRoute({ method: 'GET', path: '/api/admin/_ping', access: 'admin' }, pong);
    api.defineRoute({ method: 'GET', path: '/api/admin/audit/_ping', access: 'superadmin' }, pong);
    shared = { db, fetch: (request) => Promise.resolve(api.hono.fetch(request)) };
  }
  return shared;
}

export function db(): Db {
  return app().db;
}

/** Deja vacías las tablas de datos (no la de migraciones de PHP) antes de cada test. */
export async function resetDatabase(): Promise<void> {
  const rows = await db()`SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'`;
  const tables = rows.map((row) => row.tablename as string);
  if (tables.length > 0) {
    await db().unsafe(
      `TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

export async function createUser(
  email: string,
  role: Role = 'administrator',
  mustChangePassword = false,
): Promise<User> {
  const hasher = new BcryptPasswordHasher(TEST_CONFIG.passwordHashCost);
  const hash = await hasher.hash(PlainPassword.fromString(PASSWORD));
  const now = new Date();
  const user = User.register(
    UserId.generate(),
    EmailAddress.fromString(email),
    FullName.fromString('Lucía Moreno Gil'),
    role,
    hash,
    now,
  );
  if (!mustChangePassword) user.changePassword(hash, now);
  await new SqlUserRepository(db()).save(user);
  return user;
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

/** Cliente HTTP contra la aplicación en memoria, con la cookie de sesión como la guardaría un navegador. */
export class ApiClient {
  private cookie: string | null = null;

  /** Respuesta tal cual (p. ej. un documento descargado). */
  async raw(
    method: string,
    path: string,
    init: RequestInit & { ip?: string } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (this.cookie !== null) headers.set('Cookie', this.cookie);
    if (init.ip) headers.set('X-Forwarded-For', init.ip);
    const response = await app().fetch(
      new Request(`http://localhost${path}`, { ...init, method, headers }),
    );
    this.remember(response);
    return response;
  }

  async request(
    method: string,
    path: string,
    init: RequestInit & { ip?: string } = {},
  ): Promise<ApiResponse> {
    const response = await this.raw(method, path, init);
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text ? JSON.parse(text) : null,
    };
  }

  json(
    method: string,
    path: string,
    body: unknown = {},
    extra: { ip?: string } = {},
  ): Promise<ApiResponse> {
    return this.request(method, path, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      ...extra,
    });
  }

  get(path: string): Promise<ApiResponse> {
    return this.request('GET', path);
  }

  logIn(email: string, password = PASSWORD, ip?: string): Promise<ApiResponse> {
    return this.json('POST', '/api/auth/login', { email, password }, ip ? { ip } : {});
  }

  private remember(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';');
      const expired = attributes.some((a) => /^\s*max-age=0$/i.test(a));
      this.cookie = expired ? null : pair;
    }
  }
}

export function assertError(response: ApiResponse, status: number, code: string): void {
  assertEquals(
    response.status,
    status,
    `Se esperaba ${status}, respuesta: ${JSON.stringify(response.body)}`,
  );
  assertEquals((response.body as { error?: { code?: string } })?.error?.code, code);
}

export function errorMessage(response: ApiResponse): string {
  return String((response.body as { error?: { message?: string } })?.error?.message);
}

export function userIn(response: ApiResponse): Record<string, unknown> {
  return (response.body as { user: Record<string, unknown> }).user;
}
