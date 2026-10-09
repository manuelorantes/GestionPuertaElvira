import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  allocateCredit,
  BillingSettings,
  Charge,
  ChargeId,
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
  PointsRedemption,
  PrivateLesson,
  QuoteLine,
  SpecialDiscount,
  StudentAccount,
  StudentRef,
  Tariff,
  TeacherRef,
} from '../../src/domain/billing/mod.ts';

const quote = (
  profile: FeeProfile,
  months: number,
  special: SpecialDiscount | null = null,
  points: PointsRedemption | null = null,
) => new FeeCalculator().quote(profile, BillingSettings.defaults(), months, special, points);

Deno.test('FeeCalculator should charge the tier for the weekly hours of regular groups', () => {
  const tiers: [number, number][] = [[0, 0], [1, 3500], [1.5, 4000], [2, 4500], [2.5, 4500], [
    3,
    5500,
  ], [4, 5500]];
  for (const [hours, expected] of tiers) {
    const q = quote(new FeeProfile(hours, [], false), 1);
    assertEquals(q.total.cents, expected);
    assertEquals(q.monthlyBase.cents, expected);
  }
});

Deno.test('FeeCalculator should add private lessons by monthly hours and rate, combined with the tier', () => {
  const q = quote(
    new FeeProfile(0, [new PrivateLesson('Particular · viernes', 1.5, Money.euros(35))], false),
    1,
  );
  assertEquals(q.total.cents, 21000, '1,5 h × 4 semanas × 35 €');
  assertEquals(q.lines[0]?.label, 'Particular · viernes · 6 h/mes × 35 €');
  assertEquals(
    quote(new FeeProfile(2, [new PrivateLesson('Particular', 1, Money.euros(30))], false), 1).total
      .cents,
    4500 + 12000,
  );
});

Deno.test('FeeCalculator should add up discounts for siblings and prepayment', () => {
  const q = quote(new FeeProfile(3, [], true), 3);
  assertEquals(q.gross.cents, 16500);
  assertEquals(q.discountPercent, 20);
  assertEquals(q.total.cents, 13200);
  assertEquals(q.lines.map((l) => l.label), [
    '3 h semanales · 3 meses',
    'Descuento familiar −10 %',
    'Pago adelantado 3 meses −10 %',
  ]);
  for (
    const [months, percent] of [[1, 0], [2, 0], [3, 10], [5, 10], [6, 15], [7, 15], [8, 15], [
      9,
      20,
    ], [10, 20]] as [
      number,
      number,
    ][]
  ) {
    assertEquals(quote(new FeeProfile(1, [], false), months).discountPercent, percent);
  }
});

Deno.test('FeeCalculator should add a special discount and keep lines adding up', () => {
  const special = quote(
    new FeeProfile(2, [], false),
    1,
    new SpecialDiscount(5, 'Canje de 5 puntos'),
  );
  assertEquals(special.total.cents, 4275);
  assertEquals(special.lines[1]?.label, 'Canje de 5 puntos −5 %');

  const q = quote(
    new FeeProfile(1.5, [new PrivateLesson('P', 1.5, Money.cents(3333))], true),
    6,
    new SpecialDiscount(3, 'Especial'),
  );
  assert(q.lines.reduce((sum, l) => sum.plus(l.amount), Money.zero()).equals(q.total));

  assertThrows(
    () => quote(new FeeProfile(1, [], false), 11),
    InvalidPaymentRequest,
    'Se pueden cobrar entre 1 y 10 meses.',
  );
});

Deno.test('BillingSettings should start with the published prices and use teacher private rates', () => {
  const settings = BillingSettings.defaults();
  assertEquals(settings.tariff.threeHours.cents, 5500);
  assertEquals(settings.tariff.oneHour.cents, 3500);
  assertEquals(settings.tariff.membershipFee.cents, 5000);
  assertEquals(settings.tariff.familyPercent, 10);
  assertEquals(settings.privateRateFor('t1').cents, 3000);
  assertEquals(settings.vatPercent, 21);
  const teacher = TeacherRef.generate().value;
  assertEquals(
    settings.withPrivateRates(new Map([[teacher, Money.euros(28)]])).privateRateFor(teacher).cents,
    2800,
  );
  assertThrows(
    () =>
      new Tariff(
        Money.euros(-1),
        Money.euros(45),
        Money.euros(40),
        Money.euros(35),
        Money.euros(50),
        10,
        10,
        15,
        20,
      ),
    InvalidValue,
  );
  assertThrows(() => new ClubFiscalData('', 'G18000000', 'Granada'), InvalidValue);
});

