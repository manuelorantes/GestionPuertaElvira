import {
  type Clock,
  InvalidValue,
  LocalDate,
  Money,
  Season,
  YearMonth,
} from '../../domain/common/mod.ts';
import {
  BillingSettings,
  Charge,
  ChargeId,
  type ChargeKind,
  ClubFiscalData,
  DocumentNumber,
  FeeCalculator,
  FeeProfile,
  InvalidPaymentRequest,
  InvoiceAlreadyIssued,
  InvoiceCustomer,
  monthsWithin,
  Payment,
  PaymentId,
  paymentMethodFromName,
  type PreferredPlan,
  preferredPlanFromName,
  PrivateLesson,
  Proration,
  Quote,
  QuoteLine,
  SpecialDiscount,
  StudentAccount,
  StudentRef,
  Tariff,
  TeacherRef,
} from '../../domain/billing/mod.ts';
import {
  type ClosedPeriods,
  type Locks,
  PeriodClosed,
  type TransactionRunner,
} from '../common/mod.ts';

// ---- Puertos ---------------------------------------------------------------------------------

/** Inscripción del alumno en una clase particular. */
export interface PrivateEnrolment {
  groupName: string;
  teacherId: string;
  weeklyHours: number;
}

/** Lo que Billing necesita saber de un alumno, servido por Alumnado y Clases. */
export interface BillingStudent {
  id: string;
  name: string;
  guardianName: string;
  guardianPhone: string;
  hasSiblings: boolean;
  regularWeeklyHours: number;
  privateLessons: PrivateEnrolment[];
}

export interface StudentDirectory {
  /** Alumnos con alta en algún día del mes. */
  activeIn(month: YearMonth): Promise<BillingStudent[]>;
  /** Perfil del alumno con sus grupos en ese día. */
  find(student: StudentRef, day: LocalDate): Promise<BillingStudent | null>;
}

export interface BillingSettingsRepository {
  /** Ajustes guardados, o los de por defecto si nunca se han cambiado. */
  get(): Promise<BillingSettings>;
  saveSettings(settings: BillingSettings): Promise<void>;
}

export interface StudentAccountRepository {
  account(student: StudentRef): Promise<StudentAccount | null>;
  saveAccount(account: StudentAccount): Promise<void>;
}

export interface ChargeRepository {
  charge(id: ChargeId): Promise<Charge | null>;
  chargeFor(student: StudentRef, kind: ChargeKind, period: YearMonth): Promise<Charge | null>;
  /** Cuotas sin pagar, de la más antigua a la más reciente. */
  unpaidFor(student: StudentRef, kind: ChargeKind): Promise<Charge[]>;
  saveCharge(charge: Charge): Promise<void>;
}

export interface PaymentRepository {
  payment(id: PaymentId): Promise<Payment | null>;
  savePayment(payment: Payment): Promise<void>;
}

/** Contador correlativo sin huecos por tipo de documento y temporada; se llama dentro de una transacción. */
export interface DocumentSequence {
  next(prefix: string, seasonYear: number): Promise<number>;
}

/** Fila de «Cuotas del mes». */
export interface ChargeView {
  id: string;
  studentId: string;
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  kind: string;
  period: string;
  amountCents: number;
  status: string;
  paymentId: string | null;
  receiptNumber: string | null;
  remindedOn: string | null;
}

export interface PaymentSummary {
  id: string;
  receiptNumber: string;
  paidOn: string;
  studentId: string;
  studentName: string;
  kind: string;
  concept: string;
  method: string;
  totalCents: number;
  invoiceNumber: string | null;
}

/** Todo lo que necesita el recibo (y la factura, si existe). */
export interface PaymentDetail {
  summary: PaymentSummary;
  guardianName: string;
  lines: { label: string; amountCents: number }[];
  periods: string[];
  invoice: Record<string, unknown> | null;
}

