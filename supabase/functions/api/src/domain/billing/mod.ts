import {
  type HasErrorDetails,
  InvalidValue,
  type LocalDate,
  Money,
  roundHalfAwayFromZero,
  Season,
  Uuid,
  YearMonth,
} from '../common/mod.ts';

export class ChargeId extends Uuid {}
export class PaymentId extends Uuid {}
export class StudentRef extends Uuid {}
export class TeacherRef extends Uuid {}

/** `material`: el cobro de un pedido de material deportivo (ver material-deportivo-como-cobro.md). */
export type ChargeKind = 'monthly' | 'membership' | 'material';
/** `expected`: cuota prevista de un mes futuro que aún no existe (lo que se espera cobrar con la tarifa de hoy). */
export type ChargeStatus =
  | 'paid'
  | 'partial'
  | 'due'
  | 'overdue'
  | 'upcoming'
  | 'expected'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'card' | 'transfer';

export function paymentMethodFromName(name: string): PaymentMethod {
  if (name !== 'cash' && name !== 'card' && name !== 'transfer') {
    throw new InvalidValue('method', 'Forma de pago desconocida: usa cash o transfer.');
  }
  return name;
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return { cash: 'Efectivo', card: 'Datáfono', transfer: 'Transferencia' }[method];
}

/** Forma de pago preferida: solo propone cuántos meses cobrar. */
export type PreferredPlan = 'monthly' | 'three_months' | 'six_months' | 'rest_of_season';

export function preferredPlanFromName(name: string): PreferredPlan {
  if (!['monthly', 'three_months', 'six_months', 'rest_of_season'].includes(name)) {
    throw new InvalidValue('preferredPlan', 'Forma de pago preferida desconocida.');
  }
  return name as PreferredPlan;
}

export function monthsWithin(plan: PreferredPlan, remaining: number): number {
  const wanted = { monthly: 1, three_months: 3, six_months: 6, rest_of_season: remaining }[plan];
  return Math.max(1, Math.min(remaining, wanted));
}

export class InvoiceAlreadyIssued extends Error {
  constructor() {
    super('Este cobro ya tiene factura.');
    this.name = 'InvoiceAlreadyIssued';
  }
}

export class InvalidPaymentRequest extends Error implements HasErrorDetails {
  constructor(
    message: string,
    private readonly why: string,
  ) {
    super(message);
    this.name = 'InvalidPaymentRequest';
  }

  static months(): InvalidPaymentRequest {
    return new InvalidPaymentRequest('Se pueden cobrar entre 1 y 10 meses.', 'invalid_months');
  }

  static wholeYear(available: number): InvalidPaymentRequest {
    return new InvalidPaymentRequest(
      `El 20 % es por pagar todo el año: quedan ${available} meses y hay que cobrarlos todos.`,
      'whole_year_required',
    );
  }

  static beyondSeason(available: number): InvalidPaymentRequest {
    return new InvalidPaymentRequest(
      `Solo quedan ${available} meses de temporada por cobrar.`,
      'beyond_season',
    );
  }

  static nothingToPay(): InvalidPaymentRequest {
    return new InvalidPaymentRequest(
      'No hay nada pendiente que cobrar con esos datos.',
      'nothing_to_pay',
    );
  }

  static points(available: number): InvalidPaymentRequest {
    return new InvalidPaymentRequest(
      `Los puntos se canjean de ${PointsRedemption.REQUIRED_POINTS} en ${PointsRedemption.REQUIRED_POINTS} (un ${PointsRedemption.PERCENT} % de una cuota), y el alumno tiene ${available}.`,
      'invalid_points',
    );
  }

  static pointsOnlyMonthly(): InvalidPaymentRequest {
    return new InvalidPaymentRequest(
      'Los puntos solo se canjean en las cuotas mensuales, no en la de socio.',
      'points_only_monthly',
    );
  }

  reason(): string {
    return this.why;
  }

  details(): Record<string, string> {
    return { reason: this.why };
  }
}

