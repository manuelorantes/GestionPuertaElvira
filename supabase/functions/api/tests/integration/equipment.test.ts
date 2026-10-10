import { assert, assertEquals } from '@std/assert';

import { LocalDate } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

const today = LocalDate.fromInstant(new Date()).toString();
const body = <T>(response: { body: unknown }) => response.body as T;

async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const group = await newGroup(client, await newTeacher(client));
  const student = await client.json('POST', '/api/admin/students', {
    fullName: 'Martina López Herrera',
    birthDate: '2014-03-12',
    guardians: [{ name: 'Rocío Herrera', phone: '612481930' }],
    imageConsent: true,
    groupIds: [group],
  });
  assertEquals(student.status, 201);
  const product = await client.json('POST', '/api/admin/equipment/products', {
    name: 'Chándal',
    priceCents: 4500,
    fields: [
      { name: 'Talla', kind: 'options', options: ['8', '10', '12'] },
      { name: 'Nombre a estampar', kind: 'text', options: [] },
    ],
  });
  assertEquals(product.status, 201);
  const products = body<{ items: { id: string; fields: { id: string; name: string }[] }[] }>(
    await client.get('/api/admin/equipment/products'),
  ).items;
  const fields = products[0]?.fields ?? [];
  return {
    client,
    student: body<{ id: string }>(student).id,
    product: body<{ id: string }>(product).id,
    talla: fields.find((f) => f.name === 'Talla')?.id ?? '',
    nombre: fields.find((f) => f.name === 'Nombre a estampar')?.id ?? '',
  };
}

interface OrderRow {
  id: string;
  status: string;
  detail: string;
  chargeId: string | null;
  dueCents: number;
  coveredCents: number;
  deliveredOn: string | null;
}

Deno.test('equipment should take an order from reservation to payment, with stock, delivery and margin', async () => {
  const fx = await fixture();
  const c = fx.client;
  const reserved = await c.json('POST', '/api/admin/equipment/orders', {
    studentId: fx.student,
    productId: fx.product,
    values: { [fx.talla]: '10', [fx.nombre]: 'Martina' },
  });
  assertEquals(reserved.status, 201);
  const id = body<{ id: string }>(reserved).id;
  let order = body<OrderRow>(await c.get(`/api/admin/equipment/orders/${id}`));
  assertEquals(order.status, 'reserved');
  assertEquals(order.detail, 'Talla 10 · Nombre a estampar: Martina');

  assertEquals(
    (await c.json('POST', `/api/admin/equipment/orders/${id}/place`, { priceCents: 4500 })).status,
    204,
  );
  order = body<OrderRow>(await c.get(`/api/admin/equipment/orders/${id}`));
  assertEquals(order.status, 'ordered');
  assert(order.chargeId);

  // El cobro sale con las cuotas del mes, con el producto como concepto.
  const charges =
    body<{ items: { id: string; kind: string; concept: string | null; amountCents: number }[] }>(
      await c.get(`/api/admin/billing/charges?month=${today.slice(0, 7)}&kind=monthly`),
    ).items;
  const material = charges.find((ch) => ch.kind === 'material');
  assertEquals(material?.concept, 'Chándal · Talla 10 · Nombre a estampar: Martina');
  assertEquals(material?.amountCents, 4500);
  await assertError(
    await c.json('POST', `/api/admin/billing/charges/${order.chargeId}/cancel`, {}),
    422,
    'unprocessable',
  );

  // Sin stock no se entrega; con el lote, sí.
  await assertError(
    await c.json('POST', `/api/admin/equipment/orders/${id}/deliver`, {}),
    409,
    'not_enough_stock',
  );
  const lot = await c.json('POST', '/api/admin/equipment/purchases', {
    productId: fx.product,
    date: today,
    costCents: 60000,
    note: 'Proveedor',
    lines: [
      { values: { [fx.talla]: '8' }, quantity: 5 },
      { values: { [fx.talla]: '10' }, quantity: 10 },
      { values: { [fx.talla]: '12' }, quantity: 5 },
    ],
  });
  assertEquals(lot.status, 201);
  assertEquals((await c.json('POST', `/api/admin/equipment/orders/${id}/deliver`, {})).status, 204);

  // Se cobra desde Cobros como un concepto más.
  const pay = {
    studentId: fx.student,
    kind: 'material',
    method: 'cash',
    date: today,
    chargeId: order.chargeId,
  };
  const quote = body<{ totalCents: number; concept: string }>(
    await c.json('POST', '/api/admin/billing/quote', pay),
  );
  assertEquals(quote.totalCents, 4500);
  assertEquals((await c.json('POST', '/api/admin/billing/payments', pay)).status, 201);
  order = body<OrderRow>(await c.get(`/api/admin/equipment/orders/${id}`));
  assertEquals(order.status, 'paid');
  assertEquals(order.deliveredOn, today);
  assertEquals(
    body<{ items: OrderRow[] }>(await c.get('/api/admin/equipment/orders?open=1')).items.length,
    0,
  );
  await assertError(
    await c.json('POST', `/api/admin/equipment/orders/${id}/cancel`, { returnToStock: false }),
    422,
    'unprocessable',
  );

  const stock = body<
    { items: { variants: { variantLabel: string; inStock: number; toBuy: number }[] }[] }
  >(
    await c.get('/api/admin/equipment/stock'),
  ).items[0]?.variants;
  assertEquals(stock?.map((v) => [v.variantLabel, v.inStock]), [['Talla 8', 5], ['Talla 10', 9], [
    'Talla 12',
    5,
  ]]);

  const margins = body<{
    products: {
      unitsBought: number;
      averageCostCents: number;
      unitsSold: number;
      marginCents: number;
    }[];
    totals: { spentCents: number; revenueCents: number; collectedCents: number };
  }>(await c.get('/api/admin/equipment/margins'));
  assertEquals(margins.products[0]?.averageCostCents, 3000);
  assertEquals(margins.products[0]?.unitsSold, 1);
  assertEquals(margins.products[0]?.marginCents, 1500);
  assertEquals(
    margins.totals,
    {
      unitsBought: 20,
      spentCents: 60000,
      unitsSold: 1,
      revenueCents: 4500,
      collectedCents: 4500,
      marginCents: 1500,
    } as typeof margins.totals,
  );

  const account = body<{ totals: { kind: string; paidCents: number; pendingCents: number }[] }>(
    await c.get(`/api/admin/billing/accounts/${fx.student}`),
  );
  assertEquals(account.totals.find((t) => t.kind === 'material'), {
    kind: 'material',
    paidCents: 4500,
    pendingCents: 0,
  });
});