export interface BillingQuery {
  /** Cuotas mensuales del mes y cuotas de socio de su temporada, con su estado a fecha de hoy. */
  charges(month: YearMonth, today: LocalDate): Promise<ChargeView[]>;
  /** Cobros, del más reciente al más antiguo; de un alumno si se indica. */
  payments(studentId: string | null): Promise<PaymentSummary[]>;
  payment(id: string): Promise<PaymentDetail | null>;
  /** Cuotas mensuales vencidas a fecha de hoy, de la más antigua a la más reciente. */
  overdue(today: LocalDate): Promise<ChargeView[]>;
}

// ---- Errores ---------------------------------------------------------------------------------

export class BillingStudentNotFound extends Error {
  constructor() {
    super('No existe ese alumno o no está de alta.');
    this.name = 'BillingStudentNotFound';
  }
}

export class ChargeNotFound extends Error {
  constructor() {
    super('No existe esa cuota.');
    this.name = 'ChargeNotFound';
  }
}

export class PaymentNotFound extends Error {
  constructor() {
    super('No existe ese cobro.');
    this.name = 'PaymentNotFound';
  }
}

// ---- Casos de uso ----------------------------------------------------------------------------

/** Traduce el perfil del alumno al del cálculo, con el precio pactado o el del profesor. */
export function feeProfileOf(
  student: BillingStudent,
  account: StudentAccount | null,
  settings: BillingSettings,
): FeeProfile {
  const lessons = student.privateLessons.map((e) =>
    new PrivateLesson(
      e.groupName,
      e.weeklyHours,
      account?.privateRate() ?? settings.privateRateFor(e.teacherId),
    )
  );
  return new FeeProfile(student.regularWeeklyHours, lessons, student.hasSiblings);
}

export const decimal = (money: Money): string => (money.cents / 100).toFixed(2);

/**
 * Crea las cuotas del mes que falten (idempotente): la mensual de cada alumno activo y la de socio de la temporada.
 * Nunca para meses futuros.
 */
export class GenerateMonthlyCharges {
  constructor(
    private readonly directory: StudentDirectory,
    private readonly settings: BillingSettingsRepository,
    private readonly accounts: StudentAccountRepository,
    private readonly charges: ChargeRepository,
    private readonly clock: Clock,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  async execute(month: string): Promise<void> {
    const period = YearMonth.fromString(month);
    const season = Season.teachingSeason(period);
    // Los meses futuros no se generan: solo existen si se pagan por adelantado.
    if (season === null || YearMonth.of(LocalDate.fromInstant(this.clock.now())).isBefore(period)) {
      return;
    }
    await this.transactions.run(async () => {
      // Dos pantallas que abren el mismo mes a la vez no deben crear la misma cuota dos veces.
      await this.locks.acquire(`billing:charges:${period.toString()}`);
      await this.generate(period, season);
    });
  }

  private async generate(period: YearMonth, season: Season): Promise<void> {
    const settings = await this.settings.get();
    const calculator = new FeeCalculator();
    for (const student of await this.directory.activeIn(period)) {
      const ref = StudentRef.fromString(student.id);
      const account = await this.accounts.account(ref);
      if ((await this.charges.chargeFor(ref, 'monthly', period)) === null) {
        const amount =
          calculator.quote(feeProfileOf(student, account, settings), settings, 1).total;
        if (amount.cents > 0) {
          await this.charges.saveCharge(
            Charge.create(ChargeId.generate(), ref, 'monthly', period, amount),
          );
        }
      }
      if (
        account?.isMember() &&
        (await this.charges.chargeFor(ref, 'membership', season.firstMonth())) === null
      ) {
        await this.charges.saveCharge(
          Charge.create(
            ChargeId.generate(),
            ref,
            'membership',
            season.firstMonth(),
            settings.tariff.membershipFee,
          ),
        );
      }
    }
  }
}

/** Cuotas del mes con sus totales. */
export interface MonthlyCharges {
  month: string;
  items: ChargeView[];
  expectedCents: number;
  collectedCents: number;
  overdueCount: number;
}

/** Genera las cuotas que falten del mes y las devuelve con su estado y totales. */
export class ListMonthlyCharges {
  constructor(
    private readonly generate: GenerateMonthlyCharges,
    private readonly query: BillingQuery,
    private readonly clock: Clock,
  ) {}