/** Precios y descuentos de la temporada. */
export class Tariff {
  constructor(
    readonly threeHours: Money,
    readonly twoHours: Money,
    readonly hourAndHalf: Money,
    readonly oneHour: Money,
    readonly membershipFee: Money,
    readonly familyPercent: number,
    readonly threeMonthsPercent: number,
    readonly sixMonthsPercent: number,
    readonly seasonPercent: number,
  ) {
    for (const price of [threeHours, twoHours, hourAndHalf, oneHour, membershipFee]) {
      if (price.isNegative()) {
        throw new InvalidValue('tariff', 'Los precios no pueden ser negativos.');
      }
    }
    for (const percent of [familyPercent, threeMonthsPercent, sixMonthsPercent, seasonPercent]) {
      if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
        throw new InvalidValue('tariff', 'Los descuentos deben estar entre 0 y 100 %.');
      }
    }
  }

  static defaults(): Tariff {
    return new Tariff(
      Money.euros(55),
      Money.euros(45),
      Money.euros(40),
      Money.euros(35),
      Money.euros(50),
      10,
      10,
      15,
      20,
    );
  }

  /** Tramo por horas semanales de grupos normales. */
  forWeeklyHours(hours: number): Money {
    if (hours <= 0) return Money.zero();
    if (hours >= 3) return this.threeHours;
    if (hours >= 2) return this.twoHours;
    if (hours >= 1.5) return this.hourAndHalf;
    return this.oneHour;
  }

  /** Descuento por pago adelantado según los meses cubiertos. */
  /** 3 meses o más: el primer tramo; 6 o más: el segundo; 9 o más (la temporada): el tercero. */
  prepaymentPercent(months: number): number {
    if (months >= 9) return this.seasonPercent;
    if (months >= 6) return this.sixMonthsPercent;
    if (months >= 3) return this.threeMonthsPercent;
    return 0;
  }
}

/** Datos del club que aparecen en recibos y facturas. */
export class ClubFiscalData {
  constructor(
    readonly name: string,
    readonly taxId: string,
    readonly address: string,
  ) {
    if (name.trim() === '' || taxId.trim() === '') {
      throw new InvalidValue('fiscal', 'El nombre y el NIF del club son obligatorios.');
    }
  }

  static defaults(): ClubFiscalData {
    return new ClubFiscalData('Club Ajedrez Puerta Elvira', 'G00000000', 'Granada');
  }
}

/** Ajustes de facturación del club. Afectan a los cobros nuevos, nunca a los registrados. */
export class BillingSettings {
  static readonly VAT_PERCENT = 21;

  /** @param privateRates precio por hora de las particulares por profesor */
  constructor(
    readonly tariff: Tariff,
    readonly defaultPrivateRate: Money,
    readonly privateRates: ReadonlyMap<string, Money>,
    readonly club: ClubFiscalData,
    readonly vatPercent: number = BillingSettings.VAT_PERCENT,
  ) {
    if (defaultPrivateRate.isNegative() || [...privateRates.values()].some((m) => m.isNegative())) {
      throw new InvalidValue('privateRates', 'Los precios por hora no pueden ser negativos.');
    }
  }

  static defaults(): BillingSettings {
    return new BillingSettings(
      Tariff.defaults(),
      Money.euros(30),
      new Map(),
      ClubFiscalData.defaults(),
    );
  }

  privateRateFor(teacherId: string): Money {
    return this.privateRates.get(teacherId) ?? this.defaultPrivateRate;
  }

  withPrivateRates(rates: ReadonlyMap<string, Money>): BillingSettings {
    return new BillingSettings(
      this.tariff,
      this.defaultPrivateRate,
      rates,
      this.club,
      this.vatPercent,
    );
  }
}

/** Número correlativo por temporada: R-2026-0001 (recibos) o F-2026-0001 (facturas). */
export class DocumentNumber {
  private constructor(
    readonly prefix: string,
    readonly seasonYear: number,
    readonly sequence: number,
  ) {}

  static receipt(seasonYear: number, sequence: number): DocumentNumber {
    return new DocumentNumber('R', seasonYear, sequence);
  }

  static invoice(seasonYear: number, sequence: number): DocumentNumber {
    return new DocumentNumber('F', seasonYear, sequence);
  }

  static fromString(value: string): DocumentNumber {
    const [prefix = '', year = '0', sequence = '0'] = value.split('-');
    return new DocumentNumber(prefix, Number(year), Number(sequence));
  }

  toString(): string {
    return `${this.prefix}-${this.seasonYear}-${String(this.sequence).padStart(4, '0')}`;
  }
}

/**
 * Cuota de un alumno: mensual (una por mes de temporada) o de socio (una por temporada).
 * Plazo de las mensuales: del día 1 al 5 de su mes.
 */
/**
 * Cuota de un mes (o de socio de una temporada): lo que el alumno debe. No sabe por sí sola si está pagada: eso sale
 * de repartir lo que cubren sus cobros (ver `allocateCredit` y cuotas-separadas-de-los-cobros.md).
 */
export class Charge {
  static readonly LAST_DAY_IN_TIME = 5;

