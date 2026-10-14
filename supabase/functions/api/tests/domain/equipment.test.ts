import { assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate, Money } from '../../src/domain/common/mod.ts';
import {
  ChargeRef,
  NotEnoughStock,
  Order,
  OrderId,
  Product,
  ProductField,
  ProductId,
  ProductMargin,
  Purchase,
  PurchaseId,
  StudentRef,
} from '../../src/domain/equipment/mod.ts';

const today = LocalDate.fromString('2026-10-10');

function tracksuit(): Product {
  return Product.create(ProductId.generate(), 'Chándal', Money.euros(45), [
    ProductField.of({ id: 'talla', name: 'Talla', kind: 'options', options: ['8', '10', '12'] }),
    ProductField.of({ id: 'nombre', name: 'Nombre a estampar', kind: 'text' }),
  ]);
}

function reserve(
  product: Product,
  quantity = 1,
  values: Record<string, string> = { talla: '10' },
): Order {
  return Order.reserve({
    id: OrderId.generate(),
    student: StudentRef.generate(),
    product,
    quantity,
    values,
    note: null,
    today,
  });
}

Deno.test('ProductField should require a name and, for lists, distinct options', () => {
  assertThrows(() => ProductField.of({ name: ' ', kind: 'text' }), InvalidValue, 'nombre');
  assertThrows(
    () => ProductField.of({ name: 'Talla', kind: 'options', options: [] }),
    InvalidValue,
  );
  assertThrows(
    () => ProductField.of({ name: 'Talla', kind: 'options', options: ['S', 's'] }),
    InvalidValue,
    'repetidas',
  );
  const field = ProductField.of({ name: 'Talla', kind: 'options', options: [' S ', '', 'M'] });
  assertEquals(field.options, ['S', 'M']);
  assertEquals(field.id.length > 0, true);
});

Deno.test('Product should describe a selection, requiring list options and keeping texts optional', () => {
  const product = tracksuit();
  assertThrows(() => product.select({}), InvalidValue, 'talla');
  assertThrows(() => product.select({ talla: '14' }), InvalidValue);
  const plain = product.select({ talla: '10' });
  assertEquals(plain.detail, 'Talla 10');
  const named = product.select({ talla: '10', nombre: ' Pepe ' });
  assertEquals(named.detail, 'Talla 10 · Nombre a estampar: Pepe');
  assertEquals(named.variantKey, plain.variantKey);
  assertEquals(named.variantLabel, 'Talla 10');
  assertEquals(product.variant({ talla: '10', nombre: 'Pepe' }).values, { talla: '10' });
});

Deno.test('Product should tell what happens to each option when its lists change', () => {
  const product = tracksuit();
  const talla = (options: string[]) =>
    ProductField.of({ id: 'talla', name: 'Talla', kind: 'options', options });
  // «10» pasa a «XS», «12» se quita y «8» sigue.
  const changes = product.update(
    'Chándal oficial',
    Money.euros(50),
    [talla(['8', 'XS', 'S'])],
    false,
    [
      { fieldId: 'talla', from: '10', to: 'XS' },
    ],
  );
  assertEquals(changes, [
    { fieldId: 'talla', fieldName: 'Talla', from: '10', to: 'XS' },
    { fieldId: 'talla', fieldName: 'Talla', from: '12', to: '' },
  ]);
  assertEquals(product.name, 'Chándal oficial');
  assertEquals(product.isActive(), false);
  assertThrows(() => reserve(product, 1, { talla: '8' }), InvalidValue, 'ya no se ofrece');

  // Un campo que deja de ser de lista pierde todas sus opciones.
  assertEquals(
    product.update('Chándal', Money.euros(45), [
      ProductField.of({ id: 'talla', name: 'Talla', kind: 'text' }),
    ], true).map((c) => c.from),
    ['8', 'XS', 'S'],
  );
});

Deno.test('Product should check that renamed options exist and end up in the list', () => {
  const update = (options: string[], renames: { from: string; to: string }[]) => {
    const product = tracksuit();
    return product.update(
      'Chándal',
      Money.euros(45),
      [ProductField.of({ id: 'talla', name: 'Talla', kind: 'options', options })],
      true,
      renames.map((r) => ({ fieldId: 'talla', ...r })),
    );
  };
  assertThrows(
    () => update(['XS'], [{ from: '14', to: 'XS' }]),
    InvalidValue,
    '«14» no es una opción',
  );
  assertThrows(
    () => update(['8', '12'], [{ from: '10', to: 'XS' }]),
    InvalidValue,
    'no está entre sus opciones',
  );
  assertThrows(
    () => update(['XS'], [{ from: '10', to: 'XS' }, { from: '12', to: 'XS' }]),
    InvalidValue,
    'Dos opciones',
  );
  assertThrows(
    () => update(['8', '12'], [{ from: '10', to: '12' }]),
    InvalidValue,
    '«12» ya es una opción',
  );
  // Intercambiar dos opciones sí se puede.
  assertEquals(
    update(['8', '10', '12'], [{ from: '10', to: '12' }, { from: '12', to: '10' }]).map((c) =>
      c.to
    ),
    ['12', '10'],
  );
});

