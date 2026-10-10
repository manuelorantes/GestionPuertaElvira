import { assertEquals } from '@std/assert';

import { LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  Charge,
  ChargeId,
  DocumentNumber,
  Payment,
  PaymentId,
  QuoteLine,
  StudentRef,
} from '../../src/domain/billing/mod.ts';
import {
  CHAINED_DISCOUNT_EXTRA_CONCEPT,
  UnchainDiscounts,
} from '../../src/application/billing/mod.ts';
import { BillingFixture } from '../support/billing.ts';

/** Irene: 2 h con familia (45 € − 10 % = 40,50 €), importada con 32,40 € al mes (40,50 € − 20 %). */
function setUp() {
  const fx = new BillingFixture('2026-10-11T10:00:00+02:00');
  const irene = fx.student({ name: 'Irene Fernández Aguilera', regularHours: 2, siblings: true });
  const ref = StudentRef.fromString(irene);
  const months = ['2026-09', '2026-10', '2026-11'];
  let sequence = 0;
  for (const month of months) {
    const charge = Charge.create(
      ChargeId.generate(),
      ref,
      'monthly',
      YearMonth.fromString(month),
      Money.cents(3240),
    );
    // Septiembre y octubre están cobradas con un recibo cada una; noviembre, pendiente.
    if (month !== '2026-11') {
      const payment = Payment.register({
        id: PaymentId.generate(),
        student: ref,
        paidOn: LocalDate.fromString('2026-09-03'),
        method: 'transfer',
        receipt: DocumentNumber.receipt(2026, ++sequence),
        kind: 'monthly',
        concept: 'Importado',
        lines: [new QuoteLine('Importado', Money.cents(3240))],
        total: Money.cents(3240),
        periods: [YearMonth.fromString(month)],
      });
      fx.payments.set(payment.id.value, payment);
      charge.coveredBy(payment.id);
    }
    fx.charges.set(charge.id.value, charge);
  }
  fx.sequences.set('R2026', sequence);
  const unchain = new UnchainDiscounts(fx, fx, fx, fx, fx, fx, fx.clock, fx.locks);
  return { fx, irene, ref, months, unchain };
}

Deno.test('UnchainDiscounts should add the discounts up, correct each receipt and register the extra apart', async () => {
  const { fx, irene, months, unchain } = setUp();
  const extra = await unchain.execute(irene, months, 20);
  assertEquals(extra, Money.cents(180));

  const charges = [...fx.charges.values()].sort((a, b) =>
    a.period.toString().localeCompare(b.period.toString())
  );
  assertEquals(charges.map((c) => [c.period.toString(), c.amount.cents, c.discountPercent()]), [
    ['2026-09', 3150, 20],
    ['2026-10', 3150, 20],
    ['2026-11', 3150, 20],
  ]);

  const payments = [...fx.payments.values()];
  const corrected = payments.filter((p) => p.concept === 'Importado');
  assertEquals(corrected.map((p) => p.total.cents), [3150, 3150]);
  assertEquals(corrected.map((p) => p.credit.cents), [3150, 3150]);
  assertEquals(
    corrected[0]?.lines.map((l) => [l.label, l.amount.cents]),
    [['Importado', 3240], ['Corrección: Error en el cálculo de varios descuentos', -90]],
  );
  const separated = payments.find((p) => p.concept === CHAINED_DISCOUNT_EXTRA_CONCEPT);
  assertEquals(separated?.total.cents, 180);
  assertEquals(separated?.credit.cents, 180);
  assertEquals(separated?.kind, 'monthly');
  assertEquals(separated?.paidOn.toString(), '2026-09-03');
  assertEquals(separated?.method, 'transfer');
  assertEquals(separated?.receipt.toString(), 'R-2026-0003');
  assertEquals(separated?.periods.map((m) => m.toString()), months);
  assertEquals(fx.locks.keys, [`billing:student:${irene}`]);
});

Deno.test('UnchainDiscounts should register nothing apart when no charge was paid', async () => {
  const { fx, irene, unchain } = setUp();
  const extra = await unchain.execute(irene, ['2026-11'], 20);
  assertEquals(extra, Money.zero());
  assertEquals([...fx.payments.values()].length, 2);
  const november = [...fx.charges.values()].find((c) => c.period.toString() === '2026-11');
  assertEquals(november?.amount.cents, 3150);
});
