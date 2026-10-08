import { type Context, Hono } from '@hono/hono';
import type { TransactionSql } from 'postgres';

import type { Clock } from '../../domain/common/mod.ts';
import { generateUuidV7 } from '../../domain/common/mod.ts';
import {
  type AuthenticatedUser,
  AuthenticateSession,
  type PasswordHasher,
  SessionNotValid,
  type SessionTokenGenerator,
  type TemporaryPasswordGenerator,
} from '../../application/identity/mod.ts';
import { AuditLabels, startAuditAction } from '../audit/mod.ts';
import { SqlSessionRepository, SqlUserRepository } from '../persistence/identity.ts';
import { type Db, inTransaction } from '../persistence/sql.ts';
import { Logger } from '../logging/mod.ts';
import type { SessionCookie } from './cookie.ts';
import {
  ApiProblem,
  errorEnvelope,
  httpError,
  isOperationalError,
  toErrorResponse,
} from './errors.ts';

export interface AppDeps {
  db: Db;
  logger: Logger;
  clock: Clock;
  cookie: SessionCookie;
  hasher: PasswordHasher;
  tokens: SessionTokenGenerator;
  temporaryPasswords: TemporaryPasswordGenerator;
}

/** Lo que una petición autenticada (o anónima) tiene a su disposición: su transacción, su log y su usuario. */
export interface RequestScope {
  tx: TransactionSql;
  log: Logger;
  user: AuthenticatedUser | null;
  requestId: string;
  clientIp: string;
}

export type Env = { Variables: { scope: RequestScope } };
export type Api = Hono<Env>;
export type ApiContext = Context<Env>;

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** `teacher`: cuenta de profesorado vinculada a un profesor (las rutas toman el profesor de la sesión). */
export type Access = 'public' | 'user' | 'admin' | 'superadmin' | 'teacher';

export interface RouteOptions {
  method: Method;
  path: string;
  access: Access;
  /** Solo la subida de documentos admite multipart (con X-Requested-With: fetch). */
  upload?: boolean;
  /** Con una contraseña temporal solo se puede consultar la sesión, cambiarla o salir. */
  allowWithTemporaryPassword?: boolean;
}

export type RouteHandler = (c: ApiContext, scope: RequestScope) => Promise<Response>;

const STATE_CHANGING: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Aplicación HTTP: cabeceras comunes, una transacción por petición con el usuario autenticado y el contexto
 * del historial, y el sobre de error uniforme. Cada contexto añade sus rutas con `defineRoute`.
 */
export class ApiApp {
  readonly hono: Api = new Hono<Env>();
  private readonly routes: { method: Method; pattern: RegExp }[] = [];

  constructor(readonly deps: AppDeps) {
    const { hono } = this;
    hono.use('/api/*', async (c, next) => {
      const requestId = generateUuidV7();
      await next();
      c.res.headers.set('X-Request-Id', requestId);
      c.res.headers.set('Cache-Control', 'no-store, private');
    });
    hono.onError((error, c) => {
      const scope = c.get('scope') as RequestScope | undefined;
      return toErrorResponse(error, scope?.log ?? deps.logger);
    });
    hono.notFound((c) => {
      const path = new URL(c.req.url).pathname;
      if (!path.startsWith('/api')) return c.text('Not found', 404);
      const otherMethod = this.routes.some((r) =>
        r.method !== c.req.method && r.pattern.test(path)
      );
      return otherMethod
        ? toErrorResponse(httpError(405), deps.logger)
        : toErrorResponse(httpError(404), deps.logger);
    });
  }

  /** Rutas que no necesitan base de datos ni sesión: se registran antes del middleware de la petición. */
  defineBareRoute(
    options: Pick<RouteOptions, 'method' | 'path'>,
    handler: (c: ApiContext) => Promise<Response>,
  ): void {
    this.remember(options.method, options.path);
    this.hono.on(options.method, options.path, async (c) => {
      try {
        return await handler(c);
      } catch (error) {
        if (isOperationalError(error)) return toErrorResponse(error, this.deps.logger);
        throw error;
      }
    });
  }