Deno.test('StudentAccount should open monthly, update preferences and keep points at zero or more', () => {
  const account = StudentAccount.open(StudentRef.generate());
  assertEquals(account.preferredPlan(), 'monthly');
  assertFalse(account.isMember());
  account.update('three_months', true, Money.euros(35));
  assertEquals(monthsWithin(account.preferredPlan(), 10), 3);
  assertEquals(monthsWithin('rest_of_season', 4), 4);
  assert(account.isMember());
  assertEquals(account.privateRate()?.cents, 3500);
});

Deno.test('Charge should derive its status from the date and how much of it is covered', () => {
  const cases: [string, string, number, string][] = [
    ['2026-10', '2026-10-01', 0, 'due'],
    ['2026-10', '2026-10-05', 0, 'due'],
    ['2026-10', '2026-10-06', 0, 'overdue'],
    ['2026-09', '2026-10-02', 0, 'overdue'],
    ['2026-11', '2026-10-20', 0, 'upcoming'],
    ['2026-09', '2026-10-02', 4500, 'paid'],
    ['2026-09', '2026-10-02', 2000, 'partial'],
  ];
  for (const [period, today, covered, expected] of cases) {
    const charge = Charge.create(
      ChargeId.generate(),
      StudentRef.generate(),
      'monthly',
      YearMonth.fromString(period),
      Money.euros(45),
    );
    assertEquals(charge.statusOn(LocalDate.fromString(today), Money.cents(covered)), expected);
  }
  const membership = Charge.create(
    ChargeId.generate(),
    StudentRef.generate(),
    'membership',
    YearMonth.fromString('2026-09'),
    Money.euros(50),
  );
  assertEquals(membership.statusOn(LocalDate.fromString('2027-03-10'), Money.zero()), 'due');
});

Deno.test('Charge should keep a manual amount with its reason and ignore automatic repricing', () => {
  const charge = Charge.create(
    ChargeId.generate(),
    StudentRef.generate(),
    'monthly',
    YearMonth.fromString('2026-10'),
    Money.euros(40),
  );
  charge.reprice(Money.euros(55));
  assertEquals(charge.amount.cents, 5500);
  assertFalse(charge.isManual());

  charge.adjust(Money.euros(25), 'Media mensualidad');
  assertEquals([charge.amount.cents, charge.isManual(), charge.note()], [
    2500,
    true,
    'Media mensualidad',
  ]);
  charge.reprice(Money.euros(55));
  assertEquals(charge.amount.cents, 2500, 'las fijadas a mano no se recalculan');
  assertThrows(() => charge.adjust(Money.euros(10), '  '), InvalidValue);
  assertThrows(() => charge.adjust(Money.cents(-1), 'x'), InvalidValue);

  charge.resetTo(Money.euros(55));
  assertEquals([charge.amount.cents, charge.isManual(), charge.note()], [5500, false, null]);

  charge.markReminded(LocalDate.fromString('2026-10-02'));
  assert(charge.remindedOn()?.equals(LocalDate.fromString('2026-10-02')));
  const payment = PaymentId.generate();
  charge.coveredBy(payment);
  charge.coveredBy(PaymentId.generate());
  assertEquals(charge.paidBy(), payment, 'recuerda el primer cobro que la cubrió');
});

Deno.test('Charge should keep its prepayment discount when it is repriced', () => {
  const charge = Charge.create(
    ChargeId.generate(),
    StudentRef.generate(),
    'monthly',
    YearMonth.fromString('2026-10'),
    Money.euros(40),
  );
  charge.applyPrepayment(10);
  assertEquals([charge.amount.cents, charge.discountPercent()], [3600, 10]);
  charge.reprice(Money.euros(55));
  assertEquals(charge.amount.cents, 4950, '55 € con el mismo 10 %');
  charge.applyPrepayment(20);
  assertEquals(charge.discountPercent(), 10, 'el descuento ya fijado no se acumula');
  charge.setDiscount(0, Money.euros(55));
  assertEquals([charge.amount.cents, charge.discountPercent()], [5500, 0]);
  assertThrows(() => charge.setDiscount(120, Money.euros(55)), InvalidValue);
});

