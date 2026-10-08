import {
  type AuthenticatedUser,
  ChangeOwnPassword,
  ForbiddenWhileImpersonating,
  LogIn,
  LogOut,
  StopImpersonation,
} from '../../application/identity/mod.ts';
import { AuditedSecurityEventLog } from '../audit/mod.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
import { httpError } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlLoginAttemptLimiter,
  SqlSessionRepository,
  SqlUserRepository,
} from '../persistence/identity.ts';

export function presentUser(
  user: AuthenticatedUser,
): { user: Omit<AuthenticatedUser, 'sessionId'> } {
  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      teacherId: user.teacherId,
      mustChangePassword: user.mustChangePassword,
      impersonatedBy: user.impersonatedBy,
    },
  };
}

function current(scope: RequestScope): AuthenticatedUser {
  if (scope.user === null) throw httpError(401);
  return scope.user;
}

/** Rutas de sesión: /api/auth/* */
export function registerAuthRoutes(api: ApiApp): void {
  const { deps } = api;
  const securityLog = (scope: RequestScope) => new AuditedSecurityEventLog(scope.log, scope.tx);

  api.defineRoute(
    { method: 'POST', path: '/api/auth/login', access: 'public' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const logIn = new LogIn(
        new SqlUserRepository(scope.tx),
        new SqlSessionRepository(scope.tx),
        deps.hasher,
        deps.tokens,
        new SqlLoginAttemptLimiter(scope.tx, () => deps.clock.now()),
        securityLog(scope),
        deps.clock,
      );
      const result = await logIn.execute(
        body.requiredString('email'),
        body.requiredString('password'),
        scope.clientIp,
      );
      deps.cookie.attach(c, result.token.value);
      return c.json(presentUser(result.user));
    },
  );

  api.defineRoute(
    {
      method: 'POST',
      path: '/api/auth/logout',
      access: 'public',
      allowWithTemporaryPassword: true,
    },
    async (c, scope) => {
      const token = deps.cookie.read(c);
      if (token !== null) {
        await new LogOut(new SqlSessionRepository(scope.tx), deps.tokens, securityLog(scope))
          .execute(token);
      }
      deps.cookie.clear(c);
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'GET', path: '/api/auth/me', access: 'user', allowWithTemporaryPassword: true },
    (c, scope) => Promise.resolve(c.json(presentUser(current(scope)))),
  );

  api.defineRoute(
    { method: 'PUT', path: '/api/auth/password', access: 'user', allowWithTemporaryPassword: true },
    async (c, scope) => {
      const user = current(scope);
      if (user.impersonatedBy !== null) throw new ForbiddenWhileImpersonating();
      const body = await JsonBody.from(c.req.raw);
      const change = new ChangeOwnPassword(
        new SqlUserRepository(scope.tx),
        new SqlSessionRepository(scope.tx),
        deps.hasher,
        securityLog(scope),
        deps.clock,
      );
      await change.execute(
        user.id,
        user.sessionId,
        body.requiredString('currentPassword'),
        body.requiredString('newPassword'),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    {
      method: 'POST',
      path: '/api/auth/impersonation/stop',
      access: 'user',
      allowWithTemporaryPassword: true,
    },
    async (c, scope) => {
      const result = await new StopImpersonation(
        new SqlUserRepository(scope.tx),
        new SqlSessionRepository(scope.tx),
        deps.tokens,
        securityLog(scope),
        deps.clock,
      ).execute(current(scope));
      deps.cookie.attach(c, result.token.value);
      return c.json(presentUser(result.user));
    },
  );
}
