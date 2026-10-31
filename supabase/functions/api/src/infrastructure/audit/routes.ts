import { parseUuid } from '../../domain/common/mod.ts';
import {
  AuditActionNotFound,
  auditCategoryFrom,
  auditPeriodFrom,
  auditSectionFrom,
  periodFirstDay,
  RestoreToPoint,
  SECTION_TABLES,
  UndoAction,
} from '../../application/audit/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { SqlAuditLog } from '../persistence/audit.ts';
import { PostgresAdvisoryLocks, SavepointTransactionRunner } from '../persistence/sql.ts';

/** Rutas del historial: /api/admin/audit. Consultarlo, superadministración y el asistente; deshacer, solo la primera. */
export function registerAuditRoutes(api: ApiApp): void {
  registerDomainErrors({
    AuditActionNotFound: [404, 'not_found'],
    NothingToUndo: [409, 'nothing_to_undo'],
    UndoConflict: [409, 'undo_conflict'],
  });
  const log = (scope: RequestScope) => new SqlAuditLog(scope.tx);
  const superadmin = (path: string) => ({
    method: 'POST' as const,
    path,
    access: 'superadmin' as const,
  });
  const reader = (path: string) => ({
    method: 'GET' as const,
    path,
    access: 'auditReader' as const,
  });

  // ?section=students|payments|attendance (sin ella, todo) y ?period=today|week|month|all (sin él, todo).
  // ?category= (repetible) deja solo esas categorías; `categories` dice cuáles hay y cuántas, sin contar ese filtro.
  api.defineRoute(reader('/api/admin/audit/actions'), async (c, scope) => {
    const user = c.req.query('userId');
    const before = c.req.query('before');
    const section = c.req.query('section');
    const firstDay = periodFirstDay(
      auditPeriodFrom(c.req.query('period') ?? 'all'),
      api.deps.clock.now(),
    );
    const filter = {
      userId: user ? parseUuid(user) : null,
      beforeSeq: before !== undefined && before !== '' && Number.isFinite(Number(before))
        ? Number(before)
        : null,
      tables: section ? SECTION_TABLES[auditSectionFrom(section)] : null,
      since: firstDay?.startInMadrid() ?? null,
      sinceDay: firstDay,
      categories: c.req.queries('category')?.map(auditCategoryFrom) ?? null,
    };
    const people = await log(scope).people();
    if (section === 'payments') return c.json({ ...(await log(scope).payments(filter)), people });
    // Asistencia: una clase por fila (grupo y día), filtrada por el día de la clase.
    if (section === 'attendance') {
      return c.json({ items: await log(scope).classes(filter), people });
    }
    return c.json({
      items: await log(scope).actions(filter),
      people,
      categories: await log(scope).categories(filter),
    });
  });

  api.defineRoute(reader('/api/admin/audit/actions/:id'), async (c, scope) => {
    const id = param(c, 'id');
    const action = await log(scope).action(id);
    if (action === null) throw new AuditActionNotFound();
    return c.json({ action, ...(await log(scope).changes(id)) });
  });

  api.defineRoute(superadmin('/api/admin/audit/actions/:id/undo'), async (c, scope) => {
    await new UndoAction(
      log(scope),
      log(scope),
      new SavepointTransactionRunner(scope.tx),
      new PostgresAdvisoryLocks(scope.tx),
    ).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(superadmin('/api/admin/audit/actions/:id/restore'), async (c, scope) => {
    const restore = new RestoreToPoint(
      log(scope),
      log(scope),
      new SavepointTransactionRunner(scope.tx),
      new PostgresAdvisoryLocks(scope.tx),
    );
    return c.json({ reverted: await restore.execute(param(c, 'id')) });
  });
}
