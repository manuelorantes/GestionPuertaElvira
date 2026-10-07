import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  Charge,
  ChargeId,
  InvalidPaymentRequest,
  InvoiceAlreadyIssued,
  PaymentId,
  StudentRef,
} from '../../src/domain/billing/mod.ts';
import {
  AdjustPoints,
  GenerateMonthlyCharges,
  ImportPayment,
  IssueInvoice,
  MarkReminded,
  type PaymentQuote,
  QuotePayment,
  RegisterPayment,
  type SettingsInput,
  UpdateBillingSettings,
  UpdateStudentAccount,
} from '../../src/application/billing/mod.ts';
import { PeriodClosed } from '../../src/application/common/mod.ts';
import { BillingFixture } from '../support/billing.ts';

function generate(fx: BillingFixture, month: string): Promise<void> {
  return new GenerateMonthlyCharges(fx, fx, fx, fx, fx.clock, fx.transactions, fx.locks).execute(
    month,
  );
}

function quotes(fx: BillingFixture): QuotePayment {
  return new QuotePayment(fx, fx, fx, fx, fx.clock);
}

function quote(fx: BillingFixture, id: string, months: number): Promise<PaymentQuote> {
  return quotes(fx).execute({
    studentId: id,
    kind: 'monthly',
    months,
    method: 'cash',
    date: '2026-10-02',
    specialPercent: null,
    specialAmountCents: null,
    specialConcept: null,
    redeemPoints: 0,
  });
}

function register(
  fx: BillingFixture,
  id: string,
  months: number,
  kind = 'monthly',
): Promise<string> {
  return new RegisterPayment(quotes(fx), fx, fx, fx, fx.transactions, fx, fx.locks, fx)
    .execute({
      studentId: id,
      kind,
      months,
      method: 'transfer',
      date: '2026-10-02',
      specialPercent: null,
      specialAmountCents: null,
      specialConcept: null,
      redeemPoints: 0,
    });
}

const charge = (fx: BillingFixture, id: string, kind: 'monthly' | 'membership', period: string) =>
  fx.chargeFor(StudentRef.fromString(id), kind, YearMonth.fromString(period));

Deno.test('GenerateMonthlyCharges should create one charge per active student and month, idempotently', async () => {
  const fx = new BillingFixture();
  const martina = fx.student({ regularHours: 2, siblings: true });
  fx.student({
    regularHours: 0,
    privateLessons: [{ groupName: 'Particular', teacherId: 't1', weeklyHours: 1.5 }],
  });
  await generate(fx, '2026-10');
  await generate(fx, '2026-10');
  assertEquals(fx.charges.size, 2);
  assertEquals((await charge(fx, martina, 'monthly', '2026-10'))?.amount.cents, 4050);
});

Deno.test('GenerateMonthlyCharges should charge members their season fee once and skip summer and future months', async () => {
  const fx = new BillingFixture();
  const id = fx.student();
  await new UpdateStudentAccount(fx).execute(id, 'monthly', true, null);
  await generate(fx, '2026-09');
  await generate(fx, '2026-10');
  assertEquals((await charge(fx, id, 'membership', '2026-09'))?.amount.cents, 5000);
  assertEquals(fx.charges.size, 3);
  const summer = new BillingFixture();
  summer.student();
  await generate(summer, '2027-07');
  await generate(summer, '2026-11');
  assertEquals(summer.charges.size, 0);
});

Deno.test('QuotePayment should use the agreed private rate, quote without saving and suggest months from the preference', async () => {
  const fx = new BillingFixture();
  const privateStudent = fx.student({
    regularHours: 0,
    privateLessons: [{ groupName: 'Particular', teacherId: 't1', weeklyHours: 1.5 }],
  });
  await new UpdateStudentAccount(fx).execute(privateStudent, 'monthly', false, '35');
  assertEquals((await quote(fx, privateStudent, 1)).quote.total.cents, 21000);

  const id = fx.student({ regularHours: 3, siblings: true });
  await new UpdateStudentAccount(fx).execute(id, 'three_months', false, null);
  assertEquals(await quotes(fx).months(id), { suggested: 3, remaining: 9 }, 'de octubre a junio');
  assertEquals((await quote(fx, id, 3)).quote.total.cents, 13200);
  assertEquals(fx.payments.size, 0);
});

Deno.test('QuotePayment should give the 20 % only when paying the whole year that is left (9 or 10 months)', async () => {
  const fx = new BillingFixture();
  const id = fx.student({ regularHours: 2 });
  await generate(fx, '2026-09');
  // Quedan septiembre (pendiente) y octubre a junio: 10 meses.
  assertEquals((await quotes(fx).months(id)).remaining, 10);
  const whole = await quote(fx, id, 10);
  assertEquals(whole.quote.discountPercent, 20);
  assertEquals(whole.quote.lines.at(-1)?.label, 'Pago de todo el año −20 %');
  await assertRejects(() => quote(fx, id, 9), InvalidPaymentRequest, 'todo el año');
  assertEquals((await quote(fx, id, 8)).quote.discountPercent, 15);
});