Deno.test('equipment should cancel only the pending part of an order and refuse to drop options in use', async () => {
  const fx = await fixture();
  const c = fx.client;
  const created = await c.json('POST', '/api/admin/equipment/orders', {
    studentId: fx.student,
    productId: fx.product,
    quantity: 2,
    values: { [fx.talla]: '8' },
    priceCents: 9000,
  });
  const id = body<{ id: string }>(created).id;
  assertEquals(
    (await c.json('POST', `/api/admin/equipment/orders/${id}/cancel`, { returnToStock: false }))
      .status,
    204,
  );
  let order = body<OrderRow>(await c.get(`/api/admin/equipment/orders/${id}`));
  assertEquals([order.status, order.dueCents], ['cancelled', 0]);
  const cancelled =
    body<{ items: unknown[] }>(await c.get('/api/admin/billing/charges/cancelled')).items;
  assertEquals(cancelled.length, 0);
  assertEquals(
    (await c.json('POST', `/api/admin/equipment/orders/${id}/reactivate`, {})).status,
    204,
  );
  order = body<OrderRow>(await c.get(`/api/admin/equipment/orders/${id}`));
  assertEquals([order.status, order.dueCents], ['ordered', 9000]);

  // Una reserva con la talla sin elegir: no pasa a pedido hasta elegirla.
  const loose = body<{ id: string }>(
    await c.json('POST', '/api/admin/equipment/orders', {
      studentId: fx.student,
      productId: fx.product,
      values: {},
    }),
  ).id;
  assertEquals(
    body<{ missing: string[] }>(await c.get(`/api/admin/equipment/orders/${loose}`)).missing,
    ['Talla'],
  );
  await assertError(
    await c.json('POST', `/api/admin/equipment/orders/${loose}/place`, { priceCents: 4500 }),
    422,
    'unprocessable',
  );

  await assertError(
    await c.json('PUT', `/api/admin/equipment/products/${fx.product}`, {
      name: 'Chándal',
      priceCents: 4500,
      fields: [{ id: fx.talla, name: 'Talla', kind: 'options', options: ['10', '12'] }],
    }),
    422,
    'unprocessable',
  );
});