Deno.test('allocateCredit should cover the oldest charges first and keep what is left as balance', () => {
  const charge = (period: string, euros: number) =>
    Charge.create(
      ChargeId.generate(),
      StudentRef.generate(),
      'monthly',
      YearMonth.fromString(period),
      Money.euros(euros),
    );
  // Cambio de tarifa a mitad de un trimestre: 40, 55, 55 con 120 € cubiertos.
  const sep = charge('2026-09', 40);
  const oct = charge('2026-10', 55);
  const nov = charge('2026-11', 55);
  const result = allocateCredit([nov, sep, oct], Money.euros(120));
  assertEquals(result.covered(sep).cents, 4000);
  assertEquals(result.covered(oct).cents, 5500);
  assertEquals(result.covered(nov).cents, 2500);
  assertEquals(result.pending(nov).cents, 3000);
  assertEquals(result.balance.cents, 0);
  assertEquals(result.pendingTotal.cents, 3000);

  // Septiembre cobrado de más y octubre de menos: 50 + 25 € cubren 25 + 50 €.
  const fixed = allocateCredit([charge('2026-09', 25), charge('2026-10', 50)], Money.euros(75));
  assertEquals([fixed.pendingTotal.cents, fixed.balance.cents], [0, 0]);

  const extra = allocateCredit([charge('2026-09', 25)], Money.euros(40));
  assertEquals(extra.balance.cents, 1500, 'saldo a favor');
});

function payment(total: Money): Payment {
  return Payment.register({
    id: PaymentId.generate(),
    student: StudentRef.generate(),
    paidOn: LocalDate.fromString('2026-10-02'),
    method: 'transfer',
    receipt: DocumentNumber.receipt(2026, 1),
    kind: 'monthly',
    concept: 'Octubre 2026',
    lines: [new QuoteLine('2 h semanales · 1 mes', total)],
    total,
    periods: [YearMonth.fromString('2026-10')],
  });
}

Deno.test('Payment should change its payment method, keeping everything else', () => {
  const p = payment(Money.cents(4500));
  p.changeMethod('cash');
  assertEquals(p.method, 'cash');
  assertEquals(p.total.cents, 4500);
  assertEquals(p.receipt.toString(), 'R-2026-0001');
});

Deno.test('Payment should move its date within its season and correct its amount with a line', () => {
  const p = payment(Money.cents(2000));
  const today = LocalDate.fromString('2026-10-07');
  p.reschedule(LocalDate.fromString('2026-09-15'), today);
  assertEquals(p.paidOn.toString(), '2026-09-15');
  assertThrows(
    () => p.reschedule(LocalDate.fromString('2026-06-30'), today),
    InvalidValue,
    'temporada',
  );
  assertThrows(() => p.reschedule(LocalDate.fromString('2026-10-08'), today), InvalidValue);

  p.correctTotal(Money.cents(4000), 'Septiembre completo');
  assertEquals(p.total.cents, 4000);
  assertEquals(p.lines.at(-1)?.label, 'Corrección: Septiembre completo');
  assertEquals(p.lines.at(-1)?.amount.cents, 2000);
  assert(p.lines.reduce((sum, l) => sum.plus(l.amount), Money.zero()).equals(p.total));
  assertThrows(() => p.correctTotal(Money.cents(-1), 'x'), InvalidValue);
  assertThrows(() => p.correctTotal(Money.cents(3000), '  '), InvalidValue);
});

Deno.test('Payment should number documents per season and issue one invoice with VAT included in the price', () => {
  assertEquals(DocumentNumber.receipt(2026, 42).toString(), 'R-2026-0042');
  assertEquals(DocumentNumber.invoice(2026, 1).toString(), 'F-2026-0001');
  assertEquals(DocumentNumber.fromString('R-2026-0042').sequence, 42);

  const p = payment(Money.cents(12100));
  const customer = new InvoiceCustomer('Rocío Herrera', '12345678Z', 'Calle Elvira 1, Granada');
  const invoice = p.issueInvoice(
    DocumentNumber.invoice(2026, 1),
    customer,
    21,
    LocalDate.fromString('2026-10-03'),
  );
  assertEquals(invoice.base.cents, 10000);
  assertEquals(invoice.vat.cents, 2100);
  assertEquals(invoice.total.cents, 12100);
  assertEquals(p.invoice(), invoice);
  assertThrows(
    () =>
      p.issueInvoice(
        DocumentNumber.invoice(2026, 2),
        customer,
        21,
        LocalDate.fromString('2026-10-03'),
      ),
    InvoiceAlreadyIssued,
  );

  const rounded = payment(Money.cents(4500)).issueInvoice(
    DocumentNumber.invoice(2026, 1),
    new InvoiceCustomer('A', 'B', 'C'),
    21,
    LocalDate.fromString('2026-10-03'),
  );
  assertEquals(rounded.base.cents, 3719);
  assertEquals(rounded.vat.cents, 781);
  assertThrows(() => new InvoiceCustomer('', '12345678Z', 'Granada'), InvalidValue);
});