  private constructor(
    readonly id: ChargeId,
    readonly student: StudentRef,
    readonly kind: ChargeKind,
    readonly period: YearMonth,
    private value: Money,
    private firstPayment: PaymentId | null,
    private reminded: LocalDate | null,
    private manual: boolean,
    private reason: string | null,
    /** Descuento por pago adelantado que tuvo este mes (0, 10, 15, 20…): se mantiene al recalcular. */
    private prepaid: number,
    /**
     * Cancelación: el día y lo que se conserva de la cuota (lo que ya estaba cobrado; 0 si se canceló entera). Lo
     * pendiente deja de deberse; al reactivarla, vuelve a deberse entera.
     */
    private cancellation: { on: LocalDate; kept: Money } | null = null,
    /** Concepto propio (las de material: el producto pedido); las demás lo sacan de su tipo y mes. */
    private label: string | null = null,
  ) {}

  static create(
    id: ChargeId,
    student: StudentRef,
    kind: ChargeKind,
    period: YearMonth,
    amount: Money,
  ): Charge {
    return new Charge(id, student, kind, period, amount, null, null, false, null, 0);
  }

  /** Cobro de un pedido de material: su importe y el producto como concepto. */
  static material(
    id: ChargeId,
    student: StudentRef,
    period: YearMonth,
    amount: Money,
    concept: string,
  ): Charge {
    if (amount.isNegative()) {
      throw new InvalidValue('priceCents', 'El precio no puede ser negativo.');
    }
    return new Charge(
      id,
      student,
      'material',
      period,
      amount,
      null,
      null,
      false,
      null,
      0,
      null,
      concept,
    );
  }

  static restore(fields: {
    id: ChargeId;
    student: StudentRef;
    kind: ChargeKind;
    period: YearMonth;
    amount: Money;
    paidBy: PaymentId | null;
    remindedOn: LocalDate | null;
    manual: boolean;
    note: string | null;
    discountPercent?: number;
    cancellation?: { on: LocalDate; kept: Money } | null;
    concept?: string | null;
  }): Charge {
    return new Charge(
      fields.id,
      fields.student,
      fields.kind,
      fields.period,
      fields.amount,
      fields.paidBy,
      fields.remindedOn,
      fields.manual,
      fields.note,
      fields.discountPercent ?? 0,
      fields.cancellation ?? null,
      fields.concept ?? null,
    );
  }

  /** Concepto propio (el producto de un pedido de material), o null si sale del tipo y el mes. */
  concept(): string | null {
    return this.label;
  }

  /** Corrige el precio de un pedido de material (la aplicación comprueba que no tenga nada cobrado). */
  changePrice(amount: Money, concept: string): void {
    if (this.kind !== 'material') {
      throw new InvalidValue('id', 'Solo se cambia así el precio del material.');
    }
    if (amount.isNegative()) {
      throw new InvalidValue('priceCents', 'El precio no puede ser negativo.');
    }
    this.value = amount;
    this.label = concept;
  }

  /** Lo que se debe de esta cuota: su importe o, si se canceló, lo que se conservó (lo cobrado). */
  get amount(): Money {
    if (this.cancellation === null) return this.value;
    return this.cancellation.kept.cents < this.value.cents ? this.cancellation.kept : this.value;
  }

  /** Su importe sin tener en cuenta la cancelación. */
  fullAmount(): Money {
    return this.value;
  }

  /**
   * Cancela lo pendiente: entera si no tiene nada cubierto o, si está pagada en parte, solo lo que falta (queda una cuota
   * cobrada menor). Una cuota cobrada no se cancela.
   */
  cancel(covered: Money, today: LocalDate): void {
    if (this.cancellation !== null) throw new InvalidValue('id', 'La cuota ya está cancelada.');
    const kept = covered.isNegative() ? Money.zero() : covered;
    if (kept.cents >= this.value.cents) {
      throw new InvalidValue('id', 'La cuota ya está cobrada: no hay nada que cancelar.');
    }
    this.cancellation = { on: today, kept };
  }

  /** Vuelve a deberse entera. */
  reactivate(): void {
    this.cancellation = null;
  }

  cancelledOn(): LocalDate | null {
    return this.cancellation?.on ?? null;
  }

  /** Lo que se canceló (0 si no está cancelada). */
  cancelledAmount(): Money {
    return this.value.minus(this.amount);
  }

  /** Cancelada sin nada cobrado: es como si no existiera. */
  isWhollyCancelled(): boolean {
    return this.cancellation !== null && this.amount.cents === 0;
  }

