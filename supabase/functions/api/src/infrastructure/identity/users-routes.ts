import { EmailAddress } from '../../domain/common/mod.ts';
import {
  ChangeUserRole,
  DisableUser,
  EnableUser,
  LinkTeacher,
  ListUsers,
  RegisterUser,
  ResetUserPassword,
  StartImpersonation,
  UserNotFound,
} from '../../application/identity/mod.ts';
import { AuditedSecurityEventLog } from '../audit/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { httpError } from '../http/errors.ts';
import { presentUser } from './routes.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlSessionRepository,
  SqlTeacherAccounts,
  SqlUserDirectory,
  SqlUserRepository,
} from '../persistence/identity.ts';

/** Sección Usuarios (solo superadministración): /api/admin/users */
export function registerUserRoutes(api: ApiApp): void {
  const { deps } = api;
  const route = (method: 'GET' | 'POST' | 'PUT', path: string) =>
    ({ method, path, access: 'superadmin' }) as const;
  const users = (scope: RequestScope) => new SqlUserRepository(scope.tx);
  const sessions = (scope: RequestScope) => new SqlSessionRepository(scope.tx);
  const log = (scope: RequestScope) => new AuditedSecurityEventLog(scope.log, scope.tx);
  const linkTeacher = (scope: RequestScope) =>
    new LinkTeacher(users(scope), new SqlTeacherAccounts(scope.tx), log(scope), deps.clock);
  const actor = (scope: RequestScope) => {
    if (scope.user === null) throw httpError(401);
    return scope.user.id;
  };
  const emailOf = async (scope: RequestScope, id: string) => {
    const email = await new SqlUserDirectory(scope.tx).emailOf(id);
    if (email === null) throw new UserNotFound();
    return email;
  };

  api.defineRoute(route('GET', '/api/admin/users'), async (c, scope) => {
    return c.json({ items: await new ListUsers(new SqlUserDirectory(scope.tx)).execute() });
  });

  api.defineRoute(route('POST', '/api/admin/users'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    const email = body.requiredString('email');
    const temporaryPassword = await new RegisterUser(
      users(scope),
      deps.hasher,
      deps.temporaryPasswords,
      log(scope),
      deps.clock,
    ).execute(email, body.requiredString('fullName'), body.requiredString('role'));
    // Una cuenta de profesorado puede nacer ya vinculada a su profesor.
    const teacherId = body.optionalString('teacherId');
    if (teacherId) await linkTeacher(scope).execute(email, teacherId);
    const id = (await users(scope).findByEmail(EmailAddress.fromString(email)))?.id.value ?? null;
    // La contraseña temporal solo se muestra esta vez; hay que cambiarla al entrar.
    return c.json({ id, temporaryPassword }, 201);
  });

  api.defineRoute(route('POST', '/api/admin/users/:id/password-reset'), async (c, scope) => {
    const temporaryPassword = await new ResetUserPassword(
      users(scope),
      sessions(scope),
      deps.hasher,
      deps.temporaryPasswords,
      log(scope),
      deps.clock,
    ).execute(await emailOf(scope, param(c, 'id')));
    return c.json({ temporaryPassword });
  });

  api.defineRoute(route('POST', '/api/admin/users/:id/disable'), async (c, scope) => {
    await new DisableUser(users(scope), sessions(scope), log(scope)).execute(
      await emailOf(scope, param(c, 'id')),
      actor(scope),
    );
    return c.body(null, 204);
  });

  api.defineRoute(route('POST', '/api/admin/users/:id/enable'), async (c, scope) => {
    await new EnableUser(users(scope), log(scope)).execute(await emailOf(scope, param(c, 'id')));
    return c.body(null, 204);
  });

  api.defineRoute(route('POST', '/api/admin/users/:id/impersonate'), async (c, scope) => {
    if (scope.user === null) throw httpError(401);
    const result = await new StartImpersonation(
      users(scope),
      sessions(scope),
      deps.tokens,
      log(scope),
      deps.clock,
    ).execute(scope.user, param(c, 'id'));
    deps.cookie.attach(c, result.token.value);
    return c.json(presentUser(result.user));
  });

  api.defineRoute(route('PUT', '/api/admin/users/:id/role'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await new ChangeUserRole(users(scope), log(scope)).execute(
      await emailOf(scope, param(c, 'id')),
      body.requiredString('role'),
      actor(scope),
    );
    return c.body(null, 204);
  });

  api.defineRoute(route('PUT', '/api/admin/users/:id/teacher'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await linkTeacher(scope).execute(
      await emailOf(scope, param(c, 'id')),
      body.optionalString('teacherId'),
    );
    return c.body(null, 204);
  });
}