Deno.test('RegisterPayment should pay the oldest pending charges first and create future ones', async () => {
  const fx = new BillingFixture();
  const id = fx.student({ regularHours: 2 });
  await generate(fx, '2026-09');
  await generate(fx, '2026-10');
  const paymentId = await register(fx, id, 3);
  const payment = await fx.payment(PaymentId.fromString(paymentId));
  assertEquals(payment?.periods.map((p) => p.toString()), ['2026-09', '2026-10', '2026-11']);
  assertEquals(payment?.receipt.toString(), 'R-2026-0001');
  assertEquals(payment?.concept, 'Septiembre – noviembre 2026');
  assertEquals(payment?.total.cents, 12150);
  for (const month of ['2026-09', '2026-10', '2026-11']) {
    assert((await charge(fx, id, 'monthly', month))?.isPaid());
  }
  assert(fx.locks.keys.includes(`billing:student:${id}`));
  assertEquals(
    (await fx.payment(PaymentId.fromString(await register(fx, id, 1))))?.receipt.toString(),
    'R-2026-0002',
  );
});

Deno.test('QuotePayment should fill gaps, charge pending months at their stored amount and collect the debt of withdrawn students', async () => {
  const fx = new BillingFixture();
  const id = fx.student({ regularHours: 2 });
  await generate(fx, '2026-10');
  const december = Charge.create(
    ChargeId.generate(),
    StudentRef.fromString(id),
    'monthly',
    YearMonth.fromString('2026-12'),
    Money.euros(45),
  );
  december.payWith(PaymentId.generate());
  await fx.saveCharge(december);
  const paymentId = await register(fx, id, 3);
  assertEquals(
    (await fx.payment(PaymentId.fromString(paymentId)))?.periods.map((p) => p.toString()),
    ['2026-10', '2026-11', '2027-01'],
  );

  const other = new BillingFixture();
  const second = other.student({ regularHours: 2 });
  await generate(other, '2026-10');
  other.changeHours(second, 3);
  assertEquals((await quote(other, second, 1)).quote.total.cents, 4500, 'octubre se generó a 45 €');
  assertEquals(
    (await quote(other, second, 2)).quote.gross.cents,
    4500 + 5500,
    'noviembre ya va con el tramo nuevo',
  );
  other.changeHours(second, 0);
  assertEquals((await quote(other, second, 1)).quote.total.cents, 4500);
  await assertRejects(
    () => quote(other, second, 2),
    InvalidPaymentRequest,
    'No hay nada pendiente que cobrar con esos datos.',
  );
});

Deno.test('RegisterPayment should register the membership fee without discounts', async () => {
  const fx = new BillingFixture();
  const id = fx.student({ siblings: true });
  await new UpdateStudentAccount(fx).execute(id, 'monthly', true, null);
  await generate(fx, '2026-10');
  const payment = await fx.payment(PaymentId.fromString(await register(fx, id, 1, 'membership')));
  assertEquals(payment?.total.cents, 5000);
  assertEquals(payment?.concept, 'Cuota de socio 2026/27');
  assert((await charge(fx, id, 'membership', '2026-09'))?.isPaid());
});

Deno.test('IssueInvoice should issue one invoice per payment with its own numbering', async () => {
  const fx = new BillingFixture();
  const id = fx.student();
  const paymentId = await register(fx, id, 1);
  const issue = new IssueInvoice(fx, fx, fx.transactions, fx.clock, fx.locks);
  await issue.execute(paymentId, 'Rocío Herrera', '12345678Z', 'Calle Elvira 1, Granada');
  assertEquals(
    (await fx.payment(PaymentId.fromString(paymentId)))?.invoice()?.number.toString(),
    'F-2026-0001',
  );
  await assertRejects(
    () => issue.execute(paymentId, 'Rocío Herrera', '12345678Z', 'Calle Elvira 1, Granada'),
    InvoiceAlreadyIssued,
  );
});

Deno.test('MarkReminded and AdjustPoints should update the charge and the account', async () => {
  const fx = new BillingFixture();
  const id = fx.student();
  await generate(fx, '2026-09');
  const first = [...fx.charges.values()][0] as Charge;
  await new MarkReminded(fx, fx.clock).execute(first.id.value);
  await new AdjustPoints(fx).execute(id, 2);
  assert(first.remindedOn() !== null);
  assertEquals((await fx.account(StudentRef.fromString(id)))?.points(), 2);
});