  /** Lo que se conservó al cancelarla (para guardarlo). */
  keptOnCancellation(): Money | null {
    return this.cancellation?.kept ?? null;
  }

  /** Estado según la fecha y lo que tiene cubierto por los cobros del alumno. */
  statusOn(today: LocalDate, covered: Money): ChargeStatus {
    if (this.isWhollyCancelled()) return 'cancelled';
    if (!covered.isNegative() && covered.cents >= this.amount.cents) return 'paid';
    if (covered.cents > 0) return 'partial';
    if (this.kind !== 'monthly') return 'due';
    const current = YearMonth.of(today);
    if (current.isBefore(this.period)) return 'upcoming';
    if (this.period.isBefore(current)) return 'overdue';
    return today.day > Charge.LAST_DAY_IN_TIME ? 'overdue' : 'due';
  }

  /**
   * Recálculo automático (cambio de grupos, familia…) con la cuota de un mes nueva: conserva el descuento por pago
   * adelantado de este mes y no toca las cuotas fijadas a mano.
   */
  /** `family`: descuento familiar que ya lleva `fee` (el de pago adelantado se suma a él sobre la base). */
  reprice(fee: Money, family = 0): void {
    if (!this.manual) this.value = Charge.discounted(fee, this.prepaid, family);
  }

  /** Mes pagado por adelantado con descuento: se fija el porcentaje (si aún no tenía) y se descuenta del importe. */
  applyPrepayment(percent: number, family = 0): void {
    if (this.prepaid > 0 || percent <= 0 || this.manual) return;
    this.prepaid = percent;
    this.value = Charge.discounted(this.value, percent, family);
  }

  /** Fija a mano el descuento por pago adelantado de este mes y recalcula con la cuota de un mes indicada. */
  setDiscount(percent: number, fee: Money, family = 0): void {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      throw new InvalidValue('percent', 'El descuento debe estar entre 0 y 100.');
    }
    this.prepaid = percent;
    this.manual = false;
    this.reason = null;
    this.value = Charge.discounted(fee, percent, family);
  }

  discountPercent(): number {
    return this.prepaid;
  }

  /** Anota el descuento por pago adelantado sin cambiar el importe (meses ya pasados, que no se recalculan). */
  noteDiscount(percent: number): void {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      throw new InvalidValue('percent', 'El descuento debe estar entre 0 y 100.');
    }
    this.prepaid = percent;
  }

  /**
   * Deduce el descuento de una cuota que no lo tiene apuntado (p. ej. importada de la hoja) comparándola con la cuota
   * de un mes que tenía el alumno: si coincide con uno de los porcentajes de pago adelantado, lo fija sin cambiar el
   * importe (sumado al familiar sobre la base, como al cobrar).
   */
  inferDiscount(previousFee: Money, candidates: readonly number[], family = 0): void {
    if (this.prepaid > 0 || this.manual || previousFee.cents <= 0) return;
    if (this.value.cents >= previousFee.cents) return;
    const match = prepaymentIn(this.value, previousFee, candidates, family);
    if (match !== null) this.prepaid = match;
  }

  /**
   * Los descuentos porcentuales se suman sobre la cuota base (como al cobrar): una cuota que ya lleva un `family` % pasa
   * a llevar `family + percent` %. Base 40 €, familiar 10 % (36 €) y 20 % adelantado: 40 € − 30 % = 28 €.
   */
  private static discounted(fee: Money, percent: number, family = 0): Money {
    if (percent <= 0) return fee;
    if (family <= 0) return fee.minus(fee.percent(percent));
    return Money.cents(
      Math.round((fee.cents * Math.max(0, 100 - family - percent)) / (100 - family)),
    );
  }

  /** Importe fijado a mano, con su motivo; el recálculo automático ya no lo cambia. */
  adjust(amount: Money, reason: string): void {
    if (amount.isNegative()) {
      throw new InvalidValue('amountCents', 'El importe no puede ser negativo.');
    }
    if (reason.trim() === '') throw new InvalidValue('reason', 'Indica el motivo del cambio.');
    this.value = amount;
    this.manual = true;
    this.reason = [...reason.trim()].slice(0, 160).join('');
  }

  /** Vuelve al importe calculado (con su descuento por pago adelantado, si lo tiene) y deja de estar fijada a mano. */
  resetTo(fee: Money): void {
    this.value = Charge.discounted(fee, this.prepaid);
    this.manual = false;
    this.reason = null;
  }

  /** Recuerda el primer cobro que la cubrió (para enlazar el recibo); el estado no depende de esto. */
  coveredBy(payment: PaymentId): void {
    this.firstPayment ??= payment;
  }

  markReminded(on: LocalDate): void {
    this.reminded = on;
  }

  isManual(): boolean {
    return this.manual;
  }

  note(): string | null {
    return this.reason;
  }

  paidBy(): PaymentId | null {
    return this.firstPayment;
  }

  remindedOn(): LocalDate | null {
    return this.reminded;
  }
}

