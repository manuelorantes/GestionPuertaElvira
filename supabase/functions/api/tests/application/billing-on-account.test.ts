import { assert, assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, Money, YearMonth } from '../../src/domain/common/mod.ts';
import { Charge, ChargeId, PaymentId, StudentRef } from '../../src/domain/billing/mod.ts';
import {
  AddOnAccountMoney,
  BillingStudentNotFound,
  GenerateMonthlyCharges,
  pendingCharges,
  UpdateStudentAccount,
} from '../../src/application/billing/mod.ts';
import { PeriodClosed } from '../../src/application/common/mod.ts';
import { BillingFixture } from '../support/billing.ts';

function generate(fx: BillingFixture, month: string): Promise<void> {
  return new GenerateMonthlyCharges(fx, fx, fx, fx, fx.clock, fx.transactions, fx.locks).execute(
    month,
  );
}

function onAccount(fx: BillingFixture): AddOnAccountMoney {
  return new AddOnAccountMoney(fx, fx, fx, fx, fx.transactions, fx, fx.locks, fx);
}

const request = (studentIds: string[], amountCents: number) => ({
  studentIds,
  amountCents,
  method: 'cash',
  date: '2026-10-02',
});

async function pending(fx: BillingFixture, id: string, kind: 'monthly' | 'membership') {
  return (await pendingCharges(fx, StudentRef.fromString(id), kind)).reduce(
    (sum, p) => sum + p.pending.cents,
    0,
  );
}

async function receipts(fx: BillingFixture, ids: string[]) {
  const payments = await Promise.all(ids.map((id) => fx.payment(PaymentId.fromString(id))));
  return payments.map((p) => [p?.student.value, p?.kind, p?.concept, p?.total.cents, p?.method]);
}

Deno.test('AddOnAccountMoney should pay what each student owes with one on-account receipt each', async () => {
  const fx = new BillingFixture();
  const ana = fx.student({ name: 'Ana', regularHours: 1.5 });
  const luis = fx.student({ name: 'Luis', regularHours: 3 });
  await generate(fx, '2026-10');

  const result = await onAccount(fx).execute(request([ana, luis], 9500));

  assertEquals(await receipts(fx, result.paymentIds), [
    [ana, 'monthly', 'Pago a cuenta', 4000, 'cash'],
    [luis, 'monthly', 'Pago a cuenta', 5500, 'cash'],
  ]);
  assertEquals(await pending(fx, ana, 'monthly'), 0);
  assertEquals(await pending(fx, luis, 'monthly'), 0);
});

Deno.test('AddOnAccountMoney should pay the membership fee first and leave the extra as credit, equally', async () => {
  const fx = new BillingFixture();
  const ana = fx.student({ name: 'Ana', regularHours: 1.5 });
  const luis = fx.student({ name: 'Luis', regularHours: 1.5 });
  await new UpdateStudentAccount(fx).execute(ana, 'monthly', true, null);
  await generate(fx, '2026-10');

  const result = await onAccount(fx).execute(request([ana, luis], 15000));

  // Ana debe 50 € de socio y 40 € de octubre; Luis, 40 €. Sobran 20 €: 10 € a cada uno.
  assertEquals(result.shares, [
    { studentId: ana, name: 'Ana', owedCents: 9000, membershipCents: 5000, monthlyCents: 5000 },
    { studentId: luis, name: 'Luis', owedCents: 4000, membershipCents: 0, monthlyCents: 5000 },
  ]);
  assertEquals(await receipts(fx, result.paymentIds), [
    [ana, 'membership', 'Pago a cuenta · cuota de socio', 5000, 'cash'],
    [ana, 'monthly', 'Pago a cuenta', 5000, 'cash'],
    [luis, 'monthly', 'Pago a cuenta', 5000, 'cash'],
  ]);
  assertEquals(await pending(fx, ana, 'membership'), 0);
  assert((await fx.account(StudentRef.fromString(ana)))?.isMember());
  // Los 10 € de más cubren la cuota de noviembre en cuanto exista.
  fx.clock.advanceSeconds(31 * 24 * 3600);
  await generate(fx, '2026-11');
  assertEquals(await pending(fx, luis, 'monthly'), 3000);
});

Deno.test('AddOnAccountMoney should split money that falls short by what each one owes and only quote when asked', async () => {
  const fx = new BillingFixture();
  const ana = fx.student({ name: 'Ana', regularHours: 1.5 });
  const luis = fx.student({ name: 'Luis', regularHours: 1.5 });
  await new UpdateStudentAccount(fx).execute(ana, 'monthly', true, null);
  await generate(fx, '2026-10');

  // Ana debe 90 € y Luis 40 €: 65 € son la mitad de lo que deben, 45 € y 20 €.
  const quote = await onAccount(fx).quote(request([ana, luis, ana], 6500));
  assertEquals(quote.map((s) => [s.name, s.membershipCents, s.monthlyCents]), [
    ['Ana', 4500, 0],
    ['Luis', 0, 2000],
  ]);
  assertEquals(fx.payments.size, 0);

  await onAccount(fx).execute(request([ana, luis], 6500));
  assertEquals(await pending(fx, ana, 'membership'), 500);
  assertEquals(await pending(fx, ana, 'monthly'), 4000);
  assertEquals(await pending(fx, luis, 'monthly'), 2000);
  assertEquals((await fx.account(StudentRef.fromString(ana)))?.isMember(), true);
});

Deno.test('AddOnAccountMoney should only count what is due up to the month of the payment', async () => {
  const fx = new BillingFixture();
  const ana = fx.student({ name: 'Ana', regularHours: 1.5 });
  await generate(fx, '2026-10');
  // Una cuota de noviembre ya creada (p. ej. al fijarla a mano) aún no se debe en octubre.
  await fx.saveCharge(
    Charge.create(
      ChargeId.generate(),
      StudentRef.fromString(ana),
      'monthly',
      YearMonth.fromString('2026-11'),
      Money.euros(40),
    ),
  );
  const quote = await onAccount(fx).quote(request([ana], 1000));
  assertEquals(quote[0]?.owedCents, 4000);
});

Deno.test('AddOnAccountMoney should reject unknown students, no students, bad amounts and closed seasons', async () => {
  const fx = new BillingFixture();
  const ana = fx.student();
  await assertRejects(
    () => onAccount(fx).execute(request([StudentRef.generate().value], 1000)),
    BillingStudentNotFound,
  );
  await assertRejects(() => onAccount(fx).execute(request([], 1000)), InvalidValue, 'alumno');
  await assertRejects(() => onAccount(fx).execute(request([ana], 0)), InvalidValue, 'mayor');
  fx.closedDates.push('2026-10-02');
  await assertRejects(() => onAccount(fx).execute(request([ana], 1000)), PeriodClosed);
  assertEquals(fx.payments.size, 0);
});
