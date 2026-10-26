import { FiscalYearSummary, MonthLedger } from '../../application/accounting/mod.ts';
import { ClubSummary } from '../../application/dashboard/mod.ts';
import { ExpectedPayroll } from '../../application/payroll/mod.ts';
import { billing } from '../billing/routes.ts';
import type { ApiApp } from '../http/app.ts';
import { SqlAccountingRepository, SqlLedgerQuery } from '../persistence/accounting.ts';
import { SqlFeeIncome } from '../persistence/billing.ts';
import { SqlClassQuery } from '../persistence/classes.ts';
import {
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlScheduleDirectory,
  SqlTeacherRates,
} from '../persistence/payroll.ts';
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
        new MonthLedger(new SqlLedgerQuery(scope.tx), new SqlAccountingRepository(scope.tx)),
        new SqlStudentQuery(scope.tx, new SqlClassQuery(scope.tx)),
        new SqlClassQuery(scope.tx),
        api.deps.clock,
        new SqlFeeIncome(scope.tx),
        new SqlAccountingRepository(scope.tx),
        new ExpectedPayroll(
          new SqlScheduleDirectory(scope.tx),
          new SqlDutyRepository(scope.tx),
          new SqlHolidayCalendar(scope.tx),
          new SqlTeacherRates(scope.tx),
        ),
        new FiscalYearSummary(
          new SqlLedgerQuery(scope.tx),
          new SqlAccountingRepository(scope.tx),
          api.deps.clock,
        ),
        new SqlAccountingRepository(scope.tx),
      );
      return c.json(await summary.execute());
    },
  );
}
