import { FiscalYearSummary, MonthLedger } from '../../application/accounting/mod.ts';
import { ClubSummary, FeesVsFixed, FeesVsFixedDetail } from '../../application/dashboard/mod.ts';
import { ExpectedPayroll, ListSettlements, PendingPayroll } from '../../application/payroll/mod.ts';
import { billing } from '../billing/routes.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
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
/** «Cuotas vs gastos fijos», con lo que suma cada parte de cada mes. */
function feesVsFixed(api: ApiApp, scope: RequestScope): FeesVsFixed {
  return new FeesVsFixed(
    billing(api, scope).list,
    new SqlAccountingRepository(scope.tx),
    new ExpectedPayroll(
      new SqlScheduleDirectory(scope.tx),
      new SqlDutyRepository(scope.tx),
      new SqlHolidayCalendar(scope.tx),
      new SqlTeacherRates(scope.tx),
    ),
    new PendingPayroll(
      new ListSettlements(
        new SqlTimesheetRepository(scope.tx),
        new SqlSettlementRepository(scope.tx),
        new SqlTeacherRates(scope.tx),
        new SqlAdvanceRepository(scope.tx),
      ),
    ),
    new SqlAccountingRepository(scope.tx),
  );
}

function monthLedger(scope: RequestScope): MonthLedger {
  return new MonthLedger(new SqlLedgerQuery(scope.tx), new SqlAccountingRepository(scope.tx));
}

/** Resumen del club: /api/admin/dashboard; el detalle de «Cuotas vs gastos fijos»: …/fees-vs-fixed */
export function registerDashboardRoutes(api: ApiApp): void {
  api.defineRoute(
    { method: 'GET', path: '/api/admin/dashboard', access: 'admin' },
    async (c, scope) => {
      const b = billing(api, scope);
      const summary = new ClubSummary(
        b.list,
        b.query,
        monthLedger(scope),
        new SqlStudentQuery(scope.tx, new SqlClassQuery(scope.tx)),
        new SqlClassQuery(scope.tx),
        api.deps.clock,
        new FiscalYearSummary(
          new SqlLedgerQuery(scope.tx),
          new SqlAccountingRepository(scope.tx),
          api.deps.clock,
        ),
        feesVsFixed(api, scope),
      );
      return c.json(await summary.execute());
    },
  );
  api.defineRoute(
    { method: 'GET', path: '/api/admin/dashboard/fees-vs-fixed', access: 'admin' },
    async (c, scope) => {
      const detail = new FeesVsFixedDetail(
        feesVsFixed(api, scope),
        monthLedger(scope),
        new SqlAccountingRepository(scope.tx),
        api.deps.clock,
      );
      return c.json(await detail.execute());
    },
  );
}