/** Resultado de repartir lo cubierto por los cobros entre las cuotas de un alumno. */
export class CreditAllocation {
  constructor(
    private readonly coveredById: Map<string, Money>,
    private readonly amounts: Map<string, Money>,
    /** Lo que sobra tras cubrir todas las cuotas: saldo a favor. */
    readonly balance: Money,
  ) {}

  covered(charge: Charge): Money {
    return this.coveredById.get(charge.id.value) ?? Money.zero();
  }

  pending(charge: Charge): Money {
    return charge.amount.minus(this.covered(charge));
  }

  get pendingTotal(): Money {
    let total = Money.zero();
    for (const [id, amount] of this.amounts) {
      total = total.plus(amount.minus(this.coveredById.get(id) ?? Money.zero()));
    }
    return total;
  }
}

/**
 * Reparte lo que cubren los cobros de un alumno (de un mismo tipo) entre sus cuotas, de la más antigua a la más
 * reciente. Lo que sobra queda como saldo a favor.
 */
export function allocateCredit(charges: readonly Charge[], credit: Money): CreditAllocation {
  const ordered = [...charges].sort((a, b) =>
    a.period.toString().localeCompare(b.period.toString())
  );
  let left = credit.isNegative() ? Money.zero() : credit;
  const covered = new Map<string, Money>();
  const amounts = new Map<string, Money>();
  for (const charge of ordered) {
    amounts.set(charge.id.value, charge.amount);
    const share = left.cents >= charge.amount.cents ? charge.amount : left;
    covered.set(charge.id.value, share);
    left = left.minus(share);
  }
  return new CreditAllocation(covered, amounts, left);
}

/**
 * Año completo: la temporada son 10 meses (septiembre a junio). El 20 % es por pagar todo lo que queda, y solo
 * se ofrece si quedan 9 o 10 meses; con menos, el máximo es el de 6 meses.
 */
export const WHOLE_YEAR_MIN_MONTHS = 9;

/**
 * El porcentaje de pago adelantado que explica `amount` partiendo de la cuota de un mes `fee` (que ya lleva el
 * `family` %), sumado al familiar sobre la base: 40,50 € (45 € − 10 %) con un 20 % son 31,50 € (45 € − 30 %). Un
 * descuento aplicado encima del familiar (40,50 € − 20 % = 32,40 €) no cuadra: es un error que corrige el diagnóstico.
 * Null si ninguno de `candidates` cuadra.
 */
export function prepaymentIn(
  amount: Money,
  fee: Money,
  candidates: readonly number[],
  family = 0,
): number | null {
  if (fee.cents <= 0 || amount.cents >= fee.cents) return null;
  const percent = (100 - family) * (1 - amount.cents / fee.cents);
  return candidates.find((p) => p > 0 && Math.abs(p - percent) <= 1) ?? null;
}

function prepaymentLabel(months: number): string {
  return months >= WHOLE_YEAR_MIN_MONTHS
    ? 'Pago de todo el año'
    : `Pago adelantado ${months} meses`;
}

export class QuoteLine {
  constructor(
    readonly label: string,
    readonly amount: Money,
  ) {}
}

/** Desglose de un cobro: las líneas siempre suman exactamente el total. */
export class Quote {
  constructor(
    readonly lines: readonly QuoteLine[],
    readonly gross: Money,
    readonly discountPercent: number,
    readonly total: Money,
    readonly monthlyBase: Money,
  ) {}
}

export class PrivateLesson {
  static readonly WEEKS_PER_MONTH = 4;

  constructor(
    readonly groupName: string,
    readonly weeklyHours: number,
    readonly hourlyRate: Money,
  ) {}

  monthlyHours(): number {
    return this.weeklyHours * PrivateLesson.WEEKS_PER_MONTH;
  }

  monthlyPrice(): Money {
    return this.hourlyRate.times(this.monthlyHours());
  }
}

/** Lo que determina la cuota de un alumno: sus horas en grupos normales, sus particulares y si tiene hermanos. */
export class FeeProfile {
  constructor(
    readonly regularWeeklyHours: number,
    readonly privateLessons: readonly PrivateLesson[],
    readonly hasSiblings: boolean,
  ) {}
}

