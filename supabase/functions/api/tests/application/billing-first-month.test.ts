import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import { lateJoinMonth, StudentAccount, StudentRef } from '../../src/domain/billing/mod.ts';
import {
  AdjustCharge,
  ChooseFirstMonthFee,
  DropChargesBeforeJoining,
  type FirstMonthChoice,
  GenerateMonthlyCharges,
  QuotePayment,
  RegisterPayment,
} from '../../src/application/billing/mod.ts';
import { BillingFixture } from '../support/billing.ts';

const LATE = '2026-11-20T10:00:00+01:00';

function generate(fx: BillingFixture, month: string): Promise<void> {
  return new GenerateMonthlyCharges(fx, fx, fx, fx, fx.clock, fx.transactions, fx.locks).execute(
    month,
  );
}

function choose(
  fx: BillingFixture,
  id: string,
  joinedOn: string,
  choice: FirstMonthChoice,
): Promise<void> {
  return new ChooseFirstMonthFee(fx, fx, fx.clock).execute(id, joinedOn, choice);
}

function quotes(fx: BillingFixture): QuotePayment {
  return new QuotePayment(fx, fx, fx, fx, fx.clock, fx);
}

const monthly = (fx: BillingFixture, id: string, period: string) =>
  fx.chargeFor(StudentRef.fromString(id), 'monthly', YearMonth.fromString(period));

const part = (cents: number): FirstMonthChoice => ({ kind: 'part', amount: Money.cents(cents) });

Deno.test('lateJoinMonth should ask about the current month only from the 16th', () => {
  const today = LocalDate.fromString('2026-11-20');
  assertEquals(lateJoinMonth(LocalDate.fromString('2026-11-16'), today)?.toString(), '2026-11');
  assertEquals(lateJoinMonth(LocalDate.fromString('2026-11-15'), today), null);
  // Un alta con fecha de un mes anterior no tiene cuota de ese mes que decidir.
  assertEquals(lateJoinMonth(LocalDate.fromString('2026-10-25'), today), null);
  // En julio y agosto no hay cuotas.
  assertEquals(
    lateJoinMonth(LocalDate.fromString('2027-07-20'), LocalDate.fromString('2027-07-20')),
    null,
  );
});

Deno.test('StudentAccount should not bill the months left out', () => {
  const account = StudentAccount.open(StudentRef.generate());
  account.skipMonth(YearMonth.fromString('2026-11'));
  account.skipMonth(YearMonth.fromString('2026-11'));
  assertFalse(account.bills(YearMonth.fromString('2026-11')));
  assert(account.bills(YearMonth.fromString('2026-12')));
  assertEquals(account.unbilledMonths().map((m) => m.toString()), ['2026-11']);
});

Deno.test('ChooseFirstMonthFee should keep the whole fee of a late join when it is paid in full', async () => {
  const fx = new BillingFixture(LATE);
  const id = fx.student();
  await generate(fx, '2026-11');
  await choose(fx, id, '2026-11-20', { kind: 'full' });
  const charge = await monthly(fx, id, '2026-11');
  assertEquals(charge?.amount.cents, 4500);
  assertFalse(charge?.isManual());
});

Deno.test('ChooseFirstMonthFee should fix the first month at the part agreed, with its reason', async () => {
  const fx = new BillingFixture(LATE);
  const id = fx.student();
  await generate(fx, '2026-11');
  await choose(fx, id, '2026-11-20', part(2000));
  const charge = await monthly(fx, id, '2026-11');
  assertEquals(charge?.amount.cents, 2000);
  assert(charge?.isManual());
  assertEquals(charge?.note(), 'Alta el 20/11: parte del mes');
});

Deno.test('ChooseFirstMonthFee should leave the month without any fee when nothing is charged', async () => {
  const fx = new BillingFixture(LATE);
  const id = fx.student();
  await generate(fx, '2026-11');
  await choose(fx, id, '2026-11-20', { kind: 'none' });
  assertEquals(await monthly(fx, id, '2026-11'), null);

  // La tarea de la noche no la vuelve a crear y el primer cobro es el del mes siguiente.
  await generate(fx, '2026-11');
  assertEquals(await monthly(fx, id, '2026-11'), null);
  const quote = await quotes(fx).execute({
    studentId: id,
    kind: 'monthly',
    months: 1,
    method: 'cash',
    date: '2026-11-20',
    specialPercent: null,
    specialAmountCents: null,
    specialConcept: null,
    redeemPoints: 0,
  });
  assertEquals(quote.periods.map((p) => p.toString()), ['2026-12']);
  assertEquals((await quotes(fx).months(id)).remaining, 7);
  // Tampoco sale como prevista en los meses futuros que sí paga.
  const expected = await new GenerateMonthlyCharges(
    fx,
    fx,
    fx,
    fx,
    fx.clock,
    fx.transactions,
    fx.locks,
  ).expected('2026-12');
  assertEquals(expected.length, 1);
});

