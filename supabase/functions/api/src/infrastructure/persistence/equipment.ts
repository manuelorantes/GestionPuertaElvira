import { LocalDate, Money } from '../../domain/common/mod.ts';
import {
  ChargeRef,
  Order,
  OrderId,
  type OrderStatus,
  Product,
  ProductField,
  ProductId,
  Purchase,
  PurchaseId,
  PurchaseLine,
  Selection,
  StudentRef,
} from '../../domain/equipment/mod.ts';
import type {
  EquipmentQuery,
  OrderFilter,
  OrderRepository,
  OrderState,
  OrderView,
  ProductRepository,
  ProductView,
  PurchaseRepository,
  PurchaseView,
  StockLedger,
  StudentLookup,
} from '../../application/equipment/mod.ts';
import { ALLOCATED } from './billing.ts';
import { Row, type Sql } from './sql.ts';

interface StoredField {
  id: string;
  name: string;
  kind: string;
  options: string[];
}

interface StoredLine {
  variantKey: string;
  variantLabel: string;
  values: Record<string, string>;
  quantity: number;
}

function fieldsOf(row: Row): StoredField[] {
  return row.json('fields') as StoredField[];
}

function toProduct(row: Row): Product {
  return Product.restore(
    ProductId.fromString(row.string('id')),
    row.string('name'),
    Money.cents(row.int('price_cents')),
    fieldsOf(row).map((f) => ProductField.of(f)),
    row.bool('active'),
  );
}

export class SqlProductRepository implements ProductRepository {
  constructor(private readonly sql: Sql) {}

  async product(id: ProductId): Promise<Product | null> {
    const rows = await this.sql`SELECT * FROM equipment_product WHERE id = ${id.value}`;
    return rows[0] ? toProduct(new Row(rows[0])) : null;
  }

  async saveProduct(product: Product): Promise<void> {
    const record = {
      id: product.id.value,
      name: product.name,
      price_cents: product.price.cents,
      fields: this.sql.json(
        product.fields.map((f) => ({
          id: f.id,
          name: f.name,
          kind: f.kind,
          options: [...f.options],
        })),
      ),
      active: product.isActive(),
    };
    await this.sql`INSERT INTO equipment_product ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_cents = EXCLUDED.price_cents,
        fields = EXCLUDED.fields, active = EXCLUDED.active`;
  }
}

const date = (row: Row, column: string) => {
  const value = row.nullableString(column);
  return value === null ? null : LocalDate.fromString(value);
};

const ORDER_COLUMNS =
  `o.id, o.student_id, o.product_id, o.quantity, o.field_values, o.variant_key, o.variant_label,
  o.detail, o.note, o.status, o.price_cents, o.charge_id, o.created_on::text AS created_on,
  o.ordered_on::text AS ordered_on, o.delivered_on::text AS delivered_on, o.cancelled_on::text AS cancelled_on,
  o.returned_to_stock`;

function toOrder(row: Row): Order {
  const price = row.nullableInt('price_cents');
  const charge = row.nullableString('charge_id');
  return Order.restore({
    id: OrderId.fromString(row.string('id')),
    student: StudentRef.fromString(row.string('student_id')),
    product: ProductId.fromString(row.string('product_id')),
    quantity: row.int('quantity'),
    selection: new Selection(
      row.json('field_values') as Record<string, string>,
      row.string('variant_key'),
      row.string('variant_label'),
      row.string('detail'),
    ),
    note: row.nullableString('note'),
    status: row.string('status') as OrderStatus,
    price: price === null ? null : Money.cents(price),
    charge: charge === null ? null : ChargeRef.fromString(charge),
    createdOn: LocalDate.fromString(row.string('created_on')),
    orderedOn: date(row, 'ordered_on'),
    deliveredOn: date(row, 'delivered_on'),
    cancelledOn: date(row, 'cancelled_on'),
    returnedToStock: row.bool('returned_to_stock'),
  });
}

export class SqlOrderRepository implements OrderRepository {
  constructor(private readonly sql: Sql) {}

  async order(id: OrderId): Promise<Order | null> {
    const rows = await this.sql.unsafe(
      `SELECT ${ORDER_COLUMNS} FROM equipment_order o WHERE o.id = $1`,
      [id.value],
    );
    return rows[0] ? toOrder(new Row(rows[0])) : null;
  }