Deno.test('FeeCalculator should redeem points on a single month and take fixed special discounts', () => {
  // 2 h semanales = 45 €/mes; 3 meses con 10 % de pago adelantado = 121,50 €; 5 puntos = 5 % de UN mes = 2,25 €.
  const withPoints = quote(new FeeProfile(2, [], false), 3, null, new PointsRedemption(5));
  assertEquals(withPoints.total.cents, 12150 - 225);
  assertEquals(withPoints.lines.at(-1)?.label, 'Canje de 5 puntos (5 % de un mes) −2,25 €');
  assertEquals(withPoints.lines.at(-1)?.amount.cents, -225);
  assert(
    withPoints.lines.reduce((sum, l) => sum.plus(l.amount), Money.zero()).equals(withPoints.total),
  );

  // Seis meses: los puntos siguen valiendo lo de un solo mes.
  const six = quote(new FeeProfile(2, [], false), 6, null, new PointsRedemption(5));
  assertEquals(six.lines.at(-1)?.amount.cents, -225);

  const fixed = quote(
    new FeeProfile(2, [], false),
    1,
    new SpecialDiscount(Money.cents(1000), 'Beca'),
  );
  assertEquals(fixed.total.cents, 3500);
  assertEquals(fixed.lines.at(-1)?.label, 'Beca −10 €');

  // Nunca por debajo de 0 €.
  const huge = quote(
    new FeeProfile(1, [], false),
    1,
    new SpecialDiscount(Money.cents(99900), 'Regalo'),
  );
  assertEquals(huge.total.cents, 0);
  assertEquals(huge.lines.at(-1)?.amount.cents, -3500);

  // La cuota de socio solo admite el descuento especial.
  const membership = new FeeCalculator().quoteMembership(
    'Cuota de socio 2026/27',
    Money.cents(5000),
    new SpecialDiscount(50, 'Media beca'),
  );
  assertEquals(membership.total.cents, 2500);

  // Solo de 5 en 5: con 3 puntos no hay descuento.
  assertThrows(() => new PointsRedemption(3), InvalidPaymentRequest);
  assertThrows(() => new PointsRedemption(6), InvalidPaymentRequest);
  assertThrows(() => new PointsRedemption(0), InvalidPaymentRequest);

  // Pago adelantado: 20 % al pagar todo el año (9 o 10 meses); 7 u 8 meses siguen al 15 %.
  const tariff = BillingSettings.defaults().tariff;
  assertEquals([1, 3, 6, 7, 8, 9, 10].map((m) => tariff.prepaymentPercent(m)), [
    0,
    10,
    15,
    15,
    15,
    20,
    20,
  ]);
  assertThrows(() => new SpecialDiscount(Money.zero(), 'Nada'), InvalidValue);
});

Deno.test('Charge should add the prepayment discount to the family one over the base fee', () => {
  // Base de 40 €, 10 % familiar: cuota de 36 €. Con un 20 % por todo el año, 40 € − 30 % = 28 € (no 36 € − 20 %).
  const fee = Money.cents(3600);
  const paid = Charge.create(
    ChargeId.generate(),
    StudentRef.generate(),
    'monthly',
    YearMonth.fromString('2026-10'),
    fee,
  );
  paid.applyPrepayment(20, 10);
  assertEquals([paid.amount.cents, paid.discountPercent()], [2800, 20]);
  paid.reprice(fee, 10);
  assertEquals(paid.amount.cents, 2800);

  const set = Charge.create(
    ChargeId.generate(),
    StudentRef.generate(),
    'monthly',
    YearMonth.fromString('2026-11'),
    fee,
  );
  set.setDiscount(20, fee, 10);
  assertEquals(set.amount.cents, 2800);

  const imported = Charge.create(
    ChargeId.generate(),
    StudentRef.generate(),
    'monthly',
    YearMonth.fromString('2026-12'),
    Money.cents(2800),
  );
  imported.inferDiscount(fee, [10, 15, 20], 10);
  assertEquals([imported.amount.cents, imported.discountPercent()], [2800, 20]);
});
