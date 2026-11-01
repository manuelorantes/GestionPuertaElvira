import { FiscalYearSummary, MonthLedger } from '../../application/accounting/mod.ts';
import { ClubSummary } from '../../application/dashboard/mod.ts';
import { ExpectedPayroll, ListSettlements, PendingPayroll } from '../../application/payroll/mod.ts';
import { billing } from '../billing/routes.ts';
import type { ApiApp } from '../http/app.ts';
import { SqlAccountingRepository, SqlLedgerQuery } from '../persistence/accounting.ts';
import { SqlClassQuery } from '../persistence/classes.ts';
import {
  SqlAdvanceRepository,
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlScheduleDirectory,
  SqlSettlementRepository,
  SqlTeacherRates,
  SqlTimesheetRepository,
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
        new PendingPayroll(
          new ListSettlements(
            new SqlTimesheetRepository(scope.tx),
            new SqlSettlementRepository(scope.tx),
            new SqlTeacherRates(scope.tx),
            new SqlAdvanceRepository(scope.tx),
          ),
        ),
      );
      return c.json(await summary.execute());
    },
  );
}
