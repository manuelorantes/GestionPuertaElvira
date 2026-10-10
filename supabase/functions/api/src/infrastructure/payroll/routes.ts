import { InvalidValue, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import {
  AddHoliday,
  CancelSubstitution,
  ChangeSettlementPaymentDate,
  DeleteAdvance,
  DeleteDuty,
  DeleteSession,
  ListSessions,
  ListSettlements,
  PayAllSettlements,
  PaySettlement,
  PlanSubstitution,
  Profitability,
  RecordAdvance,
  RecordSession,
  RefillDay,
  RemoveHoliday,
  SaveDuty,
  SubstituteTeacher,
  TeacherReport,
  UpdateSession,
} from '../../application/payroll/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { httpError, registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import { billing } from '../billing/routes.ts';
import { SqlBillingSettingsRepository, SqlClosedPeriods } from '../persistence/billing.ts';
import {
  SqlAdvanceRepository,
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlMonthlyFees,
  SqlPayrollQuery,
  SqlPlanningQuery,
  SqlScheduleDirectory,
  SqlSettlementRepository,
  SqlSubstitutionRepository,
  SqlTeacherRates,
  SqlTeacherReportQuery,
  SqlTimesheetRepository,
} from '../persistence/payroll.ts';
import { PostgresAdvisoryLocks, SavepointTransactionRunner } from '../persistence/sql.ts';
import { dutyKindFromName } from '../../domain/payroll/mod.ts';

/** Casos de uso de nómina montados sobre la transacción de la petición. */
function payroll(api: ApiApp, scope: RequestScope) {
  const { clock } = api.deps;
  const tx = scope.tx;
  const timesheets = new SqlTimesheetRepository(tx);
  const settlements = new SqlSettlementRepository(tx);
  const teachers = new SqlTeacherRates(tx);
  const schedule = new SqlScheduleDirectory(tx);
  const duties = new SqlDutyRepository(tx);
  const substitutions = new SqlSubstitutionRepository(tx);
  const holidays = new SqlHolidayCalendar(tx);
  const transactions = new SavepointTransactionRunner(tx);
  const locks = new PostgresAdvisoryLocks(tx);
  const today = () => LocalDate.fromInstant(clock.now());
  const advances = new SqlAdvanceRepository(tx);
  const list = new ListSettlements(timesheets, settlements, teachers, advances);
  const pay = new PaySettlement(
    timesheets,
    settlements,
    teachers,
    new SqlClosedPeriods(tx),
    transactions,
    locks,
  );
  return {
    advances,
    closed: new SqlClosedPeriods(tx),
    timesheets,
    settlements,
    teachers,
    schedule,
    duties,
    substitutions,
    holidays,
    today,
    query: new SqlPayrollQuery(tx, today),
    planning: new SqlPlanningQuery(tx),
    list,
    pay,
    payAll: new PayAllSettlements(pay, list, transactions),
    profitability: new Profitability(
      schedule,
      duties,
      holidays,
      teachers,
      list,
      new SqlPayrollQuery(tx, today),
      new SqlMonthlyFees(tx, (month) => billing(api, scope).generate.expected(month)),
      clock,
    ),
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
    AdvanceNotFound: [404, 'not_found'],
    TeacherNotFound: [404, 'not_found'],
    SubstitutionNotFound: [404, 'not_found'],
    DutyNotFound: [404, 'not_found'],
    SubstitutionNeedsReason: [409, 'reason_required'],
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
    const teacher = c.req.query('teacherId');
    return c.json({
      month: period.toString(),
      items: await new ListSessions(p.query).execute(period, teacher ? teacher : null),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/payroll/sessions'), async (c, scope) => {
    const p = payroll(api, scope);
    const b = await JsonBody.from(c.req.raw);
    const id = await new RecordSession(
      p.timesheets,
      p.settlements,
      p.schedule,
      p.teachers,
      p.duties,
    ).execute(
      {
        teacherId: b.requiredString('teacherId'),
        date: b.requiredString('date'),
        groupId: b.optionalString('groupId'),
        dutyId: b.optionalString('dutyId'),
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

  api.defineRoute(admin('POST', '/api/admin/payroll/days/:date/refill'), async (c, scope) => {
    const p = payroll(api, scope);
    const created = await new RefillDay(
      p.schedule,
      p.duties,
      p.substitutions,
      p.holidays,
      p.timesheets,
      p.settlements,
      p.settlements,
      api.deps.clock,
    ).execute(param(c, 'date'));
    return c.json({ created });
  });

  // ---- Festivos -----------------------------------------------------------------------------
  api.defineRoute(admin('GET', '/api/admin/payroll/holidays'), async (c, scope) => {
    const p = payroll(api, scope);
    const year = Number(c.req.query('season')) ||
      Season.containing(YearMonth.of(p.today())).startYear;
    const season = Season.startingIn(year);
    return c.json({
      season: year,
      items: await p.holidays.between(
        season.firstMonth().firstDay(),
        season.lastMonth().next().next().lastDay(),
      ),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/payroll/holidays'), async (c, scope) => {
    const p = payroll(api, scope);
    const b = await JsonBody.from(c.req.raw);
    const removed = await new AddHoliday(p.holidays, p.timesheets, p.settlements).execute(
      b.requiredString('date'),
      b.optionalString('name') ?? 'Festivo',
    );
    return c.json({ removed });
  });

  api.defineRoute(admin('DELETE', '/api/admin/payroll/holidays/:date'), async (c, scope) => {
    await new RemoveHoliday(payroll(api, scope).holidays).execute(param(c, 'date'));
    return c.body(null, 204);
  });

  // ---- Sustituciones -------------------------------------------------------------------------
  api.defineRoute(admin('GET', '/api/admin/payroll/substitutions'), async (c, scope) => {
    const p = payroll(api, scope);
    const period = month(c, p);
    return c.json({
      month: period.toString(),
      items: await p.planning.substitutions(period.firstDay(), period.lastDay()),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/payroll/substitutions'), async (c, scope) => {
    const p = payroll(api, scope);
    const b = await JsonBody.from(c.req.raw);
    const id = await new PlanSubstitution(
      p.schedule,
      p.duties,
      p.substitutions,
      p.timesheets,
      p.settlements,
      p.teachers,
    ).execute({
      groupId: b.optionalString('groupId'),
      dutyId: b.optionalString('dutyId'),
      date: b.requiredString('date'),
      teacherId: b.requiredString('teacherId'),
      reason: b.optionalString('reason'),
    });
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('POST', '/api/admin/payroll/teacher-substitutions'), async (c, scope) => {
    const p = payroll(api, scope);
    const b = await JsonBody.from(c.req.raw);
    const created = await new SubstituteTeacher(
      p.schedule,
      p.duties,
      p.substitutions,
      p.holidays,
      p.timesheets,
      p.settlements,
      p.teachers,
    ).execute({
      teacherId: b.requiredString('teacherId'),
      substituteId: b.requiredString('substituteId'),
      from: b.requiredString('from'),
      to: b.requiredString('to'),
      reason: b.optionalString('reason'),
    });
    return c.json({ created }, 201);
  });

  api.defineRoute(admin('DELETE', '/api/admin/payroll/substitutions/:id'), async (c, scope) => {
    const p = payroll(api, scope);
    await new CancelSubstitution(
      p.schedule,
      p.duties,
      p.substitutions,
      p.timesheets,
      p.settlements,
    ).execute(
      param(c, 'id'),
    );
    return c.body(null, 204);
  });

  // ---- Turnos fijos (encargado del club) -----------------------------------------------------
  const dutyInput = (b: JsonBody) => ({
    teacherId: b.requiredString('teacherId'),
    weekday: b.requiredInt('weekday'),
    start: b.requiredString('start'),
    end: b.requiredString('end'),
    label: b.optionalString('label'),
    kind: dutyKindFromName(b.optionalString('kind') ?? 'shift'),
  });

  api.defineRoute(admin('GET', '/api/admin/payroll/duties'), async (_c, scope) => {
    return _c.json({ items: await payroll(api, scope).planning.duties() });
  });

  api.defineRoute(admin('POST', '/api/admin/payroll/duties'), async (c, scope) => {
    const p = payroll(api, scope);
    const id = await new SaveDuty(p.duties, p.teachers).execute(
      null,
      dutyInput(await JsonBody.from(c.req.raw)),
    );
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('PUT', '/api/admin/payroll/duties/:id'), async (c, scope) => {
    const p = payroll(api, scope);
    await new SaveDuty(p.duties, p.teachers).execute(
      param(c, 'id'),
      dutyInput(await JsonBody.from(c.req.raw)),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('DELETE', '/api/admin/payroll/duties/:id'), async (c, scope) => {
    await new DeleteDuty(payroll(api, scope).duties).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/payroll/settlements'), async (c, scope) => {
    const p = payroll(api, scope);
    const period = month(c, p);
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
    admin('PUT', '/api/admin/payroll/settlements/:teacherId/:month/payment'),
    async (c, scope) => {
      const p = payroll(api, scope);
      const b = await JsonBody.from(c.req.raw);
      await new ChangeSettlementPaymentDate(p.settlements, p.closed).execute(
        param(c, 'teacherId'),
        param(c, 'month'),
        b.requiredString('date'),
      );
      return c.body(null, 204);
    },
  );

  // ---- Anticipos -------------------------------------------------------------------------------
  api.defineRoute(admin('POST', '/api/admin/payroll/advances'), async (c, scope) => {
    const p = payroll(api, scope);
    const b = await JsonBody.from(c.req.raw);
    const id = await new RecordAdvance(p.advances, p.settlements, p.teachers, p.closed).execute({
      teacherId: b.requiredString('teacherId'),
      month: b.requiredString('month'),
      amount: b.requiredString('amount'),
      date: b.requiredString('date'),
      note: b.optionalString('note'),
    });
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('DELETE', '/api/admin/payroll/advances/:id'), async (c, scope) => {
    const p = payroll(api, scope);
    await new DeleteAdvance(p.advances, p.settlements, p.closed).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  // ---- Ficha del profesor ----------------------------------------------------------------------
  api.defineRoute(admin('GET', '/api/admin/payroll/teachers/:id/report'), async (c, scope) => {
    const p = payroll(api, scope);
    const season = c.req.query('season');
    if (season !== undefined && !/^\d{4}$/.test(season)) {
      throw new InvalidValue('season', 'Indica la temporada con el año en que empieza.');
    }
    return c.json(
      await new TeacherReport(
        p.teachers,
        p.list,
        p.profitability,
        p.advances,
        new SqlTeacherReportQuery(scope.tx),
        api.deps.clock,
      ).execute(param(c, 'id'), season === undefined ? null : Number(season)),
    );
  });

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
    return c.json({
      month: period.toString(),
      ...(await p.profitability.report(period.toString())),
    });
  });
}
