import { InvalidValue, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import { paymentMethodFromName, paymentMethodLabel, StudentRef } from '../../domain/billing/mod.ts';
import {
  AdjustCharge,
  BillingStudentNotFound,
  CancelCharge,
  ChangePaymentMethod,
  CorrectPaymentAmount,
  decimal,
  GenerateMonthlyCharges,
  GetStudentAccount,
  IssueInvoice,
  ListCancelledCharges,
  ListMonthlyCharges,
  MarkReminded,
  PaymentNotFound,
  type PaymentRequest,
  QuotePayment,
  ReactivateCharge,
  RegisterPayment,
  ReschedulePayment,
  ResetCharge,
  SetChargeDiscount,
  UpdateBillingSettings,
  UpdateStudentAccount,
} from '../../application/billing/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { recalculatingFees } from './recalculate.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlBillingQuery,
  SqlBillingSettingsRepository,
  SqlChargeRepository,
  SqlClosedPeriods,
  SqlDocumentSequence,
  SqlPaymentRepository,
  SqlStudentAccountRepository,
  SqlStudentDirectory,
} from '../persistence/billing.ts';
import { PostgresAdvisoryLocks, SavepointTransactionRunner } from '../persistence/sql.ts';
import { PointsWalletService } from '../../application/points/mod.ts';
import { SqlPointMovementRepository } from '../persistence/points.ts';

/** Casos de uso de cobros montados sobre la transacción de la petición. */
export function billing(api: ApiApp, scope: RequestScope) {
  const { clock } = api.deps;
  const tx = scope.tx;
  const directory = new SqlStudentDirectory(tx);
  const settings = new SqlBillingSettingsRepository(tx);
  const accounts = new SqlStudentAccountRepository(tx);
  const charges = new SqlChargeRepository(tx);
  const payments = new SqlPaymentRepository(tx);
  const sequence = new SqlDocumentSequence(tx);
  const transactions = new SavepointTransactionRunner(tx);
  const locks = new PostgresAdvisoryLocks(tx);
  const closed = new SqlClosedPeriods(tx);
  const query = new SqlBillingQuery(tx);
  const generate = new GenerateMonthlyCharges(
    directory,
    settings,
    accounts,
    charges,
    clock,
    transactions,
    locks,
  );
  const quotes = new QuotePayment(
    directory,
    settings,
    accounts,
    charges,
    clock,
    new PointsWalletService(new SqlPointMovementRepository(tx)),
  );
  return {
    directory,
    settings,
    accounts,
    charges,
    payments,
    sequence,
    query,
    generate,
    quotes,
    list: new ListMonthlyCharges(generate, query, clock),
    register: new RegisterPayment(
      quotes,
      charges,
      payments,
      sequence,
      transactions,
      closed,
      locks,
      accounts,
    ),
    issueInvoice: new IssueInvoice(payments, sequence, transactions, clock, locks),
    getAccount: new GetStudentAccount(directory, accounts, quotes, clock, settings, charges),
    today: () => LocalDate.fromInstant(clock.now()),
  };
}

function paymentRequest(body: JsonBody): PaymentRequest {
  const special = body.optionalObject('specialDiscount');
  return {
    studentId: body.requiredString('studentId'),
    kind: body.optionalString('kind') ?? 'monthly',
    months: body.optionalInt('months') ?? 1,
    method: body.requiredString('method'),
    date: body.requiredString('date'),
    specialPercent: special?.optionalInt('percent') ?? null,
    specialAmountCents: special?.optionalInt('amountCents') ?? null,
    specialConcept: special?.requiredString('concept') ?? null,
    redeemPoints: body.optionalInt('redeemPoints') ?? 0,
    chargeId: body.optionalString('chargeId'),
  };
}

