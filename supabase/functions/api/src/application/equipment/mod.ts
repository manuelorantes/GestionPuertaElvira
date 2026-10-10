import { type Clock, InvalidValue, LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
import { Charge, ChargeId, StudentRef as BillingStudentRef } from '../../domain/billing/mod.ts';
import {
  ChargeRef,
  Order,
  OrderId,
  Product,
  ProductField,
  ProductId,
  ProductMargin,
  Purchase,
  PurchaseId,
  StudentRef,
} from '../../domain/equipment/mod.ts';
import { type ChargeRepository, coveredOf } from '../billing/mod.ts';

// ---- Puertos ---------------------------------------------------------------------------------

export interface ProductRepository {
  product(id: ProductId): Promise<Product | null>;
  saveProduct(product: Product): Promise<void>;
}

export interface OrderRepository {
  order(id: OrderId): Promise<Order | null>;
  saveOrder(order: Order): Promise<void>;
}

export interface PurchaseRepository {
  purchase(id: PurchaseId): Promise<Purchase | null>;
  savePurchase(purchase: Purchase): Promise<void>;
  deletePurchase(id: PurchaseId): Promise<void>;
}

/** Comprado y entregado de cada variante de un producto, y las opciones que usan sus pedidos y compras. */
export interface StockLedger {
  /** Por `variantKey`: unidades compradas y unidades entregadas (sin las devueltas al stock). */
  variants(product: ProductId): Promise<Map<string, { bought: number; taken: number }>>;
  /** Valores por id de campo que aparecen en sus pedidos y compras («idCampo=valor»). */
  usedValues(product: ProductId): Promise<Set<string>>;
}

export interface StudentLookup {
  exists(studentId: string): Promise<boolean>;
}

export interface ProductView {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
  fields: { id: string; name: string; kind: string; options: string[] }[];
}

/** «paid»: pedido con su cobro cubierto. */
export type OrderState = 'reserved' | 'ordered' | 'paid' | 'cancelled';

export interface OrderView {
  id: string;
  studentId: string;
  studentName: string;
  productId: string;
  productName: string;
  quantity: number;
  values: Record<string, string>;
  detail: string;
  variantLabel: string;
  /** Campos de lista aún sin elegir (solo en reservas): hay que elegirlos para pasarlo a pedido. */
  missing: string[];
  note: string | null;
  status: OrderState;
  priceCents: number | null;
  /** Lo que se debe (lo conservado, si se canceló con algo cobrado) y lo cubierto de su cobro. */
  dueCents: number;
  coveredCents: number;
  chargeId: string | null;
  createdOn: string;
  orderedOn: string | null;
  deliveredOn: string | null;
  cancelledOn: string | null;
  returnedToStock: boolean;
}

export interface OrderFilter {
  /** Solo los abiertos: reservados, o pedidos sin pagar o sin entregar. */
  open: boolean;
  status: OrderState | null;
  productId: string | null;
  /** Año en que empieza la temporada en que se apuntó. */
  season: number | null;
  studentId: string | null;
}

export interface PurchaseView {
  id: string;
  productId: string;
  productName: string;
  boughtOn: string;
  costCents: number;
  units: number;
  unitCostCents: number;
  note: string | null;
  lines: { values: Record<string, string>; variantLabel: string; quantity: number }[];
}

export interface StockVariantView {
  variantKey: string;
  variantLabel: string;
  bought: number;
  delivered: number;
  inStock: number;
  /** Reservado o pedido y aún sin entregar. */
  awaiting: number;
  /** Lo que falta comprar para entregar todo lo apuntado. */
  toBuy: number;
}

export interface StockView {
  productId: string;
  productName: string;
  active: boolean;
  variants: StockVariantView[];
}

export interface MarginView {
  productId: string;
  productName: string;
  unitsBought: number;
  spentCents: number;
  averageCostCents: number | null;
  unitsSold: number;
  revenueCents: number;
  collectedCents: number;
  marginCents: number | null;
  marginPerUnitCents: number | null;
}

export interface EquipmentQuery {
  products(): Promise<ProductView[]>;
  orders(filter: OrderFilter): Promise<OrderView[]>;
  order(id: string): Promise<OrderView | null>;
  purchases(productId: string | null): Promise<PurchaseView[]>;
  /** Por producto y variante: comprado, entregado y apuntado sin entregar. */
  stock(): Promise<
    {
      productId: string;
      productName: string;
      active: boolean;
      variantKey: string;
      variantLabel: string;
      bought: number;
      delivered: number;
      awaiting: number;
    }[]
  >;
  /** Por producto: compras y ventas (pedidos con precio sin cancelar). */
  sales(): Promise<
    {
      productId: string;
      productName: string;
      unitsBought: number;
      spentCents: number;
      unitsSold: number;
      revenueCents: number;
      collectedCents: number;
    }[]
  >;
}

// ---- Errores ---------------------------------------------------------------------------------

export class ProductNotFound extends Error {
  constructor() {
    super('No existe ese producto.');
    this.name = 'ProductNotFound';
  }
}

export class OrderNotFound extends Error {
  constructor() {
    super('No existe ese pedido.');
    this.name = 'OrderNotFound';
  }
}

export class PurchaseNotFound extends Error {
  constructor() {
    super('No existe esa compra.');
    this.name = 'PurchaseNotFound';
  }
}

export class StudentNotFound extends Error {
  constructor() {
    super('No existe ese alumno.');
    this.name = 'EquipmentStudentNotFound';
  }
}

// ---- Productos -------------------------------------------------------------------------------

export interface ProductInput {
  name: string;
  priceCents: number;
  active: boolean;
  fields: { id: string | null; name: string; kind: string; options: string[] }[];
}

export class SaveProduct {
  constructor(
    private readonly products: ProductRepository,
    private readonly stock: StockLedger,
  ) {}

  async create(input: ProductInput): Promise<string> {
    const product = Product.create(
      ProductId.generate(),
      input.name,
      Money.cents(input.priceCents),
      input.fields.map((f) => ProductField.of(f)),
    );
    if (!input.active) {
      product.update(product.name, product.price, [...product.fields], false, new Set());
    }
    await this.products.saveProduct(product);
    return product.id.value;
  }

  async update(id: string, input: ProductInput): Promise<void> {
    const product = await this.products.product(ProductId.fromString(id));
    if (product === null) throw new ProductNotFound();
    // Solo cuentan las opciones de los campos que hoy son de lista (los textos libres no se «quitan»).
    const lists = new Set(product.fields.filter((f) => f.kind === 'options').map((f) => f.id));
    const used = [...(await this.stock.usedValues(product.id))].filter((v) =>
      lists.has(v.split('=')[0] ?? '')
    );
    product.update(
      input.name,
      Money.cents(input.priceCents),
      input.fields.map((f) => ProductField.of(f)),
      input.active,
      new Set(used),
    );
    await this.products.saveProduct(product);
  }
}

// ---- Pedidos ---------------------------------------------------------------------------------

export interface OrderInput {
  studentId: string;
  productId: string;
  quantity: number;
  values: Record<string, string>;
  note: string | null;
  /** Con precio, se apunta directamente como pedido (con su cobro). */
  priceCents: number | null;
}

/** Lo común de los casos de uso de pedidos: cargar, el cobro de Cobros y el stock. */
class Orders {
  constructor(
    readonly orders: OrderRepository,
    readonly products: ProductRepository,
    readonly charges: ChargeRepository,
    readonly stock: StockLedger,
    readonly clock: Clock,
  ) {}

  today(): LocalDate {
    return LocalDate.fromInstant(this.clock.now());
  }

  async order(id: string): Promise<Order> {
    const order = await this.orders.order(OrderId.fromString(id));
    if (order === null) throw new OrderNotFound();
    return order;
  }

  async product(id: ProductId): Promise<Product> {
    const product = await this.products.product(id);
    if (product === null) throw new ProductNotFound();
    return product;
  }

  async charge(order: Order): Promise<Charge | null> {
    if (order.charge === null) return null;
    return await this.charges.charge(ChargeId.fromString(order.charge.value));
  }

  /** Lo que tiene cubierto el cobro del pedido. */
  async covered(charge: Charge): Promise<Money> {
    return await coveredOf(this.charges, charge);
  }

  /** De reservado a pedido: crea su cobro en Cobros por ese precio, en el mes de hoy. */
  async place(order: Order, product: Product, price: Money): Promise<void> {
    const today = this.today();
    const charge = Charge.material(
      ChargeId.generate(),
      BillingStudentRef.fromString(order.student.value),
      YearMonth.of(today),
      price,
      order.concept(product.name),
    );
    order.place(product, price, ChargeRef.fromString(charge.id.value), today);
    await this.charges.saveCharge(charge);
  }

  /** Unidades que quedan de una variante. */
  async available(product: ProductId, variantKey: string): Promise<number> {
    const variant = (await this.stock.variants(product)).get(variantKey);
    return (variant?.bought ?? 0) - (variant?.taken ?? 0);
  }
}

export class ManageOrders {
  private readonly o: Orders;

  constructor(
    orders: OrderRepository,
    products: ProductRepository,
    charges: ChargeRepository,
    stock: StockLedger,
    private readonly students: StudentLookup,
    clock: Clock,
  ) {
    this.o = new Orders(orders, products, charges, stock, clock);
  }

  /** Apunta una reserva (o, con precio, un pedido con su cobro). */
  async reserve(input: OrderInput): Promise<string> {
    if (!(await this.students.exists(input.studentId))) throw new StudentNotFound();
    const product = await this.o.product(ProductId.fromString(input.productId));
    const order = Order.reserve({
      id: OrderId.generate(),
      student: StudentRef.fromString(input.studentId),
      product,
      quantity: input.quantity,
      values: input.values,
      note: input.note,
      today: this.o.today(),
    });
    if (input.priceCents !== null) {
      await this.o.place(order, product, Money.cents(input.priceCents));
    }
    await this.o.orders.saveOrder(order);
    return order.id.value;
  }

  /** Corrige cantidad, campos o nota; el concepto de su cobro se actualiza (el precio no cambia solo). */
  async edit(
    id: string,
    input: { quantity: number; values: Record<string, string>; note: string | null },
  ): Promise<void> {
    const order = await this.o.order(id);
    const product = await this.o.product(order.product);
    order.edit(product, input.quantity, input.values, input.note);
    const charge = await this.o.charge(order);
    if (charge !== null) {
      charge.changePrice(charge.fullAmount(), order.concept(product.name));
      await this.o.charges.saveCharge(charge);
    }
    await this.o.orders.saveOrder(order);
  }

  async place(id: string, priceCents: number): Promise<void> {
    const order = await this.o.order(id);
    const product = await this.o.product(order.product);
    await this.o.place(order, product, Money.cents(priceCents));
    await this.o.orders.saveOrder(order);
  }

  /** Corrige el precio mientras su cobro no tenga nada cobrado. */
  async changePrice(id: string, priceCents: number): Promise<void> {
    const order = await this.o.order(id);
    const charge = await this.o.charge(order);
    if (charge === null) throw new InvalidValue('id', 'El pedido aún no tiene precio.');
    if ((await this.o.covered(charge)).cents > 0) {
      throw new InvalidValue('priceCents', 'Ya tiene algo cobrado: el precio no se puede cambiar.');
    }
    const price = Money.cents(priceCents);
    const product = await this.o.product(order.product);
    order.changePrice(price);
    charge.changePrice(price, order.concept(product.name));
    await this.o.charges.saveCharge(charge);
    await this.o.orders.saveOrder(order);
  }

  async deliver(id: string, date: string | null): Promise<void> {
    const order = await this.o.order(id);
    const today = this.o.today();
    order.deliver(
      date === null || date === '' ? today : LocalDate.fromString(date),
      today,
      await this.o.available(order.product, order.selection.variantKey),
    );
    await this.o.orders.saveOrder(order);
  }

  async undoDelivery(id: string): Promise<void> {
    const order = await this.o.order(id);
    order.undoDelivery();
    await this.o.orders.saveOrder(order);
  }

  /**
   * Anula el pedido: su cobro se cancela en lo pendiente (lo cobrado se conserva). Un pedido pagado entero no se
   * cancela.
   */
  async cancel(id: string, returnToStock: boolean): Promise<void> {
    const order = await this.o.order(id);
    const today = this.o.today();
    const charge = await this.o.charge(order);
    if (charge !== null && charge.amount.cents > 0) {
      const covered = await this.o.covered(charge);
      if (covered.cents >= charge.amount.cents) {
        throw new InvalidValue('id', 'El pedido ya está pagado entero: no se puede cancelar.');
      }
      charge.cancel(covered, today);
    }
    order.cancel(today, returnToStock);
    if (charge !== null) await this.o.charges.saveCharge(charge);
    await this.o.orders.saveOrder(order);
  }

  /** Vuelve a deberse entero. */
  async reactivate(id: string): Promise<void> {
    const order = await this.o.order(id);
    order.reactivate();
    const charge = await this.o.charge(order);
    if (charge !== null && charge.cancelledOn() !== null) {
      charge.reactivate();
      await this.o.charges.saveCharge(charge);
    }
    await this.o.orders.saveOrder(order);
  }
}

// ---- Compras ---------------------------------------------------------------------------------

export interface PurchaseInput {
  productId: string;
  date: string;
  costCents: number;
  note: string | null;
  lines: { values: Record<string, string>; quantity: number }[];
}

export class ManagePurchases {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly products: ProductRepository,
    private readonly stock: StockLedger,
    private readonly clock: Clock,
  ) {}

  async register(input: PurchaseInput): Promise<string> {
    const product = await this.product(input.productId);
    const purchase = Purchase.register({
      id: PurchaseId.generate(),
      product,
      boughtOn: LocalDate.fromString(input.date),
      cost: Money.cents(input.costCents),
      lines: input.lines,
      note: input.note,
      today: LocalDate.fromInstant(this.clock.now()),
    });
    await this.purchases.savePurchase(purchase);
    return purchase.id.value;
  }

  /** Corrige una compra si no deja ninguna variante con menos unidades de las ya entregadas. */
  async update(id: string, input: Omit<PurchaseInput, 'productId'>): Promise<void> {
    const purchase = await this.purchase(id);
    const product = await this.product(purchase.product.value);
    const before = new Map(purchase.lines.map((l) => [l.selection.variantKey, l.quantity]));
    purchase.update({
      product,
      boughtOn: LocalDate.fromString(input.date),
      cost: Money.cents(input.costCents),
      lines: input.lines,
      note: input.note,
      today: LocalDate.fromInstant(this.clock.now()),
    });
    const after = new Map(purchase.lines.map((l) => [l.selection.variantKey, l.quantity]));
    await this.guardStock(product, before, after);
    await this.purchases.savePurchase(purchase);
  }

  async delete(id: string): Promise<void> {
    const purchase = await this.purchase(id);
    const product = await this.product(purchase.product.value);
    await this.guardStock(
      product,
      new Map(purchase.lines.map((l) => [l.selection.variantKey, l.quantity])),
      new Map(),
    );
    await this.purchases.deletePurchase(purchase.id);
  }

  private async guardStock(
    product: Product,
    before: Map<string, number>,
    after: Map<string, number>,
  ): Promise<void> {
    const variants = await this.stock.variants(product.id);
    for (const [key, quantity] of before) {
      const variant = variants.get(key) ?? { bought: 0, taken: 0 };
      const left = variant.bought - quantity + (after.get(key) ?? 0) - variant.taken;
      if (left < 0) {
        const label = product.variant(Object.fromEntries(JSON.parse(key) as [string, string][]))
          .variantLabel;
        throw new InvalidValue(
          'lines',
          `${
            label || product.name
          }: ya se han entregado más unidades de las que quedarían compradas.`,
        );
      }
    }
  }

  private async product(id: string): Promise<Product> {
    const product = await this.products.product(ProductId.fromString(id));
    if (product === null) throw new ProductNotFound();
    return product;
  }

  private async purchase(id: string): Promise<Purchase> {
    const purchase = await this.purchases.purchase(PurchaseId.fromString(id));
    if (purchase === null) throw new PurchaseNotFound();
    return purchase;
  }
}

