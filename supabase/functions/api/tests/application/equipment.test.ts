import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, Money } from '../../src/domain/common/mod.ts';
import { ChargeId, StudentRef } from '../../src/domain/billing/mod.ts';
import { NotEnoughStock, OrderId } from '../../src/domain/equipment/mod.ts';
import {
  ChargeNotFound,
  coveredOf,
  GetStudentAccount,
  pendingCharges,
  QuotePayment,
} from '../../src/application/billing/mod.ts';
import { OrderNotFound, StudentNotFound } from '../../src/application/equipment/mod.ts';
import { EquipmentFixture } from '../support/equipment.ts';

async function setUp() {
  const fx = new EquipmentFixture();
  const student = fx.billing.student();
  const product = await fx.tracksuit();
  const reserve = (
    values: Record<string, string> = { talla: '10' },
    priceCents: number | null = null,
  ) =>
    fx.manageOrders().reserve({
      studentId: student,
      productId: product,
      quantity: 1,
      values,
      note: null,
      priceCents,
    });
  return { fx, student, product, reserve };
}

function orderOf(fx: EquipmentFixture, id: string) {
  const order = fx.orders.get(id);
  if (!order) throw new Error('Sin pedido');
  return order;
}

async function chargeOf(fx: EquipmentFixture, id: string) {
  const charge = await fx.billing.charge(ChargeId.fromString(orderOf(fx, id).charge?.value ?? ''));
  if (!charge) throw new Error('Sin cobro');
  return charge;
}

async function purchase(fx: EquipmentFixture, product: string, quantity: number, talla = '10') {
  return await fx.managePurchases().register({
    productId: product,
    date: '2026-10-05',
    costCents: 3000 * quantity,
    note: null,
    lines: [{ values: { talla }, quantity }],
  });
}

Deno.test('ManageOrders should reserve without a charge and, when ordered, charge the student in Billing', async () => {
  const { fx, student, reserve } = await setUp();
  await assertRejects(
    () =>
      fx.manageOrders().reserve({
        studentId: StudentRef.generate().value,
        productId: fx.products.keys().next().value ?? '',
        quantity: 1,
        values: { talla: '10' },
        note: null,
        priceCents: null,
      }),
    StudentNotFound,
  );
  const id = await reserve({ talla: '10', nombre: 'Pepe' });
  assertEquals(orderOf(fx, id).status, 'reserved');
  assertEquals(fx.billing.charges.size, 0);
  await fx.manageOrders().place(id, 4500);
  const charge = await chargeOf(fx, id);
  assertEquals(charge.kind, 'material');
  assertEquals(charge.amount.cents, 4500);
  assertEquals(charge.concept(), 'Chándal · Talla 10 · Nombre a estampar: Pepe');
  assertEquals(charge.period.toString(), '2026-10');
  assertEquals(
    (await pendingCharges(fx.billing, StudentRef.fromString(student), 'material')).length,
    1,
  );
});

Deno.test('a material payment should cover only its own order and leave monthly fees untouched', async () => {
  const { fx, student, reserve } = await setUp();
  const first = await reserve({ talla: '10' }, 4500);
  const second = await reserve({ talla: '12' }, 2000);
  await fx.pay(student, (await chargeOf(fx, second)).id.value);
  assertEquals((await coveredOf(fx.billing, await chargeOf(fx, second))).cents, 2000);
  assertEquals((await coveredOf(fx.billing, await chargeOf(fx, first))).cents, 0);
  assertEquals(fx.billing.payments.size, 1);
  const payment = [...fx.billing.payments.values()][0];
  assertEquals(payment?.concept, 'Chándal · Talla 12');
  assertEquals(payment?.total.cents, 2000);
  // Ya pagado, no hay nada más que cobrar; un cobro de otro alumno no existe para él.
  const secondCharge = (await chargeOf(fx, second)).id.value;
  const firstCharge = (await chargeOf(fx, first)).id.value;
  await assertRejects(
    () => fx.pay(student, secondCharge),
    Error,
    'No hay nada pendiente',
  );
  const other = fx.billing.student();
  await assertRejects(() => fx.pay(other, firstCharge), ChargeNotFound);

  const view = await new GetStudentAccount(
    fx.billing,
    fx.billing,
    new QuotePayment(fx.billing, fx.billing, fx.billing, fx.billing, fx.billing.clock, fx.billing),
    fx.billing.clock,
    fx.billing,
    fx.billing,
  ).execute(student);
  assertEquals(view.materialCharges, [
    { id: (await chargeOf(fx, first)).id.value, concept: 'Chándal · Talla 10', pendingCents: 4500 },
  ]);
  assertEquals(view.totals.find((t) => t.kind === 'material'), {
    kind: 'material',
    paidCents: 2000,
    pendingCents: 4500,
  });
});

