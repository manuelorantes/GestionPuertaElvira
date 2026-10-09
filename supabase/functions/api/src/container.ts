import type { Clock } from './domain/common/mod.ts';
import { CheckHealth } from './application/health/mod.ts';
import { ApiApp } from './infrastructure/http/app.ts';
import { SessionCookie } from './infrastructure/http/cookie.ts';
import { registerAccountingRoutes } from './infrastructure/accounting/routes.ts';
import { registerAttendanceRoutes } from './infrastructure/attendance/routes.ts';
import {
  LocalDocumentStorage,
  SupabaseDocumentStorage,
} from './infrastructure/accounting/storage.ts';
import { registerAuditRoutes } from './infrastructure/audit/routes.ts';
import { registerUserRoutes } from './infrastructure/identity/users-routes.ts';
import { registerBillingRoutes } from './infrastructure/billing/routes.ts';
import { registerClassRoutes } from './infrastructure/classes/routes.ts';
import { registerDashboardRoutes } from './infrastructure/dashboard/routes.ts';
import { registerImportRoutes } from './infrastructure/import/routes.ts';
import { registerPayrollRoutes } from './infrastructure/payroll/routes.ts';
import { registerPointsRoutes } from './infrastructure/points/routes.ts';
import { registerAuthRoutes } from './infrastructure/identity/routes.ts';
import { registerStudentRoutes } from './infrastructure/students/routes.ts';
import { registerSystemRoutes } from './infrastructure/system/routes.ts';
import { registerTeacherRoutes } from './infrastructure/teachers/routes.ts';
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
  /** Adjuntos de facturas: carpeta local, o bucket privado de Supabase Storage en producción. */
  documents: { kind: 'local'; directory: string } | {
    kind: 'supabase';
    url: string;
    serviceKey: string;
    bucket: string;
  };
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
    documents: env('DOCUMENT_STORAGE_DIR')
      ? { kind: 'local', directory: env('DOCUMENT_STORAGE_DIR') ?? '' }
      : {
        kind: 'supabase',
        url: required('SUPABASE_URL'),
        serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
        bucket: env('DOCUMENT_BUCKET') ?? 'documentos',
      },
  };
}

/** Monta la aplicación completa: cada contexto registra sus rutas aquí, en el orden de los prefijos. */
export function buildApp(
  config: Config,
  options: { db?: Db; logger?: Logger; clock?: Clock } = {},
): ApiApp {
  const db = options.db ?? createDb(config.databaseUrl);
  const api = new ApiApp({
    db,
    logger: options.logger ?? new Logger(),
    clock: options.clock ?? { now: () => new Date() },
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
  registerTeacherRoutes(api);
  registerClassRoutes(api);
  registerStudentRoutes(api);
  registerBillingRoutes(api);
  registerPayrollRoutes(api);
  const storage = config.documents.kind === 'local'
    ? new LocalDocumentStorage(config.documents.directory)
    : new SupabaseDocumentStorage(
      config.documents.url,
      config.documents.serviceKey,
      config.documents.bucket,
    );
  registerAccountingRoutes(api, storage);
  registerAuditRoutes(api);
  registerUserRoutes(api);
  registerImportRoutes(api);
  registerDashboardRoutes(api);
  registerAttendanceRoutes(api);
  registerSystemRoutes(api);
  registerPointsRoutes(api);
  return api;
}