  async saveOrder(order: Order): Promise<void> {
    const record = {
      id: order.id.value,
      student_id: order.student.value,
      product_id: order.product.value,
      quantity: order.quantity,
      field_values: this.sql.json({ ...order.selection.values }),
      variant_key: order.selection.variantKey,
      variant_label: order.selection.variantLabel,
      detail: order.selection.detail,
      note: order.note(),
      status: order.status,
      price_cents: order.price?.cents ?? null,
      charge_id: order.charge?.value ?? null,
      created_on: order.createdOn.toString(),
      ordered_on: order.orderedOn()?.toString() ?? null,
      delivered_on: order.deliveredOn()?.toString() ?? null,
      cancelled_on: order.cancelledOn()?.toString() ?? null,
      returned_to_stock: order.returnedToStock(),
    };
    await this.sql`INSERT INTO equipment_order ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, field_values = EXCLUDED.field_values,
        variant_key = EXCLUDED.variant_key, variant_label = EXCLUDED.variant_label, detail = EXCLUDED.detail,
        note = EXCLUDED.note, status = EXCLUDED.status, price_cents = EXCLUDED.price_cents,
        charge_id = EXCLUDED.charge_id, ordered_on = EXCLUDED.ordered_on, delivered_on = EXCLUDED.delivered_on,
        cancelled_on = EXCLUDED.cancelled_on, returned_to_stock = EXCLUDED.returned_to_stock`;
  }
}

function linesOf(row: Row): StoredLine[] {
  return row.json('lines') as StoredLine[];
}

export class SqlPurchaseRepository implements PurchaseRepository {
  constructor(private readonly sql: Sql) {}

  async purchase(id: PurchaseId): Promise<Purchase | null> {
    const rows = await this.sql`SELECT *, bought_on::text AS day FROM equipment_purchase
      WHERE id = ${id.value}`;
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    return Purchase.restore(
      PurchaseId.fromString(row.string('id')),
      ProductId.fromString(row.string('product_id')),
      LocalDate.fromString(row.string('day')),
      Money.cents(row.int('cost_cents')),
      linesOf(row).map((l) =>
        new PurchaseLine(
          new Selection(l.values, l.variantKey, l.variantLabel, l.variantLabel),
          l.quantity,
        )
      ),
      row.nullableString('note'),
    );
  }

  async savePurchase(purchase: Purchase): Promise<void> {
    const record = {
      id: purchase.id.value,
      product_id: purchase.product.value,
      bought_on: purchase.boughtOn.toString(),
      cost_cents: purchase.cost.cents,
      lines: this.sql.json(
        purchase.lines.map((l) => ({
          variantKey: l.selection.variantKey,
          variantLabel: l.selection.variantLabel,
          values: { ...l.selection.values },
          quantity: l.quantity,
        })),
      ),
      note: purchase.note(),
    };
    await this.sql`INSERT INTO equipment_purchase ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET bought_on = EXCLUDED.bought_on, cost_cents = EXCLUDED.cost_cents,
        lines = EXCLUDED.lines, note = EXCLUDED.note`;
  }

  async deletePurchase(id: PurchaseId): Promise<void> {
    await this.sql`DELETE FROM equipment_purchase WHERE id = ${id.value}`;
  }
}

export class SqlStockLedger implements StockLedger {
  constructor(private readonly sql: Sql) {}

  async variants(product: ProductId): Promise<Map<string, { bought: number; taken: number }>> {
    const rows = await this.sql`
      SELECT variant_key, SUM(bought)::integer AS bought, SUM(taken)::integer AS taken FROM (
        SELECT l->>'variantKey' AS variant_key, (l->>'quantity')::integer AS bought, 0 AS taken
          FROM equipment_purchase p CROSS JOIN jsonb_array_elements(p.lines) l
         WHERE p.product_id = ${product.value}
        UNION ALL
        SELECT variant_key, 0, quantity FROM equipment_order
         WHERE product_id = ${product.value} AND delivered_on IS NOT NULL AND NOT returned_to_stock
      ) movements GROUP BY variant_key`;
    return new Map(
      Row.all(rows).map((
        r,
      ) => [r.string('variant_key'), { bought: r.int('bought'), taken: r.int('taken') }]),
    );
  }

  async usedValues(product: ProductId): Promise<Set<string>> {
    const rows = await this.sql`
      SELECT kv.key || '=' || kv.value AS used
        FROM equipment_order o CROSS JOIN jsonb_each_text(o.field_values) kv
       WHERE o.product_id = ${product.value}
      UNION
      SELECT kv.key || '=' || kv.value
        FROM equipment_purchase p CROSS JOIN jsonb_array_elements(p.lines) l
        CROSS JOIN jsonb_each_text(l->'values') kv
       WHERE p.product_id = ${product.value}`;
    return new Set(Row.all(rows).map((r) => r.string('used')));
  }
}