Deno.test('ManageOrders should change the price only while nothing is paid, and keep the concept up to date', async () => {
  const { fx, student, reserve } = await setUp();
  const id = await reserve({ talla: '10' }, 4500);
  await fx.manageOrders().changePrice(id, 4000);
  assertEquals((await chargeOf(fx, id)).amount.cents, 4000);
  await fx.manageOrders().edit(id, { quantity: 2, values: { talla: '8' }, note: 'Para hermanos' });
  assertEquals((await chargeOf(fx, id)).concept(), '2 × Chándal · Talla 8');
  await fx.payPart(student, (await chargeOf(fx, id)).id.value, 1000);
  await assertRejects(() => fx.manageOrders().changePrice(id, 3000), InvalidValue, 'algo cobrado');
});

Deno.test('ManageOrders should cancel only what is pending, refuse a fully paid order, and reactivate it whole', async () => {
  const { fx, student, reserve } = await setUp();
  const id = await reserve({ talla: '10' }, 4500);
  await fx.payPart(student, (await chargeOf(fx, id)).id.value, 2000);
  await fx.manageOrders().cancel(id, false);
  assertEquals(orderOf(fx, id).status, 'cancelled');
  assertEquals((await chargeOf(fx, id)).amount.cents, 2000);
  assertEquals((await chargeOf(fx, id)).cancelledAmount().cents, 2500);
  await fx.manageOrders().reactivate(id);
  assertEquals(orderOf(fx, id).status, 'ordered');
  assertEquals((await chargeOf(fx, id)).amount.cents, 4500);

  const paid = await reserve({ talla: '12' }, 2000);
  await fx.pay(student, (await chargeOf(fx, paid)).id.value);
  await assertRejects(() => fx.manageOrders().cancel(paid, false), InvalidValue, 'pagado entero');
  const reserved = await reserve();
  await fx.manageOrders().cancel(reserved, false);
  assertEquals(orderOf(fx, reserved).status, 'cancelled');
  await assertRejects(
    () => fx.manageOrders().cancel(OrderId.generate().value, false),
    OrderNotFound,
  );
});

Deno.test('ManageOrders should deliver from stock and purchases should never leave less than what was delivered', async () => {
  const { fx, product, reserve } = await setUp();
  const id = await reserve({ talla: '10' }, 4500);
  await assertRejects(() => fx.manageOrders().deliver(id, null), NotEnoughStock);
  const lot = await purchase(fx, product, 1);
  await purchase(fx, product, 3, '8');
  await fx.manageOrders().deliver(id, '2026-10-10');
  assertEquals(orderOf(fx, id).deliveredOn()?.toString(), '2026-10-10');
  const another = await reserve({ talla: '10' }, 4500);
  await assertRejects(() => fx.manageOrders().deliver(another, null), NotEnoughStock);
  await assertRejects(() => fx.managePurchases().delete(lot), InvalidValue, 'Talla 10');
  await fx.managePurchases().update(lot, {
    date: '2026-10-05',
    costCents: 6000,
    note: 'Segundo pedido al proveedor',
    lines: [{ values: { talla: '10' }, quantity: 2 }],
  });
  await fx.manageOrders().deliver(another, null);
  // Cancelado y devuelto al stock, vuelve a quedar una.
  await fx.manageOrders().cancel(another, true);
  const third = await reserve({ talla: '10' }, 4500);
  await fx.manageOrders().deliver(third, null);
});

Deno.test('SaveProduct should keep the options in use and retire a product from new orders', async () => {
  const { fx, product, reserve } = await setUp();
  await reserve({ talla: '10', nombre: 'Pepe' });
  const fields = (options: string[]) => [
    { id: 'talla', name: 'Talla', kind: 'options', options },
    { id: 'numero', name: 'Número', kind: 'text', options: [] },
  ];
  await assertRejects(
    () =>
      fx.saveProducts().update(product, {
        name: 'Chándal',
        priceCents: 4500,
        active: true,
        fields: fields(['8', '12']),
      }),
    InvalidValue,
    '«10»',
  );
  // Quitar el campo de texto (aunque un pedido lo use) sí se puede.
  await fx.saveProducts().update(product, {
    name: 'Chándal',
    priceCents: 5000,
    active: false,
    fields: fields(['10', '14']),
  });
  await assertRejects(() => reserve({ talla: '14' }), InvalidValue, 'ya no se ofrece');
  assertEquals(fx.products.get(product)?.price.equals(Money.euros(50)), true);
});

Deno.test('ManageOrders should reserve with the size still to choose and ask for it before ordering', async () => {
  const { fx, reserve } = await setUp();
  const id = await reserve({ nombre: 'Pepe' });
  assertEquals(orderOf(fx, id).selection.variantKey, '');
  await assertRejects(() => fx.manageOrders().place(id, 4500), InvalidValue, 'elige talla');
  assertEquals(fx.billing.charges.size, 0);
  await assertRejects(() => reserve({}, 4500), InvalidValue, 'elige talla');
  await fx.manageOrders().edit(id, {
    quantity: 1,
    values: { talla: '8', nombre: 'Pepe' },
    note: null,
  });
  await fx.manageOrders().place(id, 4500);
  assertEquals((await chargeOf(fx, id)).concept(), 'Chándal · Talla 8 · Nombre a estampar: Pepe');
});
