import {
  type Clock,
  InvalidValue,
  LocalDate,
  Money,
  Season,
  YearMonth,
} from '../../domain/common/mod.ts';
import {
  allocateCredit,
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
  PointsRedemption,
  type PreferredPlan,
  preferredPlanFromName,
  PrivateLesson,
  Quote,
  QuoteLine,
  SpecialDiscount,
  StudentAccount,
  StudentRef,
  Tariff,
  TeacherRef,
  WHOLE_YEAR_MIN_MONTHS,
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
  /** Las cuentas de varios alumnos de una vez, por id (los que no tienen cuenta no aparecen). */
  accountsOf(students: StudentRef[]): Promise<Map<string, StudentAccount>>;
  saveAccount(account: StudentAccount): Promise<void>;
}

export interface ChargeRepository {
  charge(id: ChargeId): Promise<Charge | null>;
  chargeFor(student: StudentRef, kind: ChargeKind, period: YearMonth): Promise<Charge | null>;
  /** Ids de los alumnos que ya tienen una cuota de ese tipo y periodo. */
  chargedStudents(kind: ChargeKind, period: YearMonth): Promise<Set<string>>;
  /** Todas las cuotas de un tipo del alumno, de la más antigua a la más reciente. */
  allFor(student: StudentRef, kind: ChargeKind): Promise<Charge[]>;
  /** Lo que cubren todos los cobros de ese tipo del alumno (en importes de cuota, antes de descuentos). */
  creditFor(student: StudentRef, kind: ChargeKind): Promise<Money>;
  /** Lo que cubren los cobros que apuntan a esa cuota (los de material). */
  creditForCharge(charge: ChargeId): Promise<Money>;
  /** Lo cobrado de verdad (importe de los recibos) de ese tipo al alumno. */
  paidTotal(student: StudentRef, kind: ChargeKind): Promise<Money>;
  saveCharge(charge: Charge): Promise<void>;
}

/** Los puntos de un alumno (sección Puntos): valen solo en el mes en que se ganan. */
export interface PointsWallet {
  available(student: string, month: YearMonth): Promise<number>;
  /** Gasta puntos en un cobro: cuentan en el mes del cobro. */
  redeem(
    student: string,
    date: LocalDate,
    points: number,
    payment: string,
    note: string,
  ): Promise<void>;
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
  /** Lo que tiene cubierto por los cobros del alumno (reparto de la más antigua a la más reciente). */
  coveredCents: number;
  /** Fijada a mano y su motivo. */
  manual: boolean;
  note: string | null;
  /** Si se canceló la parte pendiente: el importe que tenía y lo cancelado (0 si no). */
  fullAmountCents: number;
  cancelledCents: number;
  /** Concepto propio (el producto, en las de material); null en las demás. */
  concept: string | null;
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
  /** Cuotas canceladas de una temporada (mensuales y de socio), por alumno y mes. */
  cancelled(season: Season): Promise<CancelledChargeView[]>;
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
/** Cuotas de un tipo del alumno a las que aún les falta algo, de la más antigua a la más reciente. */
export async function pendingCharges(
  charges: ChargeRepository,
  student: StudentRef,
  kind: ChargeKind,
): Promise<{ charge: Charge; pending: Money }[]> {
  const all = await charges.allFor(student, kind);
  if (kind === 'material') {
    const result: { charge: Charge; pending: Money }[] = [];
    for (const charge of all) {
      result.push({ charge, pending: charge.amount.minus(await coveredOf(charges, charge)) });
    }
    return result.filter((p) => p.pending.cents > 0);
  }
  const allocation = allocateCredit(all, await charges.creditFor(student, kind));
  return all
    .map((charge) => ({ charge, pending: allocation.pending(charge) }))
    .filter((p) => p.pending.cents > 0);
}

/**
 * Lo que tiene cubierto una cuota: las de material, lo que cubren los cobros que apuntan a ella; las demás, su parte del
 * reparto de los cobros de su tipo.
 */
export async function coveredOf(charges: ChargeRepository, charge: Charge): Promise<Money> {
  if (charge.kind === 'material') {
    const credit = await charges.creditForCharge(charge.id);
    return credit.cents >= charge.amount.cents ? charge.amount : credit;
  }
  const all = await charges.allFor(charge.student, charge.kind);
  const allocation = allocateCredit(all, await charges.creditFor(charge.student, charge.kind));
  return allocation.covered(all.find((c) => c.id.equals(charge.id)) ?? charge);
}

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

  /** Crea las cuotas que falten del mes (lo lanza cada noche una tarea y el día 1 crea las del mes). */
  async execute(month: string): Promise<void> {
    await this.generateFor(YearMonth.fromString(month), null);
  }