  async execute(month: string | null): Promise<MonthlyCharges> {
    const today = LocalDate.fromInstant(this.clock.now());
    const period = month === null || month === ''
      ? YearMonth.of(today)
      : YearMonth.fromString(month);
    await this.generate.execute(period.toString());
    const items = await this.query.charges(period, today);
    const sum = (charges: ChargeView[]) => charges.reduce((total, c) => total + c.amountCents, 0);
    return {
      month: period.toString(),
      items,
      expectedCents: sum(items),
      collectedCents: sum(items.filter((c) => c.status === 'paid')),
      overdueCount: items.filter((c) => c.status === 'overdue').length,
    };
  }
}

export class MarkReminded {
  constructor(
    private readonly charges: ChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(chargeId: string): Promise<void> {
    const charge = await this.charges.charge(ChargeId.fromString(chargeId));
    if (charge === null) throw new ChargeNotFound();
    charge.markReminded(LocalDate.fromInstant(this.clock.now()));
    await this.charges.saveCharge(charge);
  }
}

export interface PaymentRequest {
  studentId: string;
  kind: string;
  months: number;
  method: string;
  date: string;
  prorate: boolean;
  specialPercent: number | null;
  specialConcept: string | null;
}

/** Cotización de un cobro: desglose, meses que cubre y concepto del recibo. */
export interface PaymentQuote {
  student: BillingStudent;
  kind: ChargeKind;
  date: LocalDate;
  quote: Quote;
  periods: YearMonth[];
  concept: string;
  monthlyCharge: Money;
}

function concept(periods: readonly YearMonth[]): string {
  const first = periods[0] as YearMonth;
  const last = periods[periods.length - 1] as YearMonth;
  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (first.equals(last)) return capitalise(first.label());
  const from = first.year === last.year ? first.shortLabel() : capitalise(first.label());
  return `${from} – ${last.label()}`;
}

/**
 * Calcula un cobro sin guardarlo: qué meses cubre (primero las cuotas pendientes más antiguas) y cuánto cuesta.
 */
export class QuotePayment {
  constructor(
    private readonly directory: StudentDirectory,
    private readonly settings: BillingSettingsRepository,
    private readonly accounts: StudentAccountRepository,
    private readonly charges: ChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: PaymentRequest): Promise<PaymentQuote> {
    paymentMethodFromName(request.method);
    const date = LocalDate.fromString(request.date);
    const ref = StudentRef.fromString(request.studentId);
    const student = await this.directory.find(ref, date);
    if (student === null) throw new BillingStudentNotFound();
    if (request.kind !== 'monthly' && request.kind !== 'membership') {
      throw new InvalidValue('kind', 'Tipo de cobro desconocido: usa monthly o membership.');
    }
    const settings = await this.settings.get();
    if (request.kind === 'membership') return await this.membership(student, ref, date, settings);
    const periods = await this.periods(ref, date, request.months);
    const special = request.specialPercent === null
      ? null
      : new SpecialDiscount(request.specialPercent, request.specialConcept ?? '');
    const profile = feeProfileOf(student, await this.accounts.account(ref), settings);
    const calculator = new FeeCalculator();
    const monthly = calculator.quote(profile, settings, 1).total;
    // Las cuotas ya generadas se cobran por su importe guardado; los meses nuevos, con el de hoy.
    const pending = new Map<string, Money>();
    for (const charge of await this.charges.unpaidFor(ref, 'monthly')) {
      pending.set(charge.period.toString(), charge.amount);
    }
    const items = periods.map((p) =>
      new QuoteLine(`Cuota de ${p.label()}`, pending.get(p.toString()) ?? monthly)
    );
    const sameAsToday = items.every((l) => l.amount.equals(monthly));
    if (
      request.prorate &&
      (periods.length !== 1 || !periods[0]?.equals(YearMonth.of(date)) || !sameAsToday)
    ) {
      throw request.months > 1
        ? InvalidPaymentRequest.prorationRequiresOneMonth()
        : InvalidPaymentRequest.prorationOnlyCurrentMonth();
    }
    const first = periods[0] as YearMonth;
    const proration = request.prorate ? new Proration(date.day, first.days()) : null;
    const quote = sameAsToday
      ? calculator.quote(profile, settings, request.months, special, proration)
      : calculator.quoteItems(items, settings, special);
    // Sin grupos, los meses nuevos valen 0 €: solo se puede cobrar lo pendiente.
    if (quote.gross.cents === 0 || items.some((l) => l.amount.cents === 0)) {
      throw InvalidPaymentRequest.nothingToPay();
    }
    return {
      student,
      kind: 'monthly',
      date,
      quote,
      periods,
      concept: concept(periods),
      monthlyCharge: monthly,
    };
  }

