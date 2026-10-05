import { parseUuid } from '../../domain/common/mod.ts';
import { AuditActionNotFound, RestoreToPoint, UndoAction } from '../../application/audit/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { SqlAuditLog } from '../persistence/audit.ts';
import { PostgresAdvisoryLocks, SavepointTransactionRunner } from '../persistence/sql.ts';

/** Rutas del historial (solo superadministración): /api/admin/audit */
export function registerAuditRoutes(api: ApiApp): void {
  registerDomainErrors({
    AuditActionNotFound: [404, 'not_found'],
    NothingToUndo: [409, 'nothing_to_undo'],
    UndoConflict: [409, 'undo_conflict'],
  });
  const log = (scope: RequestScope) => new SqlAuditLog(scope.tx);
  const superadmin = (method: 'GET' | 'POST', path: string) => ({
    method,
    path,
    access: 'superadmin' as const,
  });

  api.defineRoute(superadmin('GET', '/api/admin/audit/actions'), async (c, scope) => {
    const user = c.req.query('userId');
    const before = c.req.query('before');
    return c.json({
      items: await log(scope).actions({
        userId: user ? parseUuid(user) : null,
        beforeSeq: before !== undefined && before !== '' && Number.isFinite(Number(before))
          ? Number(before)
          : null,
      }),
      people: await log(scope).people(),
    });
  });

  api.defineRoute(superadmin('GET', '/api/admin/audit/actions/:id'), async (c, scope) => {
    const id = param(c, 'id');
    const action = await log(scope).action(id);
    if (action === null) throw new AuditActionNotFound();
    return c.json({ action, changes: await log(scope).changes(id) });
  });

  api.defineRoute(superadmin('POST', '/api/admin/audit/actions/:id/undo'), async (c, scope) => {
    await new UndoAction(
      log(scope),
      log(scope),
      new SavepointTransactionRunner(scope.tx),
      new PostgresAdvisoryLocks(scope.tx),
    ).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(superadmin('POST', '/api/admin/audit/actions/:id/restore'), async (c, scope) => {
    const restore = new RestoreToPoint(
      log(scope),
      log(scope),
      new SavepointTransactionRunner(scope.tx),
      new PostgresAdvisoryLocks(scope.tx),
    );
    return c.json({ reverted: await restore.execute(param(c, 'id')) });
  });
}