  /**
   * Crea en el momento las cuotas que les falten este mes a unos alumnos (al darlos de alta, inscribirlos o cambiar
   * sus datos de cobro), sin esperar a la tarea de la noche.
   */
  async forStudents(studentIds: string[]): Promise<void> {
    if (studentIds.length === 0) return;
    await this.generateFor(
      YearMonth.of(LocalDate.fromInstant(this.clock.now())),
      new Set(studentIds),
    );
  }

  private async generateFor(period: YearMonth, only: Set<string> | null): Promise<void> {
    const season = Season.teachingSeason(period);
    // Los meses futuros no se generan: solo existen si se pagan por adelantado.
    if (season === null || YearMonth.of(LocalDate.fromInstant(this.clock.now())).isBefore(period)) {
      return;
    }
    await this.transactions.run(async () => {
      // Dos peticiones que generan el mismo mes a la vez no deben crear la misma cuota dos veces.
      await this.locks.acquire(`billing:charges:${period.toString()}`);
      await this.generate(period, season, only);
    });
  }

  /**
   * Cuotas previstas de un mes futuro: para cada alumno activo ese mes sin cuota de ese mes, lo que pagaría con lo
   * que hace hoy. No se guardan (se crean al cobrarlas o al llegar el mes).
   */
  async expected(month: string): Promise<{ student: BillingStudent; amount: Money }[]> {
    const period = YearMonth.fromString(month);
    const current = YearMonth.of(LocalDate.fromInstant(this.clock.now()));
    if (Season.teachingSeason(period) === null || !current.isBefore(period)) return [];
    const settings = await this.settings.get();
    const calculator = new FeeCalculator();
    const students = await this.directory.activeIn(period);
    const accounts = await this.accounts.accountsOf(
      students.map((s) => StudentRef.fromString(s.id)),
    );
    const charged = await this.charges.chargedStudents('monthly', period);
    const result: { student: BillingStudent; amount: Money }[] = [];
    for (const student of students) {
      if (charged.has(student.id)) continue;
      const account = accounts.get(student.id) ?? null;
      const amount = calculator.quote(feeProfileOf(student, account, settings), settings, 1).total;
      if (amount.cents > 0) result.push({ student, amount });
    }
    return result;
  }