  /** Abre la transacción de la petición y resuelve el usuario de la cookie. Debe llamarse tras las rutas «bare». */
  useRequestScope(): void {
    const { deps } = this;
    this.hono.use('/api/*', async (c, next) => {
      const requestId = generateUuidV7();
      const log = deps.logger.child({ request_id: requestId });
      await inTransaction(deps.db, async (tx) => {
        const user = await this.authenticate(c, tx);
        c.set('scope', { tx, log, user, requestId, clientIp: clientIp(c) });
        await next();
        // Un error de programación deshace toda la petición; los operacionales ya se respondieron dentro.
        if (c.error) throw c.error;
      });
    });
  }

  defineRoute(options: RouteOptions, handler: RouteHandler): void {
    this.remember(options.method, options.path);
    this.hono.on(options.method, options.path, async (c) => {
      const scope = c.get('scope');
      try {
        enforceJsonPolicy(c, options);
        enforceAccess(scope.user, options);
        await startAuditAction(
          scope.tx,
          scope.user,
          AuditLabels.route(options.method, options.path),
        );
        return await handler(c, scope);
      } catch (error) {
        if (isOperationalError(error)) return toErrorResponse(error, scope.log);
        throw error;
      }
    });
  }

  private remember(method: Method, path: string): void {
    const pattern = new RegExp(`^${path.replace(/:[A-Za-z]+/g, '[^/]+')}$`);
    this.routes.push({ method, pattern });
  }

  private async authenticate(c: ApiContext, tx: TransactionSql): Promise<AuthenticatedUser | null> {
    const token = this.deps.cookie.read(c);
    if (token === null) return null;
    const authenticate = new AuthenticateSession(
      new SqlSessionRepository(tx),
      new SqlUserRepository(tx),
      this.deps.tokens,
      this.deps.clock,
    );
    try {
      return await authenticate.execute(token);
    } catch (error) {
      if (error instanceof SessionNotValid) return null;
      throw error;
    }
  }
}

/**
 * Las peticiones que cambian estado deben ser JSON (defensa CSRF en profundidad). Solo la subida de documentos
 * admite multipart, y entonces exige X-Requested-With, que un formulario de otro sitio no puede enviar.
 */
function enforceJsonPolicy(c: ApiContext, options: RouteOptions): void {
  if (!STATE_CHANGING.has(c.req.method)) return;
  const contentType = c.req.header('content-type') ?? '';
  if (options.upload && contentType.startsWith('multipart/form-data')) {
    if (c.req.header('x-requested-with') !== 'fetch') {
      throw new ApiProblem(403, 'forbidden', 'Subida no permitida.');
    }
    return;
  }
  if (!/^application\/([a-z0-9.+-]+\+)?json\b/i.test(contentType)) throw httpError(415);
}

/** Roles con acceso de administración (el asistente actúa en nombre de la junta). */
const ADMIN_ROLES: ReadonlySet<string> = new Set([
  'administrator',
  'superadministrator',
  'assistant',
]);

function enforceAccess(user: AuthenticatedUser | null, options: RouteOptions): void {
  if (options.access === 'public') return;
  if (user === null) throw httpError(401);
  const allowed = options.access === 'user' ||
    (options.access === 'admin' && ADMIN_ROLES.has(user.role)) ||
    (options.access === 'superadmin' && user.role === 'superadministrator') ||
    (options.access === 'teacher' && user.role === 'teacher');
  if (!allowed) throw httpError(403);
  if (options.access === 'teacher' && user.teacherId === null) {
    throw new ApiProblem(
      403,
      'teacher_not_linked',
      'Tu cuenta aún no está vinculada a ningún profesor. Pídeselo a administración.',
    );
  }
  if (user.mustChangePassword && !options.allowWithTemporaryPassword) {
    throw new ApiProblem(
      403,
      'password_change_required',
      'Tienes que cambiar tu contraseña temporal antes de continuar.',
    );
  }
}

/** Profesor de la sesión en una ruta con acceso `teacher` (nunca llega por parámetro). */
export function sessionTeacher(scope: RequestScope): string {
  const teacher = scope.user?.teacherId ?? null;
  if (teacher === null) throw httpError(403);
  return teacher;
}

/** Parámetro de la ruta (`:id`); Hono lo tipa como opcional en rutas registradas por texto. */
export function param(c: ApiContext, name: string): string {
  const value = c.req.param(name);
  if (value === undefined) throw httpError(404);
  return value;
}

/** La IP real llega en X-Viewer-Ip (función de borde de CloudFront) o en X-Forwarded-For (nginx en local). */
function clientIp(c: ApiContext): string {
  const viewer = c.req.header('x-viewer-ip');
  if (viewer) return viewer;
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

export { errorEnvelope };
