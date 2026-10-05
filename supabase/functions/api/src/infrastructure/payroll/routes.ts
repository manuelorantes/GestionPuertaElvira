import { InvalidValue, LocalDate, YearMonth } from '../../domain/common/mod.ts';
import {
  DeleteSession,
  ListSettlements,
  MarkHoliday,
  PayAllSettlements,
  PaySettlement,
  Profitability,
  ProposeMonthSessions,
  RecordSession,
  UpdateSession,
} from '../../application/payroll/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { httpError, registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import { SqlBillingSettingsRepository, SqlClosedPeriods } from '../persistence/billing.ts';
import {
  SqlPayrollQuery,
  SqlScheduleDirectory,
  SqlSettlementRepository,
  SqlTeacherRates,
  SqlTimesheetRepository,
} from '../persistence/payroll.ts';
import { PostgresAdvisoryLocks, SavepointTransactionRunner } from '../persistence/sql.ts';

/** Casos de uso de nómina montados sobre la transacción de la petición. */
function payroll(api: ApiApp, scope: RequestScope) {
  const { clock } = api.deps;
  const tx = scope.tx;
  const timesheets = new SqlTimesheetRepository(tx);
  const settlements = new SqlSettlementRepository(tx);
  const teachers = new SqlTeacherRates(tx);
  const schedule = new SqlScheduleDirectory(tx);
  const transactions = new SavepointTransactionRunner(tx);
  const locks = new PostgresAdvisoryLocks(tx);
  const today = () => LocalDate.fromInstant(clock.now());
  const list = new ListSettlements(timesheets, settlements, teachers);
  const pay = new PaySettlement(
    timesheets,
    settlements,
    teachers,
    new SqlClosedPeriods(tx),
    transactions,
    locks,
  );
  return {
    timesheets,
    settlements,
    teachers,
    schedule,
    today,
    query: new SqlPayrollQuery(tx, today),
    propose: new ProposeMonthSessions(
      schedule,
      timesheets,
      settlements,
      settlements,
      clock,
      transactions,
      locks,
    ),
    list,
    pay,
    payAll: new PayAllSettlements(pay, list, transactions),
    profitability: new Profitability(list, new SqlPayrollQuery(tx, today), teachers),
    settings: new SqlBillingSettingsRepository(tx),
  };
}

function hours(body: JsonBody): number {
  const value = body.optionalNumber('hours');
  if (value === null) throw new InvalidValue('hours', 'Indica las horas.');
  return value;
}

/** Rutas de nómina del profesorado: /api/admin/payroll */
export function registerPayrollRoutes(api: ApiApp): void {
  registerDomainErrors({
    SessionNotFound: [404, 'not_found'],
    SettlementAlreadyPaid: [409, 'settlement_paid'],
  });
  const admin = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string) => ({
    method,
    path,
    access: 'admin' as const,
  });
  const month = (
    c: Parameters<Parameters<ApiApp['defineRoute']>[1]>[0],
    p: ReturnType<typeof payroll>,
  ) => {
    const value = c.req.query('month');
    return value ? YearMonth.fromString(value) : YearMonth.of(p.today());
  };
  const paidOn = async (
    c: Parameters<Parameters<ApiApp['defineRoute']>[1]>[0],
    p: ReturnType<typeof payroll>,
  ) => (await JsonBody.from(c.req.raw)).optionalString('date') ?? p.today().toString();

  api.defineRoute(admin('GET', '/api/admin/payroll/sessions'), async (c, scope) => {
    const p = payroll(api, scope);
    const period = month(c, p);
    await p.propose.execute(period.toString());
    const teacher = c.req.query('teacherId');
    return c.json({
      month: period.toString(),
      items: await p.query.sessions(period, teacher ? teacher : null),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/payroll/sessions'), async (c, scope) => {
    const p = payroll(api, scope);
    const b = await JsonBody.from(c.req.raw);
    const id = await new RecordSession(p.timesheets, p.settlements, p.schedule, p.teachers).execute(
      {
        teacherId: b.requiredString('teacherId'),
        date: b.requiredString('date'),
        groupId: b.optionalString('groupId'),
        activity: b.optionalString('activity'),
        hours: hours(b),
      },
    );
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('PUT', '/api/admin/payroll/sessions/:id'), async (c, scope) => {
    const p = payroll(api, scope);
    const b = await JsonBody.from(c.req.raw);
    await new UpdateSession(p.timesheets, p.settlements, p.teachers).execute(
      param(c, 'id'),
      b.requiredString('teacherId'),
      hours(b),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('DELETE', '/api/admin/payroll/sessions/:id'), async (c, scope) => {
    const p = payroll(api, scope);
    await new DeleteSession(p.timesheets, p.settlements).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/api/admin/payroll/holidays'), async (c, scope) => {
    const p = payroll(api, scope);
    const removed = await new MarkHoliday(p.timesheets, p.settlements).execute(
      (await JsonBody.from(c.req.raw)).requiredString('date'),
    );
    return c.json({ removed });
  });

  api.defineRoute(admin('GET', '/api/admin/payroll/settlements'), async (c, scope) => {
    const p = payroll(api, scope);
    const period = month(c, p);
    await p.propose.execute(period.toString());
    return c.json({ month: period.toString(), items: await p.list.execute(period.toString()) });
  });

  api.defineRoute(
    admin('GET', '/api/admin/payroll/settlements/:teacherId/:month'),
    async (c, scope) => {
      const p = payroll(api, scope);
      const teacherId = param(c, 'teacherId');
      const match = (await p.list.execute(param(c, 'month'))).find((s) =>
        s.teacherId === teacherId
      );
      if (!match) throw httpError(404);
      const club = (await p.settings.get()).club;
      return c.json({
        ...match,
        club: { name: club.name, taxId: club.taxId, address: club.address },
      });
    },
  );

  api.defineRoute(
    admin('POST', '/api/admin/payroll/settlements/:teacherId/:month/payment'),
    async (c, scope) => {
      const p = payroll(api, scope);
      await p.pay.execute(param(c, 'teacherId'), param(c, 'month'), await paidOn(c, p));
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    admin('POST', '/api/admin/payroll/settlements/:month/payment'),
    async (c, scope) => {
      const p = payroll(api, scope);
      return c.json({ paid: await p.payAll.execute(param(c, 'month'), await paidOn(c, p)) });
    },
  );

  api.defineRoute(admin('GET', '/api/admin/payroll/profitability'), async (c, scope) => {
    const p = payroll(api, scope);
    const period = month(c, p);
    await p.propose.execute(period.toString());
    return c.json({
      month: period.toString(),
      items: await p.profitability.execute(period.toString()),
    });
  });
}