  /** Meses que propone el formulario según la forma de pago preferida y lo que queda de temporada. */
  async suggestion(studentId: string): Promise<number> {
    const ref = StudentRef.fromString(studentId);
    const plan: PreferredPlan = (await this.accounts.account(ref))?.preferredPlan() ?? 'monthly';
    return monthsWithin(plan, await this.available(ref, LocalDate.fromInstant(this.clock.now())));
  }

  /** Meses que aún se pueden cobrar: cuotas pendientes más los que quedan de temporada. */
  remainingMonths(studentId: string): Promise<number> {
    return this.available(
      StudentRef.fromString(studentId),
      LocalDate.fromInstant(this.clock.now()),
    );
  }

  private async periods(ref: StudentRef, date: LocalDate, months: number): Promise<YearMonth[]> {
    if (!Number.isInteger(months) || months < 1 || months > FeeCalculator.MAX_MONTHS) {
      throw InvalidPaymentRequest.months();
    }
    const candidates = await this.candidates(ref, date);
    if (months > candidates.length) throw InvalidPaymentRequest.beyondSeason(candidates.length);
    return candidates.slice(0, months).sort((a, b) => a.toString().localeCompare(b.toString()));
  }

  private async available(ref: StudentRef, date: LocalDate): Promise<number> {
    return (await this.candidates(ref, date)).length;
  }

  /**
   * Meses que se pueden cobrar, en orden: primero las cuotas pendientes (de la más antigua a la más reciente) y después
   * los meses de la temporada, desde el del cobro, que aún no tienen cuota (rellenando huecos).
   */
  private async candidates(ref: StudentRef, date: LocalDate): Promise<YearMonth[]> {
    const periods = (await this.charges.unpaidFor(ref, 'monthly')).map((c) => c.period);
    let start = YearMonth.of(date);
    if (Season.teachingSeason(start) === null) start = Season.containing(start).firstMonth();
    const season = Season.containing(start);
    for (let month = start; season.includes(month); month = month.next()) {
      if ((await this.charges.chargeFor(ref, 'monthly', month)) === null) periods.push(month);
    }
    return periods;
  }

  private async membership(
    student: BillingStudent,
    ref: StudentRef,
    date: LocalDate,
    settings: BillingSettings,
  ): Promise<PaymentQuote> {
    const season = Season.containing(YearMonth.of(date));
    const charge = await this.charges.chargeFor(ref, 'membership', season.firstMonth());
    const isMember = (await this.accounts.account(ref))?.isMember() === true;
    if (charge?.isPaid() || (charge === null && !isMember)) {
      throw InvalidPaymentRequest.nothingToPay();
    }
    const fee = charge?.amount ?? settings.tariff.membershipFee;
    const label = `Cuota de socio ${season.label()}`;
    const quote = new Quote([new QuoteLine(label, fee)], fee, 0, fee, fee);
    return {
      student,
      kind: 'membership',
      date,
      quote,
      periods: [season.firstMonth()],
      concept: label,
      monthlyCharge: fee,
    };
  }
}

/** Registra el cobro con su recibo y deja pagadas las cuotas que cubre. */
export class RegisterPayment {
  constructor(
    private readonly quotes: QuotePayment,
    private readonly charges: ChargeRepository,
    private readonly payments: PaymentRepository,
    private readonly sequence: DocumentSequence,
    private readonly transactions: TransactionRunner,
    private readonly closed: ClosedPeriods,
    private readonly locks: Locks,
  ) {}