// ---- Consultas -------------------------------------------------------------------------------

export class EquipmentReports {
  constructor(private readonly query: EquipmentQuery) {}

  /** Stock por producto y variante, con lo que falta comprar para entregar lo apuntado. */
  async stock(): Promise<StockView[]> {
    const catalogue = new Map((await this.query.products()).map((p) => [p.id, p]));
    const products = new Map<string, StockView>();
    for (const row of await this.query.stock()) {
      const product = products.get(row.productId) ?? {
        productId: row.productId,
        productName: row.productName,
        active: row.active,
        variants: [],
      };
      const inStock = row.bought - row.delivered;
      product.variants.push({
        variantKey: row.variantKey,
        variantLabel: row.variantLabel,
        bought: row.bought,
        delivered: row.delivered,
        inStock,
        awaiting: row.awaiting,
        toBuy: Math.max(0, row.awaiting - inStock),
      });
      products.set(row.productId, product);
    }
    // Las variantes en el orden de las opciones del producto (8, 10, 12…), no alfabético.
    const position = (productId: string, key: string): number[] => {
      const fields = catalogue.get(productId)?.fields ?? [];
      const values = new Map(JSON.parse(key) as [string, string][]);
      return fields.filter((f) => f.kind === 'options').map((f) =>
        f.options.indexOf(values.get(f.id) ?? '')
      );
    };
    for (const product of products.values()) {
      product.variants.sort((a, b) => {
        const pa = position(product.productId, a.variantKey);
        const pb = position(product.productId, b.variantKey);
        const diff = pa.findIndex((v, i) => v !== pb[i]);
        return diff === -1 ? 0 : (pa[diff] ?? 0) - (pb[diff] ?? 0);
      });
    }
    return [...products.values()];
  }