Deno.test('Order should follow the renamed options, and only a reservation can be left blank', () => {
  const product = tracksuit();
  const renamed = reserve(product, 1, { talla: '10', nombre: 'Pepe' });
  const blank = reserve(product, 1, { talla: '10' });
  const removed = reserve(product, 1, { talla: '12' });
  const placed = reserve(product, 1, { talla: '10' });
  placed.place(product, Money.euros(45), ChargeRef.generate(), today);
  const gone = reserve(product, 1, { talla: '12' });
  gone.place(product, Money.euros(45), ChargeRef.generate(), today);

  const changes = product.update(
    'Chándal',
    Money.euros(45),
    [
      ProductField.of({ id: 'talla', name: 'Talla', kind: 'options', options: ['8', 'XS'] }),
      ProductField.of({ id: 'nombre', name: 'Nombre a estampar', kind: 'text' }),
    ],
    true,
    [{ fieldId: 'talla', from: '10', to: 'XS' }],
  );
  const none = new Set<string>();

  assertEquals(renamed.followOptions(product, changes, none), true);
  assertEquals(renamed.selection.detail, 'Talla XS · Nombre a estampar: Pepe');
  assertEquals(renamed.followOptions(product, changes, none), false);

  assertEquals(blank.followOptions(product, changes, new Set(['talla=10'])), true);
  assertEquals(blank.selection.values, {});
  assertEquals(product.missingIn(blank.selection.values), ['Talla']);

  removed.followOptions(product, changes, none);
  assertEquals(removed.selection.variantLabel, '');

  // Con precio, la reserva en blanco no se aplica: pasa a la nueva.
  placed.followOptions(product, changes, new Set(['talla=10']));
  assertEquals(placed.selection.detail, 'Talla XS');
  assertThrows(
    () => gone.followOptions(product, changes, none),
    InvalidValue,
    'No se puede quitar «12» de «Talla»: hay pedidos con precio',
  );
});

Deno.test('Purchase should follow the renamed options and refuse to lose one', () => {
  const product = tracksuit();
  const purchase = Purchase.register({
    id: PurchaseId.generate(),
    product,
    boughtOn: today,
    cost: Money.euros(60),
    lines: [{ values: { talla: '10' }, quantity: 1 }, { values: { talla: '8' }, quantity: 1 }],
    note: null,
    today,
  });
  const changes = product.update(
    'Chándal',
    Money.euros(45),
    [
      ProductField.of({ id: 'talla', name: 'Talla', kind: 'options', options: ['8', 'XS'] }),
    ],
    true,
    [{ fieldId: 'talla', from: '10', to: 'XS' }],
  );
  assertEquals(purchase.followOptions(product, changes), true);
  assertEquals(purchase.lines.map((l) => l.selection.variantLabel), ['Talla XS', 'Talla 8']);
  assertEquals(purchase.unitsOf(product.variant({ talla: 'XS' }).variantKey), 1);
  assertEquals(purchase.followOptions(product, changes), false);
  const dropped = product.update('Chándal', Money.euros(45), [
    ProductField.of({ id: 'talla', name: 'Talla', kind: 'options', options: ['XS'] }),
  ], true);
  assertThrows(
    () => purchase.followOptions(product, dropped),
    InvalidValue,
    'No se puede quitar «8» de «Talla»: hay compras',
  );
});

Deno.test('Order should go from reserved to ordered and describe its charge', () => {
  const product = tracksuit();
  const order = reserve(product, 2, { talla: '10' });
  assertEquals(order.status, 'reserved');
  assertThrows(() => order.changePrice(Money.euros(80)), InvalidValue, 'aún no tiene precio');
  order.place(tracksuit(), Money.euros(90), ChargeRef.generate(), today);
  assertEquals(order.status, 'ordered');
  assertEquals(order.price?.cents, 9000);
  assertEquals(order.concept(product.name), '2 × Chándal · Talla 10');
  assertThrows(
    () => order.place(tracksuit(), Money.euros(90), ChargeRef.generate(), today),
    InvalidValue,
  );
});