  /** Con todo leído de una vez (alumnos, cuentas y cuotas ya creadas): solo se escriben las que faltan. */
  private async generate(
    period: YearMonth,
    season: Season,
    only: Set<string> | null,
  ): Promise<void> {
    const settings = await this.settings.get();
    const calculator = new FeeCalculator();
    const students = (await this.directory.activeIn(period)).filter((s) =>
      only === null || only.has(s.id)
    );
    if (students.length === 0) return;
    const accounts = await this.accounts.accountsOf(
      students.map((s) => StudentRef.fromString(s.id)),
    );
    const monthly = await this.charges.chargedStudents('monthly', period);
    const membership = await this.charges.chargedStudents('membership', season.firstMonth());
    for (const student of students) {
      const ref = StudentRef.fromString(student.id);
      const account = accounts.get(student.id) ?? null;
      if (!monthly.has(student.id)) {
        const amount =
          calculator.quote(feeProfileOf(student, account, settings), settings, 1).total;
        if (amount.cents > 0) {
          await this.charges.saveCharge(
            Charge.create(ChargeId.generate(), ref, 'monthly', period, amount),
          );
        }
      }
      if (account?.isMember() && !membership.has(student.id)) {
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

/**
 * Las cuotas del mes con su estado y totales (y, en meses futuros, las previstas). Solo lee: las cuotas se crean al
 * dar de alta o cambiar a un alumno y cada noche.
 */
export class ListMonthlyCharges {
  constructor(
    private readonly generate: GenerateMonthlyCharges,
    private readonly query: BillingQuery,
    private readonly clock: Clock,
  ) {}

  /**
   * `kind`: «monthly» (solo las cuotas del mes), «membership» (las cuotas de socio de la temporada de ese mes, cobradas
   * o no) o «all» (las del mes y las de socio pendientes; lo que usa el resumen).
   */
  async execute(
    month: string | null,
    kind: 'all' | 'monthly' | 'membership' = 'all',
  ): Promise<MonthlyCharges> {
    const today = LocalDate.fromInstant(this.clock.now());
    const requested = month === null || month === ''
      ? YearMonth.of(today)
      : YearMonth.fromString(month);
    // Las cuotas de socio cuelgan del primer mes de la temporada.
    const period = kind === 'membership' ? Season.containing(requested).firstMonth() : requested;
    const all = await this.query.charges(period, today);
    // El material cuelga del mes en que se pidió: sale con las cuotas del mes.
    const stored = kind === 'all'
      ? all
      : all.filter((c) => c.kind === kind || (kind === 'monthly' && c.kind === 'material'));
    // En los meses futuros, además de lo cobrado por adelantado, lo previsto de quien aún no lo ha pagado.
    const expected: ChargeView[] = kind === 'membership'
      ? []
      : (await this.generate.expected(period.toString())).map(({ student, amount }) => ({
        id: `prevista-${student.id}-${period.toString()}`,
        studentId: student.id,
        studentName: student.name,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        kind: 'monthly',
        period: period.toString(),
        amountCents: amount.cents,
        status: 'expected',
        paymentId: null,
        receiptNumber: null,
        remindedOn: null,
        coveredCents: 0,
        manual: false,
        note: null,
        fullAmountCents: amount.cents,
        cancelledCents: 0,
        concept: null,
      }));
    const items = [...stored, ...expected].sort((a, b) =>
      a.studentName.localeCompare(b.studentName, 'es') || b.kind.localeCompare(a.kind)
    );
    const sum = (charges: ChargeView[]) => charges.reduce((total, c) => total + c.amountCents, 0);
    return {
      month: period.toString(),
      items,
      expectedCents: sum(items),
      collectedCents: items.reduce(
        (total, c) => total + Math.min(c.coveredCents, c.amountCents),
        0,
      ),
      overdueCount: items.filter((c) => c.status === 'overdue').length,
    };
  }
}

/** Cancela lo pendiente de una cuota (entera o, si está pagada en parte, lo que falta): deja de deberse. */
export class CancelCharge {
  constructor(
    private readonly charges: ChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(chargeId: string): Promise<void> {
    const charge = await this.charges.charge(ChargeId.fromString(chargeId));
    if (charge === null) throw new ChargeNotFound();
    if (charge.kind === 'material') throw materialOnlyFromOrder();
    charge.cancel(
      await coveredOf(this.charges, charge),
      LocalDate.fromInstant(this.clock.now()),
    );
    await this.charges.saveCharge(charge);
  }
}

/** Vuelve a deberse entera una cuota cancelada. */
export class ReactivateCharge {
  constructor(private readonly charges: ChargeRepository) {}

  async execute(chargeId: string): Promise<void> {
    const charge = await this.charges.charge(ChargeId.fromString(chargeId));
    if (charge === null) throw new ChargeNotFound();
    if (charge.kind === 'material') throw materialOnlyFromOrder();
    charge.reactivate();
    await this.charges.saveCharge(charge);
  }
}

function materialOnlyFromOrder(): InvalidValue {
  return new InvalidValue(
    'id',
    'El cobro del material se cancela o se reactiva desde su pedido, en «Material deportivo».',
  );
}

/** Cuota cancelada (entera o la parte pendiente) tal como se lista en «Cuotas canceladas». */
export interface CancelledChargeView {
  id: string;
  studentId: string;
  studentName: string;
  kind: string;
  period: string;
  /** Importe de la cuota, lo que se conservó (lo cobrado) y lo cancelado. */
  fullAmountCents: number;
  keptCents: number;
  cancelledCents: number;
  cancelledOn: string;
}

export class ListCancelledCharges {
  constructor(
    private readonly query: BillingQuery,
    private readonly clock: Clock,
  ) {}

  execute(seasonYear: number | null): Promise<CancelledChargeView[]> {
    const season = seasonYear === null
      ? Season.containing(YearMonth.of(LocalDate.fromInstant(this.clock.now())))
      : Season.startingIn(seasonYear);
    return this.query.cancelled(season);
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
  /** Descuento especial: en porcentaje o en céntimos, con motivo. */
  specialPercent: number | null;
  specialAmountCents: number | null;
  specialConcept: string | null;
  /** Puntos a canjear (0 = ninguno; como mucho 5 y solo en cuotas mensuales). */
  redeemPoints: number;
  /** Solo en los cobros de material: el cobro del pedido que se paga. */
  chargeId?: string | null;
}

function specialDiscountOf(request: PaymentRequest): SpecialDiscount | null {
  if (request.specialPercent !== null) {
    return new SpecialDiscount(request.specialPercent, request.specialConcept ?? '');
  }
  if (request.specialAmountCents !== null) {
    return new SpecialDiscount(
      Money.cents(request.specialAmountCents),
      request.specialConcept ?? '',
    );
  }
  return null;
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
  /** Lo que cubre en cuotas (antes de descuentos): se reparte entre las cuotas del alumno. */
  credit: Money;
  /** Descuento por pago adelantado (3, 6 meses o todo el año) que queda fijado en cada mes que cubre. */
  prepaymentPercent: number;
  /** Descuento familiar que ya lleva cada cuota mensual (el adelantado se suma a él sobre la base). */
  familyPercent: number;
  /** El cobro del pedido de material que se paga (null en los demás). */
  charge: Charge | null;
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
    private readonly points: PointsWallet,
  ) {}

  /** Los puntos que el alumno puede canjear en un cobro de ese mes. */
  availablePoints(studentId: string, month: YearMonth): Promise<number> {
    return this.points.available(studentId, month);
  }

  /** Gasta los puntos canjeados en un cobro. */
  redeemPoints(
    studentId: string,
    date: LocalDate,
    points: number,
    payment: string,
    note: string,
  ): Promise<void> {
    return this.points.redeem(studentId, date, points, payment, note);
  }

  async execute(request: PaymentRequest): Promise<PaymentQuote> {
    paymentMethodFromName(request.method);
    const date = LocalDate.fromString(request.date);
    const ref = StudentRef.fromString(request.studentId);
    const student = await this.directory.find(ref, date);
    if (student === null) throw new BillingStudentNotFound();
    if (!['monthly', 'membership', 'material'].includes(request.kind)) {
      throw new InvalidValue(
        'kind',
        'Tipo de cobro desconocido: usa monthly, membership o material.',
      );
    }
    const special = specialDiscountOf(request);
    if (request.kind === 'material') {
      if (request.redeemPoints > 0) throw InvalidPaymentRequest.pointsOnlyMonthly();
      return await this.material(student, ref, date, request.chargeId ?? null, special);
    }
    const settings = await this.settings.get();
    if (request.kind === 'membership') {
      if (request.redeemPoints > 0) throw InvalidPaymentRequest.pointsOnlyMonthly();
      return await this.membership(student, ref, date, settings, special);
    }
    const periods = await this.periods(ref, date, request.months);
    const account = await this.accounts.account(ref);
    const available = await this.points.available(ref.value, YearMonth.of(date));
    if (
      request.redeemPoints !== 0 &&
      (request.redeemPoints !== PointsRedemption.REQUIRED_POINTS ||
        request.redeemPoints > available)
    ) {
      throw InvalidPaymentRequest.points(available);
    }
    const points = request.redeemPoints === 0 ? null : new PointsRedemption(request.redeemPoints);
    const profile = feeProfileOf(student, account, settings);
    const calculator = new FeeCalculator();
    const monthly = calculator.quote(profile, settings, 1).total;
    // Las cuotas ya generadas se cobran por lo que les falta; los meses nuevos, con el importe de hoy.
    const pending = new Map<string, Money>();
    for (const { charge, pending: left } of await pendingCharges(this.charges, ref, 'monthly')) {
      pending.set(charge.period.toString(), left);
    }
    const items = periods.map((p) =>
      new QuoteLine(`Cuota de ${p.label()}`, pending.get(p.toString()) ?? monthly)
    );
    const sameAsToday = items.every((l) => l.amount.equals(monthly));
    const quote = sameAsToday
      ? calculator.quote(profile, settings, request.months, special, points)
      : calculator.quoteItems(items, settings, special, points);
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
      credit: items.reduce((sum, l) => sum.plus(l.amount), Money.zero()),
      prepaymentPercent: settings.tariff.prepaymentPercent(periods.length),
      // Con la cuota de hoy los descuentos se suman sobre la base (como en el presupuesto); con importes pendientes
      // distintos, el adelantado se aplica sobre cada importe.
      familyPercent: sameAsToday && student.hasSiblings ? settings.tariff.familyPercent : 0,
      charge: null,
    };
  }

  /** Lo que le falta al cobro de un pedido de material (con descuento especial, si se quiere). */
  private async material(
    student: BillingStudent,
    ref: StudentRef,
    date: LocalDate,
    chargeId: string | null,
    special: SpecialDiscount | null,
  ): Promise<PaymentQuote> {
    if (chargeId === null || chargeId === '') {
      throw new InvalidValue('chargeId', 'Elige el pedido de material que se cobra.');
    }
    const charge = await this.charges.charge(ChargeId.fromString(chargeId));
    if (charge === null || charge.kind !== 'material' || !charge.student.equals(ref)) {
      throw new ChargeNotFound();
    }
    const pending = charge.amount.minus(await coveredOf(this.charges, charge));
    if (pending.cents <= 0) throw InvalidPaymentRequest.nothingToPay();
    const label = charge.concept() ?? 'Material deportivo';
    return {
      student,
      kind: 'material',
      date,
      quote: new FeeCalculator().quoteMembership(label, pending, special),
      periods: [charge.period],
      concept: label,
      monthlyCharge: charge.amount,
      credit: pending,
      prepaymentPercent: 0,
      familyPercent: 0,
      charge,
    };
  }

  /** Meses que aún se pueden cobrar y los que propone la forma de pago preferida, en una sola pasada. */
  async months(studentId: string): Promise<{ remaining: number; suggested: number }> {
    const ref = StudentRef.fromString(studentId);
    const plan: PreferredPlan = (await this.accounts.account(ref))?.preferredPlan() ?? 'monthly';
    const remaining = await this.available(ref, LocalDate.fromInstant(this.clock.now()));
    return { remaining, suggested: monthsWithin(plan, remaining) };
  }

  private async periods(ref: StudentRef, date: LocalDate, months: number): Promise<YearMonth[]> {
    if (!Number.isInteger(months) || months < 1 || months > FeeCalculator.MAX_MONTHS) {
      throw InvalidPaymentRequest.months();
    }
    const candidates = await this.candidates(ref, date);
    if (months > candidates.length) throw InvalidPaymentRequest.beyondSeason(candidates.length);
    // El 20 % de «todo el año» exige cobrar todo lo que queda (9 o 10 meses).
    if (months >= WHOLE_YEAR_MIN_MONTHS && months < candidates.length) {
      throw InvalidPaymentRequest.wholeYear(candidates.length);
    }
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
    const periods = (await pendingCharges(this.charges, ref, 'monthly')).map((p) =>
      p.charge.period
    );
    let start = YearMonth.of(date);
    if (Season.teachingSeason(start) === null) start = Season.containing(start).firstMonth();
    const season = Season.containing(start);
    for (let month = start; season.includes(month); month = month.next()) {
      if ((await this.charges.chargeFor(ref, 'monthly', month)) === null) periods.push(month);
    }
    return periods;
  }

  /** Cualquier alumno puede pagar la cuota de socio de la temporada si aún no la ha pagado (y pasa a ser socio). */
  private async membership(
    student: BillingStudent,
    ref: StudentRef,
    date: LocalDate,
    settings: BillingSettings,
    special: SpecialDiscount | null,
  ): Promise<PaymentQuote> {
    const season = Season.containing(YearMonth.of(date));
    const charge = await this.charges.chargeFor(ref, 'membership', season.firstMonth());
    const pendingFee = charge === null
      ? settings.tariff.membershipFee
      : (await pendingCharges(this.charges, ref, 'membership')).find((p) =>
        p.charge.id.equals(charge.id)
      )?.pending ?? Money.zero();
    if (pendingFee.cents <= 0) throw InvalidPaymentRequest.nothingToPay();
    const label = `Cuota de socio ${season.label()}`;
    const quote = new FeeCalculator().quoteMembership(label, pendingFee, special);
    return {
      student,
      kind: 'membership',
      date,
      quote,
      periods: [season.firstMonth()],
      concept: label,
      monthlyCharge: charge?.amount ?? settings.tariff.membershipFee,
      credit: pendingFee,
      prepaymentPercent: 0,
      familyPercent: 0,
      charge: null,
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
    private readonly accounts: StudentAccountRepository,
  ) {}

  execute(request: PaymentRequest): Promise<string> {
    return this.transactions.run(async () => {
      // Un doble clic no puede cobrar dos veces lo mismo: el segundo espera y recalcula sobre lo ya pagado.
      await this.locks.acquire(`billing:student:${StudentRef.fromString(request.studentId).value}`);
      const quote = await this.quotes.execute(request);
      await PeriodClosed.guard(this.closed, quote.date);
      const ref = StudentRef.fromString(quote.student.id);
      const season = Season.containing(YearMonth.of(quote.date));
      // Los meses que cubre quedan con su descuento por pago adelantado fijado; lo que cubre el cobro es lo que les
      // faltaba ya con ese descuento.
      const pendingBefore = new Map(
        (await pendingCharges(this.charges, ref, quote.kind)).map((p) => [
          p.charge.period.toString(),
          p.pending,
        ]),
      );
      const covered: Charge[] = quote.charge === null ? [] : [quote.charge];
      let credit = Money.zero();
      for (const period of quote.charge === null ? quote.periods : []) {
        const charge = (await this.charges.chargeFor(ref, quote.kind, period)) ??
          Charge.create(ChargeId.generate(), ref, quote.kind, period, quote.monthlyCharge);
        const already = charge.amount.minus(pendingBefore.get(period.toString()) ?? charge.amount);
        charge.applyPrepayment(quote.prepaymentPercent, quote.familyPercent);
        const left = charge.amount.minus(already);
        if (!left.isNegative()) credit = credit.plus(left);
        covered.push(charge);
      }
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
        credit: quote.kind === 'monthly' ? credit : quote.credit,
        charge: quote.charge?.id ?? null,
      });
      await this.payments.savePayment(payment);
      for (const charge of covered) {
        charge.coveredBy(payment.id);
        await this.charges.saveCharge(charge);
      }
      // Los puntos canjeados se gastan (en el mes del cobro); pagar la cuota de socio convierte en socio.
      if (request.redeemPoints > 0) {
        await this.quotes.redeemPoints(
          ref.value,
          quote.date,
          request.redeemPoints,
          payment.id.value,
          `Canje en el recibo ${payment.receipt.toString()}`,
        );
      }
      if (quote.kind === 'membership') {
        const account = (await this.accounts.account(ref)) ?? StudentAccount.open(ref);
        if (!account.isMember()) {
          account.update(account.preferredPlan(), true, account.privateRate());
        }
        await this.accounts.saveAccount(account);
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
    if (charge !== null) {
      const left = (await pendingCharges(this.charges, student, kind)).find((p) =>
        p.charge.id.equals((charge as Charge).id)
      );
      if (left === undefined) return null;
    }
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
    charge.coveredBy(payment.id);
    await this.charges.saveCharge(charge);
    return payment.id.value;
  }
}

/** Emite, bajo petición, la factura de un cobro (una sola vez). */
/** Corrige la forma de pago de un cobro ya registrado (se refleja en el recibo y en Contabilidad). */
/** Corrige el día de un cobro ya registrado (dentro de la temporada de su recibo). */
export class ReschedulePayment {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(paymentId: string, date: string): Promise<void> {
    const payment = await this.payments.payment(PaymentId.fromString(paymentId));
    if (payment === null) throw new PaymentNotFound();
    payment.reschedule(LocalDate.fromString(date), LocalDate.fromInstant(this.clock.now()));
    await this.payments.savePayment(payment);
  }
}

/** Corrige el importe de un cobro ya registrado, con el motivo como línea del recibo. */
export class CorrectPaymentAmount {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(paymentId: string, amountCents: number, reason: string): Promise<void> {
    const payment = await this.payments.payment(PaymentId.fromString(paymentId));
    if (payment === null) throw new PaymentNotFound();
    payment.correctTotal(Money.cents(amountCents), reason);
    await this.payments.savePayment(payment);
  }
}

export class ChangePaymentMethod {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(paymentId: string, method: string): Promise<void> {
    const payment = await this.payments.payment(PaymentId.fromString(paymentId));
    if (payment === null) throw new PaymentNotFound();
    payment.changeMethod(paymentMethodFromName(method));
    await this.payments.savePayment(payment);
  }
}

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
  /** Horas semanales de clase (grupos normales), con horarios especiales ya aplicados. */
  weeklyHours: number;
  /** Cuota de un mes con lo que hace hoy (tramo + particulares, con descuento familiar si procede). */
  monthlyFeeCents: number;
  familyDiscount: boolean;
  /** Porcentaje del descuento familiar que llevan sus cuotas mensuales (0 si no tiene). */
  familyPercent: number;
  hasPrivateLessons: boolean;
  /** Si la cuota de socio de la temporada en curso está pagada. */
  membershipPaid: boolean;
  membershipFeeCents: number;
  /** Cuotas mensuales de la temporada en curso con lo cubierto y lo que falta. */
  charges: AccountCharge[];
  /** Su cuota de socio de la temporada (con lo pendiente), o null si no tiene. */
  membershipCharge: { id: string; pendingCents: number } | null;
  /** Lo que sobra de los cobros tras cubrir todas las cuotas mensuales. */
  balanceCents: number;
  /** Cobros de material con algo pendiente (para cobrarlos desde «Registrar cobro»). */
  materialCharges: { id: string; concept: string; pendingCents: number }[];
  /** Todo lo que mueve en el club, por tipo: lo cobrado (recibos) y lo pendiente. */
  totals: { kind: ChargeKind; paidCents: number; pendingCents: number }[];
}

export interface AccountCharge {
  id: string;
  period: string;
  amountCents: number;
  coveredCents: number;
  pendingCents: number;
  status: string;
  manual: boolean;
  note: string | null;
  /** Descuento por pago adelantado fijado en este mes. */
  discountPercent: number;
  /** Si se canceló (entera o la parte pendiente): su importe sin cancelar y lo cancelado. */
  fullAmountCents: number;
  cancelledCents: number;
}

export class GetStudentAccount {
  constructor(
    private readonly directory: StudentDirectory,
    private readonly accounts: StudentAccountRepository,
    private readonly quotes: QuotePayment,
    private readonly clock: Clock,
    private readonly settings: BillingSettingsRepository,
    private readonly charges: ChargeRepository,
  ) {}

  async execute(studentId: string): Promise<AccountView> {
    const ref = StudentRef.fromString(studentId);
    const today = LocalDate.fromInstant(this.clock.now());
    const student = await this.directory.find(ref, today);
    if (student === null) throw new BillingStudentNotFound();
    const account = await this.accounts.account(ref);
    const rate = account?.privateRate() ?? null;
    const settings = await this.settings.get();
    const profile = feeProfileOf(student, account, settings);
    const monthly = new FeeCalculator().quote(profile, settings, 1).total;
    const season = Season.containing(YearMonth.of(today));
    const membership = await this.charges.chargeFor(ref, 'membership', season.firstMonth());
    const membershipLeft = await pendingCharges(this.charges, ref, 'membership');
    const monthlyCharges = await this.charges.allFor(ref, 'monthly');
    const allocation = allocateCredit(monthlyCharges, await this.charges.creditFor(ref, 'monthly'));
    const months = await this.quotes.months(studentId);
    const materialLeft = await pendingCharges(this.charges, ref, 'material');
    const totals: AccountView['totals'] = [];
    for (const kind of ['monthly', 'membership', 'material'] as const) {
      const pending = kind === 'monthly'
        ? allocation.pendingTotal
        : (kind === 'membership' ? membershipLeft : materialLeft).reduce(
          (sum, p) => sum.plus(p.pending),
          Money.zero(),
        );
      totals.push({
        kind,
        paidCents: (await this.charges.paidTotal(ref, kind)).cents,
        pendingCents: Math.max(0, pending.cents),
      });
    }
    return {
      preferredPlan: account?.preferredPlan() ?? 'monthly',
      member: account?.isMember() === true,
      privateRate: rate === null ? null : decimal(rate),
      points: await this.quotes.availablePoints(studentId, YearMonth.of(today)),
      suggestedMonths: months.suggested,
      remainingMonths: months.remaining,
      weeklyHours: student.regularWeeklyHours,
      monthlyFeeCents: monthly.cents,
      familyDiscount: student.hasSiblings && settings.tariff.familyPercent > 0,
      familyPercent: student.hasSiblings ? settings.tariff.familyPercent : 0,
      hasPrivateLessons: student.privateLessons.length > 0,
      membershipPaid: membership !== null &&
        !membershipLeft.some((p) => p.charge.id.equals(membership.id)),
      membershipFeeCents: (membership?.amount ?? settings.tariff.membershipFee).cents,
      charges: monthlyCharges
        .filter((c) => season.includes(c.period))
        .map((c) => ({
          id: c.id.value,
          period: c.period.toString(),
          amountCents: c.amount.cents,
          coveredCents: allocation.covered(c).cents,
          pendingCents: allocation.pending(c).cents,
          status: c.statusOn(today, allocation.covered(c)),
          manual: c.isManual(),
          note: c.note(),
          discountPercent: c.discountPercent(),
          fullAmountCents: c.fullAmount().cents,
          cancelledCents: c.cancelledAmount().cents,
        })),
      membershipCharge: membership === null ? null : {
        id: membership.id.value,
        pendingCents:
          membershipLeft.find((p) => p.charge.id.equals(membership.id))?.pending.cents ?? 0,
      },
      balanceCents: allocation.balance.cents,
      materialCharges: materialLeft.map((p) => ({
        id: p.charge.id.value,
        concept: p.charge.concept() ?? 'Material deportivo',
        pendingCents: p.pending.cents,
      })),
      totals,
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

/** Cuota de un mes con lo que hace hoy el alumno (tramo + particulares, con descuento familiar si procede). */
async function currentMonthlyFee(
  directory: StudentDirectory,
  accounts: StudentAccountRepository,
  settings: BillingSettingsRepository,
  ref: StudentRef,
  today: LocalDate,
): Promise<Money | null> {
  return (await currentFee(directory, accounts, settings, ref, today))?.fee ?? null;
}

/** Cuota de un mes de hoy y el descuento familiar que ya lleva (0 si no tiene). */
async function currentFee(
  directory: StudentDirectory,
  accounts: StudentAccountRepository,
  settings: BillingSettingsRepository,
  ref: StudentRef,
  today: LocalDate,
): Promise<{ fee: Money; family: number } | null> {
  const student = await directory.find(ref, today);
  if (student === null) return null;
  const config = await settings.get();
  const fee = new FeeCalculator().quote(
    feeProfileOf(student, await accounts.account(ref), config),
    config,
    1,
  ).total;
  return { fee, family: student.hasSiblings ? config.tariff.familyPercent : 0 };
}

/**
 * Recalcula las cuotas mensuales de un alumno cuando cambia lo que las determina (grupos, horario especial, familia,
 * precio de particulares): desde el mes siguiente o, del día 1 al 10, desde el actual, hasta junio. Las fijadas a mano
 * no cambian; las ya cobradas sí, y la diferencia queda pendiente o a favor.
 */
export class RecalculateCharges {
  static readonly LAST_DAY_FOR_CURRENT_MONTH = 10;

  constructor(
    private readonly directory: StudentDirectory,
    private readonly accounts: StudentAccountRepository,
    private readonly settings: BillingSettingsRepository,
    private readonly charges: ChargeRepository,
    private readonly clock: Clock,
  ) {}

  /** Cuota de un mes con lo que hace hoy el alumno (para guardarla antes de un cambio). */
  currentFee(studentId: string): Promise<Money | null> {
    return currentMonthlyFee(
      this.directory,
      this.accounts,
      this.settings,
      StudentRef.fromString(studentId),
      LocalDate.fromInstant(this.clock.now()),
    );
  }

  /**
   * `previousFee`: la cuota de un mes que tenía antes del cambio; sirve para deducir el descuento por pago adelantado
   * de cuotas que no lo tienen apuntado (las importadas de la hoja). `notBefore`: el primer mes que se puede tocar
   * (p. ej. el siguiente a una baja).
   */
  async execute(
    studentId: string,
    previousFee: Money | null = null,
    notBefore: YearMonth | null = null,
  ): Promise<void> {
    const ref = StudentRef.fromString(studentId);
    const today = LocalDate.fromInstant(this.clock.now());
    const thisMonth = YearMonth.of(today);
    const earliest = today.day <= RecalculateCharges.LAST_DAY_FOR_CURRENT_MONTH
      ? thisMonth
      : thisMonth.next();
    const from = notBefore !== null && earliest.isBefore(notBefore) ? notBefore : earliest;
    const current = await currentFee(this.directory, this.accounts, this.settings, ref, today);
    if (current === null) return;
    const { fee, family } = current;
    const season = Season.containing(from);
    const tariff = (await this.settings.get()).tariff;
    const percents = [tariff.threeMonthsPercent, tariff.sixMonthsPercent, tariff.seasonPercent];
    for (const charge of await this.charges.allFor(ref, 'monthly')) {
      if (charge.period.isBefore(from) || !season.includes(charge.period) || charge.isManual()) {
        continue;
      }
      // Su importe completo: una cuota cancelada también se recalcula (por si se reactiva).
      const before = charge.fullAmount();
      if (previousFee !== null) charge.inferDiscount(previousFee, percents, family);
      charge.reprice(fee, family);
      if (!charge.fullAmount().equals(before) || charge.discountPercent() > 0) {
        await this.charges.saveCharge(charge);
      }
    }
  }
}

/**
 * Fija a mano el importe de una cuota mensual con un motivo: solo ese mes o ese y los siguientes de la temporada
 * (creando las cuotas que falten). Los cobros no cambian; el reparto se rehace solo.
 */
export class AdjustCharge {
  constructor(private readonly charges: ChargeRepository) {}

  async execute(
    studentId: string,
    month: string,
    amountCents: number,
    reason: string,
    scope: 'one' | 'rest',
  ): Promise<void> {
    if (scope !== 'one' && scope !== 'rest') {
      throw new InvalidValue('scope', 'Elige si afecta solo a ese mes o también a los siguientes.');
    }
    const ref = StudentRef.fromString(studentId);
    const first = YearMonth.fromString(month);
    const season = Season.teachingSeason(first);
    if (season === null) throw new InvalidValue('month', 'Julio y agosto no tienen cuotas.');
    const amount = Money.cents(amountCents);
    const last = scope === 'one' ? first : season.lastMonth();
    for (let period = first; !last.isBefore(period); period = period.next()) {
      const charge = (await this.charges.chargeFor(ref, 'monthly', period)) ??
        Charge.create(ChargeId.generate(), ref, 'monthly', period, amount);
      charge.adjust(amount, reason);
      await this.charges.saveCharge(charge);
    }
  }
}

/** Devuelve una cuota fijada a mano al importe calculado con lo que hace hoy el alumno. */
export class ResetCharge {
  constructor(
    private readonly directory: StudentDirectory,
    private readonly accounts: StudentAccountRepository,
    private readonly settings: BillingSettingsRepository,
    private readonly charges: ChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string, month: string): Promise<void> {
    const ref = StudentRef.fromString(studentId);
    const charge = await this.charges.chargeFor(ref, 'monthly', YearMonth.fromString(month));
    if (charge === null) throw new ChargeNotFound();
    const today = LocalDate.fromInstant(this.clock.now());
    const fee = await currentMonthlyFee(this.directory, this.accounts, this.settings, ref, today);
    if (fee === null) throw new BillingStudentNotFound();
    charge.resetTo(fee);
    await this.charges.saveCharge(charge);
  }
}

/** Fija a mano el descuento por pago adelantado de una cuota y la recalcula con lo que hace hoy el alumno. */
export class SetChargeDiscount {
  constructor(
    private readonly directory: StudentDirectory,
    private readonly accounts: StudentAccountRepository,
    private readonly settings: BillingSettingsRepository,
    private readonly charges: ChargeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string, month: string, percent: number): Promise<void> {
    const ref = StudentRef.fromString(studentId);
    const charge = await this.charges.chargeFor(ref, 'monthly', YearMonth.fromString(month));
    if (charge === null) throw new ChargeNotFound();
    const today = LocalDate.fromInstant(this.clock.now());
    // Un mes ya pasado es historia: solo se anota el descuento, su importe no se recalcula con la tarifa de hoy.
    if (charge.period.isBefore(YearMonth.of(today))) {
      charge.noteDiscount(percent);
    } else {
      const current = await currentFee(this.directory, this.accounts, this.settings, ref, today);
      if (current === null) throw new BillingStudentNotFound();
      charge.setDiscount(percent, current.fee, current.family);
    }
    await this.charges.saveCharge(charge);
  }
}