/** Descuento puntual decidido al cobrar, en porcentaje o en una cantidad fija, con su motivo. */
export class SpecialDiscount {
  readonly percent: number | null;
  readonly amount: Money | null;

  constructor(
    value: number | Money,
    readonly concept: string,
  ) {
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new InvalidValue(
          'specialDiscount',
          'El descuento especial debe estar entre 1 y 100 %.',
        );
      }
      this.percent = value;
      this.amount = null;
    } else {
      if (value.cents <= 0) {
        throw new InvalidValue('specialDiscount', 'El descuento especial debe ser mayor que 0 €.');
      }
      this.percent = null;
      this.amount = value;
    }
    if (concept.trim() === '') {
      throw new InvalidValue('specialDiscount', 'Indica el motivo del descuento especial.');
    }
  }
}

/**
 * Canje de puntos al cobrar: 5 puntos descuentan un 5 % de UNA cuota mensual (la del primer mes),
 * aunque se paguen varios meses. Con menos de 5 puntos no hay descuento; los puntos tendrán más usos.
 */
export class PointsRedemption {
  static readonly REQUIRED_POINTS = 5;
  static readonly PERCENT = 5;

  constructor(readonly points: number) {
    if (points !== PointsRedemption.REQUIRED_POINTS) throw InvalidPaymentRequest.points(points);
  }

  discountOn(oneMonth: Money): Money {
    return oneMonth.percent(PointsRedemption.PERCENT);
  }

  label(): string {
    return `Canje de ${this.points} puntos (${PointsRedemption.PERCENT} % de un mes)`;
  }
}

function hoursLabel(hours: number): string {
  return `${String(Math.round(hours * 100) / 100).replace('.', ',')} h`;
}

function monthsLabel(months: number): string {
  return months === 1 ? '1 mes' : `${months} meses`;
}

/**
 * Cálculo de la cuota (ver specs/features/cobros/spec.md):
 * tramo por horas semanales + particulares, con descuentos sumados sobre el bruto.
 */
export class FeeCalculator {
  static readonly MAX_MONTHS = 10;

  quote(
    profile: FeeProfile,
    settings: BillingSettings,
    months: number,
    special: SpecialDiscount | null = null,
    points: PointsRedemption | null = null,
  ): Quote {
    if (!Number.isInteger(months) || months < 1 || months > FeeCalculator.MAX_MONTHS) {
      throw InvalidPaymentRequest.months();
    }
    const tariff = settings.tariff;
    const tier = tariff.forWeeklyHours(profile.regularWeeklyHours);
    const monthlyBase = profile.privateLessons.reduce((sum, l) => sum.plus(l.monthlyPrice()), tier);
    const lines: QuoteLine[] = [];
    if (tier.cents > 0) {
      lines.push(
        new QuoteLine(
          `${hoursLabel(profile.regularWeeklyHours)} semanales · ${monthsLabel(months)}`,
          tier.times(months),
        ),
      );
    }
    for (const lesson of profile.privateLessons) {
      lines.push(
        new QuoteLine(
          `${lesson.groupName} · ${
            hoursLabel(lesson.monthlyHours())
          }/mes × ${lesson.hourlyRate.format()}${months > 1 ? ` · ${monthsLabel(months)}` : ''}`,
          lesson.monthlyPrice().times(months),
        ),
      );
    }
    const gross = monthlyBase.times(months);
    const discounts: [string, number][] = [];
    if (profile.hasSiblings && tariff.familyPercent > 0) {
      discounts.push(['Descuento familiar', tariff.familyPercent]);
    }
    const prepayment = tariff.prepaymentPercent(months);
    if (prepayment > 0) discounts.push([prepaymentLabel(months), prepayment]);
    return this.applyDiscounts(lines, gross, discounts, special, points, monthlyBase, monthlyBase);
  }

  /**
   * Resta los descuentos: primero los porcentajes (sumados sobre el bruto) y después las cantidades fijas
   * (canje de puntos sobre una cuota mensual, descuento especial en euros), sin bajar de 0 €.
   */
  private applyDiscounts(
    lines: readonly QuoteLine[],
    gross: Money,
    percentages: [string, number][],
    special: SpecialDiscount | null,
    points: PointsRedemption | null,
    oneMonth: Money,
    monthlyBase: Money,
  ): Quote {
    if (special?.percent !== null && special?.percent !== undefined) {
      percentages.push([special.concept, special.percent]);
    }
    const percent = Math.min(100, percentages.reduce((sum, [, p]) => sum + p, 0));
    let total = gross.percent(100 - percent);
    const result = [...lines, ...discountLines(percentages, gross, gross.minus(total))];
    const fixed: [string, Money][] = [];
    if (points !== null) fixed.push([points.label(), points.discountOn(oneMonth)]);
    if (special?.amount) fixed.push([special.concept, special.amount]);
    for (const [label, amount] of fixed) {
      const applied = amount.cents > total.cents ? total : amount;
      if (applied.cents === 0) continue;
      result.push(new QuoteLine(`${label} −${applied.format()}`, Money.cents(-applied.cents)));
      total = total.minus(applied);
    }
    return new Quote(result, gross, percent, total, monthlyBase);
  }

