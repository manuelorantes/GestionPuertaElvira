import { MonthLedger } from '../../application/accounting/mod.ts';
import { ClubSummary } from '../../application/dashboard/mod.ts';
import { billing } from '../billing/routes.ts';
import type { ApiApp } from '../http/app.ts';
import { SqlLedgerQuery } from '../persistence/accounting.ts';
import { SqlClassQuery } from '../persistence/classes.ts';
import { SqlStudentQuery } from '../persistence/students.ts';

/** Resumen del club: /api/admin/dashboard */
export function registerDashboardRoutes(api: ApiApp): void {
  api.defineRoute(
    { method: 'GET', path: '/api/admin/dashboard', access: 'admin' },
    async (c, scope) => {
      const b = billing(api, scope);
      const summary = new ClubSummary(
        b.list,
        b.query,
        new MonthLedger(new SqlLedgerQuery(scope.tx)),
        new SqlStudentQuery(scope.tx, new SqlClassQuery(scope.tx)),
        new SqlClassQuery(scope.tx),
        api.deps.clock,
      );
      return c.json(await summary.execute());
    },
  );
}