Deno.test('ImportPayment should record the exact amount of the sheet, skip paid months and respect closed seasons', async () => {
  const fx = new BillingFixture('2026-10-05T10:00:00+02:00');
  const id = fx.student({ regularHours: 2 });
  const importer = new ImportPayment(fx, fx, fx, fx);
  const paymentId = await importer.execute(
    id,
    'monthly',
    YearMonth.fromString('2026-09'),
    Money.cents(2000),
    LocalDate.fromString('2026-09-03'),
  );
  const payment = await fx.payment(PaymentId.fromString(paymentId ?? ''));
  assertEquals(payment?.total.cents, 2000);
  assertEquals(payment?.receipt.toString(), 'R-2026-0001');
  assertEquals(payment?.concept, 'Septiembre 2026');
  const september = await charge(fx, id, 'monthly', '2026-09');
  assertEquals(september?.amount.cents, 2000);
  assert(september?.isPaid());

  await generate(fx, '2026-10');
  assert(
    (await importer.execute(
      id,
      'monthly',
      YearMonth.fromString('2026-10'),
      Money.cents(4500),
      LocalDate.fromString('2026-10-03'),
    )) !== null,
  );
  assertEquals(
    await importer.execute(
      id,
      'monthly',
      YearMonth.fromString('2026-10'),
      Money.cents(4500),
      LocalDate.fromString('2026-10-04'),
    ),
    null,
  );
  assertEquals(fx.payments.size, 2);

  await importer.execute(
    id,
    'membership',
    YearMonth.fromString('2026-09'),
    Money.cents(5000),
    LocalDate.fromString('2026-09-03'),
  );
  assertEquals([...fx.payments.values()][2]?.concept, 'Cuota de socio 2026/27');
  fx.closedDates = ['2026-09-03'];
  await assertRejects(
    () =>
      importer.execute(
        id,
        'monthly',
        YearMonth.fromString('2026-11'),
        Money.cents(2000),
        LocalDate.fromString('2026-09-03'),
      ),
    PeriodClosed,
  );
});

Deno.test('UpdateBillingSettings should replace prices, discounts, private rates and fiscal data, rejecting invalid values', async () => {
  const fx = new BillingFixture();
  const input = (overrides: Partial<SettingsInput> = {}): SettingsInput => ({
    threeHours: '55',
    twoHours: '45',
    hourAndHalf: '40',
    oneHour: '35',
    membershipFee: '50',
    familyPercent: 10,
    threeMonthsPercent: 10,
    sixMonthsPercent: 15,
    seasonPercent: 20,
    defaultPrivateRate: '30',
    privateRates: {},
    clubName: 'Club Ajedrez Puerta Elvira',
    clubTaxId: 'g18999999',
    clubAddress: 'Granada',
    ...overrides,
  });
  await new UpdateBillingSettings(fx).execute(
    input({
      threeHours: '60',
      familyPercent: 12,
      privateRates: { '0190a0a0-0000-7000-8000-000000000001': '32,50' },
    }),
  );
  assertEquals(fx.settings.tariff.threeHours.cents, 6000);
  assertEquals(fx.settings.tariff.familyPercent, 12);
  assertEquals(fx.settings.privateRateFor('0190a0a0-0000-7000-8000-000000000001').cents, 3250);
  assertEquals(fx.settings.club.taxId, 'G18999999');
  await assertRejects(
    () => new UpdateBillingSettings(fx).execute(input({ seasonPercent: 120 })),
    InvalidValue,
  );
});

Deno.test('RegisterPayment should spend the redeemed points and make a member of whoever pays the fee', async () => {
  const fx = new BillingFixture();
  const id = fx.student({ siblings: false });
  await new AdjustPoints(fx).execute(id, 6);
  await generate(fx, '2026-10');
  const request = {
    studentId: id,
    kind: 'monthly',
    months: 1,
    method: 'cash',
    date: '2026-10-02',
    specialPercent: null,
    specialAmountCents: null,
    specialConcept: null,
    redeemPoints: 5,
  };
  const paymentId = await new RegisterPayment(
    quotes(fx),
    fx,
    fx,
    fx,
    fx.transactions,
    fx,
    fx.locks,
    fx,
  )
    .execute(request);
  const payment = await fx.payment(PaymentId.fromString(paymentId));
  assertEquals(payment?.lines.at(-1)?.label, 'Canje de 5 puntos (5 % de un mes) −2,25 €');
  assertEquals((await fx.account(StudentRef.fromString(id)))?.points(), 1);
  await assertRejects(
    () => quotes(fx).execute({ ...request, redeemPoints: 5 }),
    InvalidPaymentRequest,
    'el alumno tiene 1',
  );
  await assertRejects(
    () => quotes(fx).execute({ ...request, kind: 'membership', redeemPoints: 5 }),
    InvalidPaymentRequest,
    'solo se canjean en las cuotas mensuales',
  );

  assertFalse((await fx.account(StudentRef.fromString(id)))?.isMember() ?? false);
  await register(fx, id, 1, 'membership');
  assert((await fx.account(StudentRef.fromString(id)))?.isMember());
});