  /**
   * Cobro de importes ya fijados (cuotas pendientes con su importe guardado y meses nuevos con el de hoy):
   * el descuento familiar ya va dentro de cada importe; se suman el de pago adelantado y el especial.
   */
  quoteItems(
    items: readonly QuoteLine[],
    settings: BillingSettings,
    special: SpecialDiscount | null = null,
    points: PointsRedemption | null = null,
  ): Quote {
    const months = items.length;
    const first = items[0];
    if (!first || months > FeeCalculator.MAX_MONTHS) throw InvalidPaymentRequest.months();
    const gross = items.reduce((sum, l) => sum.plus(l.amount), Money.zero());
    const discounts: [string, number][] = [];
    const prepayment = settings.tariff.prepaymentPercent(months);
    if (prepayment > 0) discounts.push([prepaymentLabel(months), prepayment]);
    return this.applyDiscounts(
      items,
      gross,
      discounts,
      special,
      points,
      first.amount,
      first.amount,
    );
  }

  /** La cuota de socio: sin descuentos salvo, si se decide, uno especial. */
  quoteMembership(label: string, fee: Money, special: SpecialDiscount | null = null): Quote {
    return this.applyDiscounts([new QuoteLine(label, fee)], fee, [], special, null, fee, fee);
  }
}

/** Una línea por descuento; la última absorbe el redondeo para que todo sume el total exacto. */
function discountLines(
  discounts: readonly [string, number][],
  gross: Money,
  totalDiscount: Money,
): QuoteLine[] {
  const lines: QuoteLine[] = [];
  let applied = Money.zero();
  discounts.forEach(([label, percent], index) => {
    const amount = index === discounts.length - 1
      ? totalDiscount.minus(applied)
      : gross.percent(percent);
    applied = applied.plus(amount);
    lines.push(new QuoteLine(`${label} −${percent} %`, Money.cents(-amount.cents)));
  });
  return lines;
}

export class InvoiceCustomer {
  constructor(
    readonly name: string,
    readonly taxId: string,
    readonly address: string,
  ) {
    if (name.trim() === '' || taxId.trim() === '' || address.trim() === '') {
      throw new InvalidValue('customer', 'Para la factura hacen falta nombre, NIF y dirección.');
    }
  }
}

/** Factura de un cobro: el IVA está incluido en el precio y se desglosa. */
export class Invoice {
  constructor(
    readonly number: DocumentNumber,
    readonly issuedOn: LocalDate,
    readonly customer: InvoiceCustomer,
    readonly vatPercent: number,
    readonly base: Money,
    readonly vat: Money,
    readonly total: Money,
  ) {}

  static forTotal(
    number: DocumentNumber,
    issuedOn: LocalDate,
    customer: InvoiceCustomer,
    vatPercent: number,
    total: Money,
  ): Invoice {
    const base = Money.cents(roundHalfAwayFromZero((total.cents * 100) / (100 + vatPercent)));
    return new Invoice(number, issuedOn, customer, vatPercent, base, total.minus(base), total);
  }
}

/** Cobro registrado, con su recibo y, si se pide, su factura. */
export class Payment {
  private constructor(
    readonly id: PaymentId,
    readonly student: StudentRef,
    private paidDay: LocalDate,
    private paidWith: PaymentMethod,
    readonly receipt: DocumentNumber,
    readonly kind: ChargeKind,
    readonly concept: string,
    private quoteLines: readonly QuoteLine[],
    private amount: Money,
    readonly periods: readonly YearMonth[],
    private issued: Invoice | null,
    /** Lo que cubre en importes de cuota, antes de descuentos (ver cuotas-separadas-de-los-cobros.md). */
    private covering: Money,
    /** La cuota que cubre un cobro de material (las demás se reparten por tipo). */
    readonly charge: ChargeId | null,
  ) {}

