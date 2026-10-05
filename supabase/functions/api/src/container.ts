import { CheckHealth } from './application/health/mod.ts';
import { ApiApp } from './infrastructure/http/app.ts';
import { SessionCookie } from './infrastructure/http/cookie.ts';
import { registerAuthRoutes } from './infrastructure/identity/routes.ts';
import {
  BcryptPasswordHasher,
  RandomSessionTokenGenerator,
  RandomTemporaryPasswordGenerator,
} from './infrastructure/identity/security.ts';
import { Logger } from './infrastructure/logging/mod.ts';
import { createDb, type Db, SqlDatabaseHealth } from './infrastructure/persistence/sql.ts';

export interface Config {
  databaseUrl: string;
  sessionCookieName: string;
  sessionCookieSecure: boolean;
  /** Coste de bcrypt: 10 en producción; los tests lo bajan. */
  passwordHashCost: number;
}

/** La configuración llega por variables de entorno (compose.yaml en local, secretos de Supabase en producción). */
export function configFromEnv(env: (name: string) => string | undefined = Deno.env.get): Config {
  const required = (name: string) => {
    const value = env(name);
    if (!value) throw new Error(`Falta la variable de entorno ${name}`);
    return value;
  };
  return {
    databaseUrl: required('DATABASE_URL'),
    sessionCookieName: env('SESSION_COOKIE_NAME') ?? '__Host-pe_session',
    sessionCookieSecure: (env('SESSION_COOKIE_SECURE') ?? '1') !== '0',
    passwordHashCost: Number(env('PASSWORD_HASH_COST') ?? 10),
  };
}

/** Monta la aplicación completa: cada contexto registra sus rutas aquí, en el orden de los prefijos. */
export function buildApp(config: Config, options: { db?: Db; logger?: Logger } = {}): ApiApp {
  const db = options.db ?? createDb(config.databaseUrl);
  const api = new ApiApp({
    db,
    logger: options.logger ?? new Logger(),
    clock: { now: () => new Date() },
    cookie: new SessionCookie(config.sessionCookieName, config.sessionCookieSecure),
    hasher: new BcryptPasswordHasher(config.passwordHashCost),
    tokens: new RandomSessionTokenGenerator(),
    temporaryPasswords: new RandomTemporaryPasswordGenerator(),
  });

  const checkHealth = new CheckHealth(new SqlDatabaseHealth(db));
  api.defineBareRoute({ method: 'GET', path: '/api/health' }, async (c) => {
    const report = await checkHealth.execute();
    return c.json(
      { status: report.status, database: report.databaseReachable ? 'reachable' : 'unreachable' },
      report.status === 'healthy' ? 200 : 503,
    );
  });

  api.useRequestScope();
  registerAuthRoutes(api);
  return api;
}