export class SqlStudentLookup implements StudentLookup {
  constructor(private readonly sql: Sql) {}

  async exists(studentId: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) return false;
    const rows = await this.sql`SELECT 1 FROM students_student WHERE id = ${studentId}`;
    return rows.length > 0;
  }
}

function stateOf(row: Row): OrderState {
  const status = row.string('status');
  if (status === 'cancelled' || status === 'reserved') return status;
  return row.int('covered_cents') >= row.int('due_cents') ? 'paid' : 'ordered';
}

function toOrderView(row: Row): OrderView {
  const values = row.json('field_values') as Record<string, string>;
  return {
    missing: (row.json('product_fields') as StoredField[])
      .filter((f) => f.kind === 'options' && !f.options.includes(values[f.id] ?? ''))
      .map((f) => f.name),
    id: row.string('id'),
    studentId: row.string('student_id'),
    studentName: row.string('full_name'),
    productId: row.string('product_id'),
    productName: row.string('product_name'),
    quantity: row.int('quantity'),
    values: row.json('field_values') as Record<string, string>,
    detail: row.string('detail'),
    variantLabel: row.string('variant_label'),
    note: row.nullableString('note'),
    status: stateOf(row),
    priceCents: row.nullableInt('price_cents'),
    dueCents: row.int('due_cents'),
    coveredCents: row.int('covered_cents'),
    chargeId: row.nullableString('charge_id'),
    createdOn: row.string('created_on'),
    orderedOn: row.nullableString('ordered_on'),
    deliveredOn: row.nullableString('delivered_on'),
    cancelledOn: row.nullableString('cancelled_on'),
    returnedToStock: row.bool('returned_to_stock'),
  };
}

export class SqlEquipmentQuery implements EquipmentQuery {
  constructor(private readonly sql: Sql) {}