  static register(fields: {
    id: PaymentId;
    student: StudentRef;
    paidOn: LocalDate;
    method: PaymentMethod;
    receipt: DocumentNumber;
    kind: ChargeKind;
    concept: string;
    lines: readonly QuoteLine[];
    total: Money;
    periods: readonly YearMonth[];
    /** Por defecto, el total cobrado. */
    credit?: Money;
    /** Solo en los cobros de material: la cuota del pedido que cubre. */
    charge?: ChargeId | null;
  }): Payment {
    if ((fields.kind === 'material') !== Boolean(fields.charge)) {
      throw new InvalidValue('chargeId', 'Un cobro de material cubre el cobro de un pedido.');
    }
    return new Payment(
      fields.id,
      fields.student,
      fields.paidOn,
      fields.method,
      fields.receipt,
      fields.kind,
      fields.concept,
      fields.lines,
      fields.total,
      fields.periods,
      null,
      fields.credit ?? fields.total,
      fields.charge ?? null,
    );
  }

  static restore(
    fields: Parameters<typeof Payment.register>[0] & { invoice: Invoice | null },
  ): Payment {
    const payment = Payment.register(fields);
    payment.issued = fields.invoice;
    return payment;
  }

  issueInvoice(
    number: DocumentNumber,
    customer: InvoiceCustomer,
    vatPercent: number,
    issuedOn: LocalDate,
  ): Invoice {
    if (this.issued !== null) throw new InvoiceAlreadyIssued();
    this.issued = Invoice.forTotal(number, issuedOn, customer, vatPercent, this.total);
    return this.issued;
  }

  invoice(): Invoice | null {
    return this.issued;
  }

  get method(): PaymentMethod {
    return this.paidWith;
  }

  get paidOn(): LocalDate {
    return this.paidDay;
  }

  get lines(): readonly QuoteLine[] {
    return this.quoteLines;
  }

  get total(): Money {
    return this.amount;
  }

  get credit(): Money {
    return this.covering;
  }

  /** Corrige el día del cobro: dentro de la temporada de su recibo y nunca en el futuro. */
  reschedule(on: LocalDate, today: LocalDate): void {
    if (Season.containing(YearMonth.of(on)).startYear !== this.receipt.seasonYear) {
      throw new InvalidValue(
        'date',
        `La fecha debe ser de la temporada ${this.receipt.seasonYear}/${
          String((this.receipt.seasonYear + 1) % 100).padStart(2, '0')
        } del recibo.`,
      );
    }
    if (today.isBefore(on)) throw new InvalidValue('date', 'La fecha no puede ser futura.');
    this.paidDay = on;
  }

  /** Corrige el importe cobrado añadiendo una línea con la diferencia y el motivo (las líneas siguen sumando el total). */
  correctTotal(total: Money, reason: string): void {
    if (total.isNegative()) {
      throw new InvalidValue('amountCents', 'El importe no puede ser negativo.');
    }
    if (reason.trim() === '') {
      throw new InvalidValue('reason', 'Indica el motivo de la corrección.');
    }
    const difference = total.minus(this.amount);
    if (difference.equals(Money.zero())) return;
    this.quoteLines = [
      ...this.quoteLines,
      new QuoteLine(`Corrección: ${reason.trim()}`, difference),
    ];
    this.amount = total;
    this.covering = this.covering.plus(difference);
  }

  /** Corrige cómo se cobró (p. ej. se anotó como transferencia y fue en efectivo); el importe no cambia. */
  changeMethod(method: PaymentMethod): void {
    this.paidWith = method;
  }
}

/** Datos de facturación del alumno: preferencia de pago, socio, precio de particulares y puntos. */
export class StudentAccount {
  private constructor(
    readonly student: StudentRef,
    private plan: PreferredPlan,
    private member: boolean,
    private rate: Money | null,
  ) {}

  static open(student: StudentRef): StudentAccount {
    return new StudentAccount(student, 'monthly', false, null);
  }

  static restore(
    student: StudentRef,
    plan: PreferredPlan,
    member: boolean,
    privateRate: Money | null,
  ): StudentAccount {
    return new StudentAccount(student, plan, member, privateRate);
  }

  update(plan: PreferredPlan, member: boolean, privateRate: Money | null): void {
    if (privateRate !== null && privateRate.isNegative()) {
      throw new InvalidValue('privateRate', 'El precio por hora no puede ser negativo.');
    }
    this.plan = plan;
    this.member = member;
    this.rate = privateRate;
  }

  preferredPlan(): PreferredPlan {
    return this.plan;
  }

  isMember(): boolean {
    return this.member;
  }

  privateRate(): Money | null {
    return this.rate;
  }
}