  execute(request: PaymentRequest): Promise<string> {
    return this.transactions.run(async () => {
      // Un doble clic no puede cobrar dos veces lo mismo: el segundo espera y recalcula sobre lo ya pagado.
      await this.locks.acquire(`billing:student:${StudentRef.fromString(request.studentId).value}`);
      const quote = await this.quotes.execute(request);
      await PeriodClosed.guard(this.closed, quote.date);
      const ref = StudentRef.fromString(quote.student.id);
      const season = Season.containing(YearMonth.of(quote.date));
      const payment = Payment.register({
        id: PaymentId.generate(),
        student: ref,
        paidOn: quote.date,
        method: paymentMethodFromName(request.method),
        receipt: DocumentNumber.receipt(
          season.startYear,
          await this.sequence.next('R', season.startYear),
        ),
        kind: quote.kind,
        concept: quote.concept,
        lines: quote.quote.lines,
        total: quote.quote.total,
        periods: quote.periods,
      });
      await this.payments.savePayment(payment);
      for (const period of quote.periods) {
        const charge = (await this.charges.chargeFor(ref, quote.kind, period)) ??
          Charge.create(ChargeId.generate(), ref, quote.kind, period, quote.monthlyCharge);
        charge.payWith(payment.id);
        await this.charges.saveCharge(charge);
      }
      return payment.id.value;
    });
  }
}

/**
 * Cobro traído de la hoja de cálculo: un mes (o la cuota de socio) por el importe exacto que apuntó el club,
 * con su recibo. Si ese mes ya estaba cobrado en la aplicación, no se duplica. Se usa dentro de una transacción.
 */
export class ImportPayment {
  constructor(
    private readonly charges: ChargeRepository,
    private readonly payments: PaymentRepository,
    private readonly sequence: DocumentSequence,
    private readonly closed: ClosedPeriods,
  ) {}

  /** @returns id del cobro, o null si ese mes ya estaba cobrado */
  async execute(
    studentId: string,
    kind: ChargeKind,
    period: YearMonth,
    amount: Money,
    paidOn: LocalDate,
  ): Promise<string | null> {
    const student = StudentRef.fromString(studentId);
    let charge = await this.charges.chargeFor(student, kind, period);
    if (charge?.isPaid()) return null;
    await PeriodClosed.guard(this.closed, paidOn);
    const season = Season.containing(period);
    const label = kind === 'membership' ? `Cuota de socio ${season.label()}` : concept([period]);
    const payment = Payment.register({
      id: PaymentId.generate(),
      student,
      paidOn,
      method: 'transfer',
      receipt: DocumentNumber.receipt(
        season.startYear,
        await this.sequence.next('R', season.startYear),
      ),
      kind,
      concept: label,
      lines: [new QuoteLine(`${label} (importado de la hoja)`, amount)],
      total: amount,
      periods: [period],
    });
    await this.payments.savePayment(payment);
    charge ??= Charge.create(ChargeId.generate(), student, kind, period, amount);
    charge.payWith(payment.id);
    await this.charges.saveCharge(charge);
    return payment.id.value;
  }
}

/** Emite, bajo petición, la factura de un cobro (una sola vez). */
export class IssueInvoice {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly sequence: DocumentSequence,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    private readonly locks: Locks,
  ) {}