  async products(): Promise<ProductView[]> {
    const rows = await this.sql`SELECT * FROM equipment_product ORDER BY active DESC, name`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      name: r.string('name'),
      priceCents: r.int('price_cents'),
      active: r.bool('active'),
      fields: fieldsOf(r),
    }));
  }

  async orders(filter: OrderFilter): Promise<OrderView[]> {
    const params: (string | number)[] = [];
    const where: string[] = [];
    const add = (condition: (n: string) => string, value: string | number) => {
      params.push(value);
      where.push(condition(`$${params.length}`));
    };
    if (filter.productId !== null) add((n) => `o.product_id = ${n}::uuid`, filter.productId);
    if (filter.studentId !== null) add((n) => `o.student_id = ${n}::uuid`, filter.studentId);
    if (filter.season !== null) {
      add((n) => `o.created_on >= make_date(${n}::integer, 9, 1)`, filter.season);
      add((n) => `o.created_on < make_date(${n}::integer, 9, 1)`, filter.season + 1);
    }
    if (filter.open) {
      where.push(`(o.status = 'reserved' OR (o.status = 'ordered'
        AND (o.delivered_on IS NULL OR COALESCE(a.covered_cents, 0) < COALESCE(a.due_cents, 0))))`);
    }
    const rows = await this.sql.unsafe(
      `WITH ${ALLOCATED}
       SELECT ${ORDER_COLUMNS}, p.name AS product_name, p.fields AS product_fields, s.full_name,
              COALESCE(a.due_cents, 0) AS due_cents, COALESCE(a.covered_cents, 0) AS covered_cents
         FROM equipment_order o
         JOIN equipment_product p ON p.id = o.product_id
         JOIN students_student s ON s.id = o.student_id
         LEFT JOIN allocated a ON a.id = o.charge_id
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY o.created_on DESC, s.search_name, o.id`,
      params,
    );
    const views = Row.all(rows).map(toOrderView);
    return filter.status === null ? views : views.filter((v) => v.status === filter.status);
  }

  async order(id: string): Promise<OrderView | null> {
    const rows = await this.sql.unsafe(
      `WITH ${ALLOCATED}
       SELECT ${ORDER_COLUMNS}, p.name AS product_name, p.fields AS product_fields, s.full_name,
              COALESCE(a.due_cents, 0) AS due_cents, COALESCE(a.covered_cents, 0) AS covered_cents
         FROM equipment_order o
         JOIN equipment_product p ON p.id = o.product_id
         JOIN students_student s ON s.id = o.student_id
         LEFT JOIN allocated a ON a.id = o.charge_id
        WHERE o.id = $1`,
      [id],
    );
    return rows[0] ? toOrderView(new Row(rows[0])) : null;
  }

  async purchases(productId: string | null): Promise<PurchaseView[]> {
    const rows = await this.sql`
      SELECT pu.*, pu.bought_on::text AS day, pr.name AS product_name
        FROM equipment_purchase pu JOIN equipment_product pr ON pr.id = pu.product_id
       WHERE (${productId}::uuid IS NULL OR pu.product_id = ${productId}::uuid)
       ORDER BY pu.bought_on DESC, pr.name, pu.id`;
    return Row.all(rows).map((r) => {
      const lines = linesOf(r);
      const units = lines.reduce((sum, l) => sum + l.quantity, 0);
      return {
        id: r.string('id'),
        productId: r.string('product_id'),
        productName: r.string('product_name'),
        boughtOn: r.string('day'),
        costCents: r.int('cost_cents'),
        units,
        unitCostCents: units === 0 ? 0 : Math.round(r.int('cost_cents') / units),
        note: r.nullableString('note'),
        lines: lines.map((l) => ({
          values: l.values,
          variantLabel: l.variantLabel,
          quantity: l.quantity,
        })),
      };
    });
  }

  async stock() {
    const rows = await this.sql`
      WITH movements AS (
        SELECT p.product_id, l->>'variantKey' AS variant_key, l->>'variantLabel' AS variant_label,
               (l->>'quantity')::integer AS bought, 0 AS delivered, 0 AS awaiting
          FROM equipment_purchase p CROSS JOIN jsonb_array_elements(p.lines) l
        UNION ALL
        SELECT product_id, variant_key, variant_label, 0,
               CASE WHEN delivered_on IS NOT NULL AND NOT returned_to_stock THEN quantity ELSE 0 END,
               CASE WHEN status <> 'cancelled' AND delivered_on IS NULL THEN quantity ELSE 0 END
          FROM equipment_order
         -- Una reserva con campos de lista sin elegir aún no es de ninguna variante.
         WHERE variant_key <> ''
      )
      SELECT pr.id, pr.name, pr.active, m.variant_key, MAX(m.variant_label) AS variant_label,
             SUM(m.bought)::integer AS bought, SUM(m.delivered)::integer AS delivered,
             SUM(m.awaiting)::integer AS awaiting
        FROM movements m JOIN equipment_product pr ON pr.id = m.product_id
       GROUP BY pr.id, pr.name, pr.active, m.variant_key
      HAVING SUM(m.bought) > 0 OR SUM(m.delivered) > 0 OR SUM(m.awaiting) > 0
       ORDER BY pr.active DESC, pr.name, pr.id`;
    return Row.all(rows).map((r) => ({
      productId: r.string('id'),
      productName: r.string('name'),
      active: r.bool('active'),
      variantKey: r.string('variant_key'),
      variantLabel: r.string('variant_label'),
      bought: r.int('bought'),
      delivered: r.int('delivered'),
      awaiting: r.int('awaiting'),
    }));
  }

  async sales() {
    const rows = await this.sql.unsafe(
      `WITH ${ALLOCATED},
       bought AS (
         SELECT product_id, SUM(cost_cents)::integer AS spent,
                SUM((SELECT COALESCE(SUM((l->>'quantity')::integer), 0) FROM jsonb_array_elements(lines) l))::integer
                  AS units
           FROM equipment_purchase GROUP BY product_id
       ),
       sold AS (
         SELECT o.product_id, SUM(o.quantity)::integer AS units, SUM(a.due_cents)::integer AS revenue,
                SUM(a.covered_cents)::integer AS collected
           FROM equipment_order o JOIN allocated a ON a.id = o.charge_id
          WHERE o.status = 'ordered' GROUP BY o.product_id
       )
       SELECT pr.id, pr.name, COALESCE(b.units, 0) AS units_bought, COALESCE(b.spent, 0) AS spent,
              COALESCE(s.units, 0) AS units_sold, COALESCE(s.revenue, 0) AS revenue,
              COALESCE(s.collected, 0) AS collected
         FROM equipment_product pr
         LEFT JOIN bought b ON b.product_id = pr.id
         LEFT JOIN sold s ON s.product_id = pr.id
        WHERE pr.active OR b.product_id IS NOT NULL OR s.product_id IS NOT NULL
        ORDER BY pr.name, pr.id`,
    );
    return Row.all(rows).map((r) => ({
      productId: r.string('id'),
      productName: r.string('name'),
      unitsBought: r.int('units_bought'),
      spentCents: r.int('spent'),
      unitsSold: r.int('units_sold'),
      revenueCents: r.int('revenue'),
      collectedCents: r.int('collected'),
    }));
  }
}