  /** Margen por producto con el coste medio, y los totales de lo comprado frente a lo vendido. */
  async margins(): Promise<
    {
      products: MarginView[];
      totals: Omit<
        MarginView,
        'productId' | 'productName' | 'averageCostCents' | 'marginPerUnitCents'
      >;
    }
  > {
    const products = (await this.query.sales()).map((s) => {
      const margin = new ProductMargin(
        s.unitsBought,
        Money.cents(s.spentCents),
        s.unitsSold,
        Money.cents(s.revenueCents),
      );
      return {
        ...s,
        averageCostCents: margin.averageCost?.cents ?? null,
        marginCents: margin.margin?.cents ?? null,
        marginPerUnitCents: margin.marginPerUnit?.cents ?? null,
      };
    });
    const sum = (pick: (m: MarginView) => number) => products.reduce((t, m) => t + pick(m), 0);
    return {
      products,
      totals: {
        unitsBought: sum((m) => m.unitsBought),
        spentCents: sum((m) => m.spentCents),
        unitsSold: sum((m) => m.unitsSold),
        revenueCents: sum((m) => m.revenueCents),
        collectedCents: sum((m) => m.collectedCents),
        marginCents: products.some((m) => m.marginCents !== null)
          ? sum((m) => m.marginCents ?? 0)
          : null,
      },
    };
  }
}

export function orderStateFromName(name: string): OrderState {
  if (!['reserved', 'ordered', 'paid', 'cancelled'].includes(name)) {
    throw new InvalidValue('status', 'Estado desconocido.');
  }
  return name as OrderState;
}
