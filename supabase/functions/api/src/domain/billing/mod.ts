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

export type ChargeKind = 'monthly' | 'membership';
export type ChargeStatus = 'paid' | 'due' | 'overdue' | 'upcoming';

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

export class ChargeAlreadyPaid extends Error {
  constructor() {
    super('Esa cuota ya está pagada.');
    this.name = 'ChargeAlreadyPaid';
  }
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
export class Charge {
  static readonly LAST_DAY_IN_TIME = 5;

  private constructor(
    readonly id: ChargeId,
    readonly student: StudentRef,
    readonly kind: ChargeKind,
    readonly period: YearMonth,
    readonly amount: Money,
    private paid: PaymentId | null,
    private reminded: LocalDate | null,
  ) {}

  static create(
    id: ChargeId,
    student: StudentRef,
    kind: ChargeKind,
    period: YearMonth,
    amount: Money,
  ): Charge {
    return new Charge(id, student, kind, period, amount, null, null);
  }

  static restore(
    id: ChargeId,
    student: StudentRef,
    kind: ChargeKind,
    period: YearMonth,
    amount: Money,
    paidBy: PaymentId | null,
    remindedOn: LocalDate | null,
  ): Charge {
    return new Charge(id, student, kind, period, amount, paidBy, remindedOn);
  }

  statusOn(today: LocalDate): ChargeStatus {
    if (this.paid !== null) return 'paid';
    if (this.kind === 'membership') return 'due';
    const current = YearMonth.of(today);
    if (current.isBefore(this.period)) return 'upcoming';
    if (this.period.isBefore(current)) return 'overdue';
    return today.day > Charge.LAST_DAY_IN_TIME ? 'overdue' : 'due';
  }

  payWith(payment: PaymentId): void {
    if (this.paid !== null) throw new ChargeAlreadyPaid();
    this.paid = payment;
  }

  markReminded(on: LocalDate): void {
    this.reminded = on;
  }

  isPaid(): boolean {
    return this.paid !== null;
  }

  paidBy(): PaymentId | null {
    return this.paid;
  }

  remindedOn(): LocalDate | null {
    return this.reminded;
  }
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
    if (prepayment > 0) discounts.push([`Pago adelantado ${months} meses`, prepayment]);
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
    if (prepayment > 0) discounts.push([`Pago adelantado ${months} meses`, prepayment]);
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
  }): Payment {
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
    private balance: number,
  ) {}

  static open(student: StudentRef): StudentAccount {
    return new StudentAccount(student, 'monthly', false, null, 0);
  }

  static restore(
    student: StudentRef,
    plan: PreferredPlan,
    member: boolean,
    privateRate: Money | null,
    points: number,
  ): StudentAccount {
    return new StudentAccount(student, plan, member, privateRate, points);
  }

  update(plan: PreferredPlan, member: boolean, privateRate: Money | null): void {
    if (privateRate !== null && privateRate.isNegative()) {
      throw new InvalidValue('privateRate', 'El precio por hora no puede ser negativo.');
    }
    this.plan = plan;
    this.member = member;
    this.rate = privateRate;
  }

  adjustPoints(delta: number): void {
    if (this.balance + delta < 0) {
      throw new InvalidValue('points', 'Los puntos no pueden quedar en negativo.');
    }
    this.balance += delta;
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

  points(): number {
    return this.balance;
  }
}