  execute(paymentId: string, name: string, taxId: string, address: string): Promise<void> {
    const id = PaymentId.fromString(paymentId);
    const customer = new InvoiceCustomer(name.trim(), taxId.trim().toUpperCase(), address.trim());
    const today = LocalDate.fromInstant(this.clock.now());
    return this.transactions.run(async () => {
      // Dos peticiones a la vez no pueden gastar dos números de factura para el mismo cobro.
      await this.locks.acquire(`billing:invoice:${id.value}`);
      const payment = await this.payments.payment(id);
      if (payment === null) throw new PaymentNotFound();
      if (payment.invoice() !== null) throw new InvoiceAlreadyIssued();
      const season = Season.containing(YearMonth.of(today));
      const number = DocumentNumber.invoice(
        season.startYear,
        await this.sequence.next('F', season.startYear),
      );
      payment.issueInvoice(number, customer, BillingSettings.VAT_PERCENT, today);
      await this.payments.savePayment(payment);
    });
  }
}

export interface AccountView {
  preferredPlan: string;
  member: boolean;
  privateRate: string | null;
  points: number;
  suggestedMonths: number;
  remainingMonths: number;
}

export class GetStudentAccount {
  constructor(
    private readonly directory: StudentDirectory,
    private readonly accounts: StudentAccountRepository,
    private readonly quotes: QuotePayment,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string): Promise<AccountView> {
    const ref = StudentRef.fromString(studentId);
    if ((await this.directory.find(ref, LocalDate.fromInstant(this.clock.now()))) === null) {
      throw new BillingStudentNotFound();
    }
    const account = await this.accounts.account(ref);
    const rate = account?.privateRate() ?? null;
    return {
      preferredPlan: account?.preferredPlan() ?? 'monthly',
      member: account?.isMember() === true,
      privateRate: rate === null ? null : decimal(rate),
      points: account?.points() ?? 0,
      suggestedMonths: await this.quotes.suggestion(studentId),
      remainingMonths: await this.quotes.remainingMonths(studentId),
    };
  }
}

export class UpdateStudentAccount {
  constructor(private readonly accounts: StudentAccountRepository) {}

  async execute(
    studentId: string,
    plan: string,
    member: boolean,
    privateRate: string | null,
  ): Promise<void> {
    const ref = StudentRef.fromString(studentId);
    const account = (await this.accounts.account(ref)) ?? StudentAccount.open(ref);
    const rate = privateRate === null || privateRate.trim() === ''
      ? null
      : Money.fromDecimal(privateRate);
    account.update(preferredPlanFromName(plan), member, rate);
    await this.accounts.saveAccount(account);
  }
}

export class AdjustPoints {
  constructor(private readonly accounts: StudentAccountRepository) {}

  async execute(studentId: string, delta: number): Promise<number> {
    const ref = StudentRef.fromString(studentId);
    const account = (await this.accounts.account(ref)) ?? StudentAccount.open(ref);
    account.adjustPoints(delta);
    await this.accounts.saveAccount(account);
    return account.points();
  }
}

/** Ajustes tal como llegan del formulario: importes en texto decimal y descuentos en %. */
export interface SettingsInput {
  threeHours: string;
  twoHours: string;
  hourAndHalf: string;
  oneHour: string;
  membershipFee: string;
  familyPercent: number;
  threeMonthsPercent: number;
  sixMonthsPercent: number;
  seasonPercent: number;
  defaultPrivateRate: string;
  /** Precio por hora por id de profesor. */
  privateRates: Record<string, string>;
  clubName: string;
  clubTaxId: string;
  clubAddress: string;
}

export class UpdateBillingSettings {
  constructor(private readonly settings: BillingSettingsRepository) {}

  async execute(input: SettingsInput): Promise<void> {
    const tariff = new Tariff(
      Money.fromDecimal(input.threeHours),
      Money.fromDecimal(input.twoHours),
      Money.fromDecimal(input.hourAndHalf),
      Money.fromDecimal(input.oneHour),
      Money.fromDecimal(input.membershipFee),
      input.familyPercent,
      input.threeMonthsPercent,
      input.sixMonthsPercent,
      input.seasonPercent,
    );
    const rates = new Map<string, Money>();
    for (const [teacherId, rate] of Object.entries(input.privateRates)) {
      if (rate.trim() !== '') {
        rates.set(TeacherRef.fromString(teacherId).value, Money.fromDecimal(rate));
      }
    }
    await this.settings.saveSettings(
      new BillingSettings(
        tariff,
        Money.fromDecimal(input.defaultPrivateRate),
        rates,
        new ClubFiscalData(
          input.clubName.trim(),
          input.clubTaxId.trim().toUpperCase(),
          input.clubAddress.trim(),
        ),
      ),
    );
  }
}