/** Rutas de cobros (/api/admin/billing) y precios públicos (/api/public/prices). */
export function registerBillingRoutes(api: ApiApp): void {
  registerDomainErrors({
    PaymentNotFound: [404, 'not_found'],
    ChargeNotFound: [404, 'not_found'],
    BillingStudentNotFound: [404, 'not_found'],
    InvoiceAlreadyIssued: [409, 'invoice_already_issued'],
  });
  const admin = (method: 'GET' | 'POST' | 'PUT', path: string) => ({
    method,
    path,
    access: 'admin' as const,
  });
  /** Lo que el profesorado también puede consultar: la cuenta y los pagos de un alumno. */
  const clubReader = (path: string) => ({
    method: 'GET' as const,
    path,
    access: 'clubReader' as const,
  });

  api.defineRoute(admin('GET', '/api/admin/billing/charges'), async (c, scope) => {
    const kind = c.req.query('kind') ?? 'all';
    if (!['all', 'monthly', 'membership'].includes(kind)) {
      throw new InvalidValue('kind', 'Tipo de cuota desconocido.');
    }
    const result = await billing(api, scope).list.execute(
      c.req.query('month') ?? null,
      kind as 'all' | 'monthly' | 'membership',
    );
    const label = YearMonth.fromString(result.month).label();
    return c.json({
      month: result.month,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      items: result.items,
      totals: {
        expectedCents: result.expectedCents,
        collectedCents: result.collectedCents,
        pendingCents: result.expectedCents - result.collectedCents,
        overdueCount: result.overdueCount,
      },
    });
  });

  api.defineRoute(admin('POST', '/api/admin/billing/charges/:id/reminded'), async (c, scope) => {
    await new MarkReminded(billing(api, scope).charges, api.deps.clock).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/api/admin/billing/charges/:id/cancel'), async (c, scope) => {
    await new CancelCharge(billing(api, scope).charges, api.deps.clock).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/api/admin/billing/charges/:id/reactivate'), async (c, scope) => {
    await new ReactivateCharge(billing(api, scope).charges).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/billing/charges/cancelled'), async (c, scope) => {
    const season = c.req.query('season');
    if (season !== undefined && !/^\d{4}$/.test(season)) {
      throw new InvalidValue('season', 'Indica la temporada con el año en que empieza.');
    }
    return c.json({
      items: await new ListCancelledCharges(new SqlBillingQuery(scope.tx), api.deps.clock).execute(
        season === undefined ? null : Number(season),
      ),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/billing/quote'), async (c, scope) => {
    const quote = await billing(api, scope).quotes.execute(
      paymentRequest(await JsonBody.from(c.req.raw)),
    );
    return c.json({
      concept: quote.concept,
      periods: quote.periods.map((p) => p.toString()),
      lines: quote.quote.lines.map((l) => ({ label: l.label, amountCents: l.amount.cents })),
      grossCents: quote.quote.gross.cents,
      discountPercent: quote.quote.discountPercent,
      totalCents: quote.quote.total.cents,
    });
  });

  api.defineRoute(admin('POST', '/api/admin/billing/payments'), async (c, scope) => {
    const id = await billing(api, scope).register.execute(
      paymentRequest(await JsonBody.from(c.req.raw)),
    );
    return c.json({ id }, 201);
  });

  api.defineRoute(clubReader('/api/admin/billing/payments'), async (c, scope) => {
    const student = c.req.query('studentId');
    const studentId = student ? StudentRef.fromString(student).value : null;
    return c.json({ items: await billing(api, scope).query.payments(studentId) });
  });

  api.defineRoute(clubReader('/api/admin/billing/payments/:id'), async (c, scope) => {
    const b = billing(api, scope);
    const detail = await b.query.payment(param(c, 'id'));
    if (detail === null) throw new PaymentNotFound();
    const club = (await b.settings.get()).club;
    return c.json({
      ...detail.summary,
      methodLabel: paymentMethodLabel(paymentMethodFromName(detail.summary.method)),
      guardianName: detail.guardianName,
      lines: detail.lines,
      periods: detail.periods,
      invoice: detail.invoice,
      club: { name: club.name, taxId: club.taxId, address: club.address },
    });
  });

  api.defineRoute(admin('PUT', '/api/admin/billing/payments/:id/date'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await new ReschedulePayment(new SqlPaymentRepository(scope.tx), api.deps.clock).execute(
      param(c, 'id'),
      body.requiredString('date'),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('PUT', '/api/admin/billing/payments/:id/amount'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await new CorrectPaymentAmount(new SqlPaymentRepository(scope.tx)).execute(
      param(c, 'id'),
      body.requiredInt('amountCents'),
      body.requiredString('reason'),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('PUT', '/api/admin/billing/payments/:id/method'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await new ChangePaymentMethod(new SqlPaymentRepository(scope.tx)).execute(
      param(c, 'id'),
      body.requiredString('method'),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/api/admin/billing/payments/:id/invoice'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await billing(api, scope).issueInvoice.execute(
      param(c, 'id'),
      body.requiredString('name'),
      body.requiredString('taxId'),
      body.requiredString('address'),
    );
    return c.body(null, 204);
  });

  api.defineRoute(clubReader('/api/admin/billing/accounts/:id'), async (c, scope) => {
    return c.json(await billing(api, scope).getAccount.execute(param(c, 'id')));
  });

  api.defineRoute(admin('PUT', '/api/admin/billing/accounts/:id'), async (c, scope) => {
    const b = billing(api, scope);
    const id = param(c, 'id');
    if ((await b.directory.find(StudentRef.fromString(id), b.today())) === null) {
      throw new BillingStudentNotFound();
    }
    const body = await JsonBody.from(c.req.raw);
    await recalculatingFees(api, scope, [id], () =>
      new UpdateStudentAccount(b.accounts).execute(
        id,
        body.requiredString('preferredPlan'),
        body.bool('member'),
        body.optionalString('privateRate'),
      ));
    return c.body(null, 204);
  });

  api.defineRoute(
    admin('PUT', '/api/admin/billing/accounts/:id/charges/:month'),
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await new AdjustCharge(billing(api, scope).charges).execute(
        param(c, 'id'),
        param(c, 'month'),
        body.requiredInt('amountCents'),
        body.requiredString('reason'),
        body.requiredString('scope') as 'one' | 'rest',
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    admin('PUT', '/api/admin/billing/accounts/:id/charges/:month/discount'),
    async (c, scope) => {
      const b = billing(api, scope);
      const body = await JsonBody.from(c.req.raw);
      await new SetChargeDiscount(b.directory, b.accounts, b.settings, b.charges, api.deps.clock)
        .execute(param(c, 'id'), param(c, 'month'), body.requiredInt('percent'));
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    admin('POST', '/api/admin/billing/accounts/:id/charges/:month/reset'),
    async (c, scope) => {
      const b = billing(api, scope);
      await new ResetCharge(b.directory, b.accounts, b.settings, b.charges, api.deps.clock).execute(
        param(c, 'id'),
        param(c, 'month'),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(admin('GET', '/api/admin/billing/settings'), async (c, scope) => {
    const s = await billing(api, scope).settings.get();
    const t = s.tariff;
    return c.json({
      threeHours: decimal(t.threeHours),
      twoHours: decimal(t.twoHours),
      hourAndHalf: decimal(t.hourAndHalf),
      oneHour: decimal(t.oneHour),
      membershipFee: decimal(t.membershipFee),
      familyPercent: t.familyPercent,
      threeMonthsPercent: t.threeMonthsPercent,
      sixMonthsPercent: t.sixMonthsPercent,
      seasonPercent: t.seasonPercent,
      defaultPrivateRate: decimal(s.defaultPrivateRate),
      privateRates: Object.fromEntries([...s.privateRates].map(([k, m]) => [k, decimal(m)])),
      clubName: s.club.name,
      clubTaxId: s.club.taxId,
      clubAddress: s.club.address,
      vatPercent: s.vatPercent,
    });
  });

  api.defineRoute(admin('PUT', '/api/admin/billing/settings'), async (c, scope) => {
    const b = await JsonBody.from(c.req.raw);
    await new UpdateBillingSettings(billing(api, scope).settings).execute({
      threeHours: b.requiredString('threeHours'),
      twoHours: b.requiredString('twoHours'),
      hourAndHalf: b.requiredString('hourAndHalf'),
      oneHour: b.requiredString('oneHour'),
      membershipFee: b.requiredString('membershipFee'),
      familyPercent: b.requiredInt('familyPercent'),
      threeMonthsPercent: b.requiredInt('threeMonthsPercent'),
      sixMonthsPercent: b.requiredInt('sixMonthsPercent'),
      seasonPercent: b.requiredInt('seasonPercent'),
      defaultPrivateRate: b.requiredString('defaultPrivateRate'),
      privateRates: b.stringMap('privateRates'),
      clubName: b.requiredString('clubName'),
      clubTaxId: b.requiredString('clubTaxId'),
      clubAddress: b.requiredString('clubAddress'),
    });
    return c.body(null, 204);
  });

  /** Precios de la temporada para la web pública: los mismos ajustes con los que se cobra. */
  api.defineRoute(
    { method: 'GET', path: '/api/public/prices', access: 'public' },
    async (c, scope) => {
      const b = billing(api, scope);
      const s = await b.settings.get();
      const t = s.tariff;
      return c.json({
        season: Season.containing(YearMonth.of(b.today())).label(),
        tiers: [
          { weeklyHours: 3, monthlyCents: t.threeHours.cents },
          { weeklyHours: 2, monthlyCents: t.twoHours.cents },
          { weeklyHours: 1.5, monthlyCents: t.hourAndHalf.cents },
          { weeklyHours: 1, monthlyCents: t.oneHour.cents },
        ],
        membershipCents: t.membershipFee.cents,
        familyPercent: t.familyPercent,
        prepaymentPercent: {
          threeMonths: t.threeMonthsPercent,
          sixMonths: t.sixMonthsPercent,
          season: t.seasonPercent,
        },
        privateHourCents: s.defaultPrivateRate.cents,
      });
    },
  );
}