Deno.test('Order should go back to reserved only while it is ordered and not delivered', () => {
  const order = reserve(tracksuit());
  assertThrows(() => order.unplace(), InvalidValue, 'no tiene precio');
  order.place(tracksuit(), Money.euros(45), ChargeRef.generate(), today);
  order.deliver(today, today, 1);
  assertThrows(() => order.unplace(), InvalidValue, 'entregado');
  order.undoDelivery();
  order.unplace();
  assertEquals([order.status, order.price, order.charge, order.orderedOn()], [
    'reserved',
    null,
    null,
    null,
  ]);
  order.cancel(today, false);
  assertThrows(() => order.unplace(), InvalidValue, 'cancelado');
});

Deno.test('Order should deliver only with a price and enough stock, and undo it', () => {
  const order = reserve(tracksuit(), 2);
  assertThrows(() => order.deliver(today, today, 5), InvalidValue, 'pedido');
  order.place(tracksuit(), Money.euros(90), ChargeRef.generate(), today);
  const error = assertThrows(() => order.deliver(today, today, 1), NotEnoughStock);
  assertEquals(error.available, 1);
  assertThrows(() => order.deliver(today.plusDays(1), today, 5), InvalidValue, 'futura');
  order.deliver(today, today, 2);
  assertEquals(order.takesStock(), true);
  assertThrows(() => order.edit(tracksuit(), 1, { talla: '8' }, null), InvalidValue, 'entregado');
  order.undoDelivery();
  assertEquals(order.deliveredOn(), null);
});

Deno.test('Order should be cancelled, return to stock only when asked, and be reactivated', () => {
  const order = reserve(tracksuit());
  order.place(tracksuit(), Money.euros(45), ChargeRef.generate(), today);
  order.deliver(today, today, 1);
  order.cancel(today, false);
  assertEquals(order.takesStock(), true);
  assertThrows(() => order.undoDelivery(), InvalidValue, 'cancelado');
  order.reactivate();
  assertEquals(order.status, 'ordered');
  order.cancel(today, true);
  assertEquals(order.takesStock(), false);
  const reserved = reserve(tracksuit());
  reserved.cancel(today, true);
  reserved.reactivate();
  assertEquals(reserved.status, 'reserved');
});

Deno.test('Purchase should split its cost among its units and refuse repeated variants', () => {
  const product = tracksuit();
  const purchase = Purchase.register({
    id: PurchaseId.generate(),
    product,
    boughtOn: today,
    cost: Money.euros(600),
    lines: [
      { values: { talla: '8' }, quantity: 5 },
      { values: { talla: '10' }, quantity: 10 },
      { values: { talla: '12' }, quantity: 5 },
    ],
    note: 'Proveedor',
    today,
  });
  assertEquals(purchase.units(), 20);
  assertEquals(purchase.unitCost().cents, 3000);
  assertEquals(purchase.unitsOf(product.variant({ talla: '10' }).variantKey), 10);
  assertThrows(
    () =>
      purchase.update({
        product,
        boughtOn: today,
        cost: Money.euros(10),
        lines: [{ values: { talla: '8' }, quantity: 1 }, { values: { talla: '8' }, quantity: 2 }],
        note: null,
        today,
      }),
    InvalidValue,
    'misma variante',
  );
});

Deno.test('ProductMargin should use the average cost of everything bought', () => {
  const margin = new ProductMargin(20, Money.euros(600), 10, Money.euros(450));
  assertEquals(margin.averageCost?.cents, 3000);
  assertEquals(margin.soldCost?.cents, 30000);
  assertEquals(margin.margin?.cents, 15000);
  assertEquals(margin.marginPerUnit?.cents, 1500);
  assertEquals(new ProductMargin(0, Money.zero(), 2, Money.euros(90)).margin, null);
});

Deno.test('Order should be reserved with list fields still to choose, but not ordered until they are chosen', () => {
  const product = tracksuit();
  const order = reserve(product, 1, {});
  assertEquals(order.selection.variantKey, '');
  assertEquals(product.missingIn(order.selection.values), ['Talla']);
  assertThrows(
    () => order.place(product, Money.euros(45), ChargeRef.generate(), today),
    InvalidValue,
    'Antes de pasarlo a pedido, elige talla',
  );
  assertThrows(() => order.deliver(today, today, 5), InvalidValue, 'pedido');
  order.edit(product, 1, { talla: '12' }, null);
  order.place(product, Money.euros(45), ChargeRef.generate(), today);
  assertEquals(order.selection.variantKey, product.variant({ talla: '12' }).variantKey);
  // Ya con precio, no se puede volver a dejar sin elegir.
  assertThrows(() => order.edit(product, 1, {}, null), InvalidValue, 'Elige talla');
});