Deno.test('AdjustCharge for this and the following months should not create a month left without fee', async () => {
  const fx = new BillingFixture(LATE);
  const id = fx.student();
  await generate(fx, '2026-11');
  await choose(fx, id, '2026-11-20', { kind: 'none' });
  await new AdjustCharge(fx, fx, fx).execute(id, '2026-10', 3000, 'Beca', 'rest');
  assertEquals(await monthly(fx, id, '2026-11'), null);
  assertEquals((await monthly(fx, id, '2026-12'))?.amount.cents, 3000);
});

Deno.test('ChooseFirstMonthFee should only accept a choice for a late join of the current month', async () => {
  const fx = new BillingFixture(LATE);
  const id = fx.student();
  await generate(fx, '2026-11');
  // Del 1 al 15 (o con un alta de un mes anterior) se cobra el mes entero, sin elegir.
  await choose(fx, id, '2026-11-15', { kind: 'full' });
  await assertRejects(() => choose(fx, id, '2026-11-15', part(2000)), InvalidValue);
  await assertRejects(() => choose(fx, id, '2026-10-25', { kind: 'none' }), InvalidValue);
  assertEquals((await monthly(fx, id, '2026-11'))?.amount.cents, 4500);
});

Deno.test('ChooseFirstMonthFee should refuse a part that is not less than the fee or not above 0 €', async () => {
  const fx = new BillingFixture(LATE);
  const id = fx.student();
  await generate(fx, '2026-11');
  await assertRejects(() => choose(fx, id, '2026-11-20', part(0)), InvalidValue);
  await assertRejects(() => choose(fx, id, '2026-11-20', part(4500)), InvalidValue);
  // Sin clases no hay cuota de la que pagar una parte.
  const member = fx.student({ regularHours: 0 });
  await generate(fx, '2026-11');
  await assertRejects(() => choose(fx, member, '2026-11-20', part(1000)), InvalidValue);
});

Deno.test('DropChargesBeforeJoining should delete the fees before the new join month and move their payments', async () => {
  const fx = new BillingFixture('2026-11-01T10:00:00+01:00');
  const id = fx.student({ regularHours: 1 });
  await generate(fx, '2026-09');
  await generate(fx, '2026-10');
  await new RegisterPayment(quotes(fx), fx, fx, fx, fx.transactions, fx, fx.locks, fx).execute({
    studentId: id,
    kind: 'monthly',
    months: 1,
    method: 'card',
    date: '2026-10-14',
    specialPercent: null,
    specialAmountCents: null,
    specialConcept: null,
    redeemPoints: 0,
  });
  const [paid] = await fx.paymentsFor(StudentRef.fromString(id), 'monthly');
  assertEquals(paid?.periods.map((p) => p.toString()), ['2026-09']);

  await new DropChargesBeforeJoining(fx, fx).execute(
    id,
    LocalDate.fromString('2026-09-01'),
    LocalDate.fromString('2026-10-01'),
  );

  assertEquals(await monthly(fx, id, '2026-09'), null);
  assertEquals((await monthly(fx, id, '2026-10'))?.amount.cents, 3500);
  const [moved] = await fx.paymentsFor(StudentRef.fromString(id), 'monthly');
  assertEquals(moved?.periods.map((p) => p.toString()), ['2026-10']);
  assertEquals(moved?.concept, 'Octubre 2026');
  assertEquals(moved?.total.cents, 3500);
});

Deno.test('DropChargesBeforeJoining should keep everything when the join date stays in the same month or moves earlier', async () => {
  const fx = new BillingFixture('2026-11-01T10:00:00+01:00');
  const id = fx.student();
  await generate(fx, '2026-10');
  await new DropChargesBeforeJoining(fx, fx).execute(
    id,
    LocalDate.fromString('2026-10-01'),
    LocalDate.fromString('2026-10-20'),
  );
  await new DropChargesBeforeJoining(fx, fx).execute(
    id,
    LocalDate.fromString('2026-10-20'),
    LocalDate.fromString('2026-09-01'),
  );
  assertEquals((await monthly(fx, id, '2026-10'))?.amount.cents, 4500);
});
