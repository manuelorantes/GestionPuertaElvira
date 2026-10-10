import {
  generateUuidV7,
  type HasErrorDetails,
  InvalidValue,
  type LocalDate,
  Money,
  roundHalfAwayFromZero,
  Uuid,
} from '../common/mod.ts';

export class ProductId extends Uuid {}
export class OrderId extends Uuid {}
export class PurchaseId extends Uuid {}
export class StudentRef extends Uuid {}
/** La cuota de Cobros que generó el pedido. */
export class ChargeRef extends Uuid {}

/** `options`: lista cerrada y obligatoria (define la variante y el stock); `text`: texto libre y opcional. */
export type FieldKind = 'options' | 'text';

const MAX_NAME = 60;
const MAX_TEXT = 60;
const MAX_NOTE = 300;

function trimmed(value: string, max: number): string {
  return [...value.trim()].slice(0, max).join('');
}

/** Campo de un producto (p. ej. «Talla» con sus opciones o «Nombre a estampar»). */
export class ProductField {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly kind: FieldKind,
    readonly options: readonly string[],
  ) {}

  /** Sin `id`, es un campo nuevo. */
  static of(
    input: { id?: string | null; name: string; kind: string; options?: string[] },
  ): ProductField {
    const name = trimmed(input.name, MAX_NAME);
    if (name === '') throw new InvalidValue('fields', 'Cada campo necesita un nombre.');
    if (input.kind !== 'options' && input.kind !== 'text') {
      throw new InvalidValue('fields', 'Un campo es de lista o de texto.');
    }
    const options = input.kind === 'options'
      ? (input.options ?? []).map((o) => trimmed(o, MAX_TEXT)).filter((o) => o !== '')
      : [];
    if (input.kind === 'options' && options.length === 0) {
      throw new InvalidValue('fields', `«${name}» necesita al menos una opción.`);
    }
    if (new Set(options.map((o) => o.toLocaleLowerCase('es'))).size !== options.length) {
      throw new InvalidValue('fields', `«${name}» tiene opciones repetidas.`);
    }
    const id = input.id && input.id.trim() !== '' ? input.id.trim() : generateUuidV7();
    return new ProductField(id, name, input.kind, options);
  }
}

/**
 * Lo elegido en un pedido o en una línea de compra: los valores por id de campo, la variante (los campos de lista) y
 * cómo se describe.
 */
export class Selection {
  constructor(
    readonly values: Readonly<Record<string, string>>,
    /** JSON canónico de los valores de los campos de lista: identifica la variante para el stock. */
    readonly variantKey: string,
    /** «Talla 10 · Color azul» (vacío si el producto no tiene campos de lista). */
    readonly variantLabel: string,
    /** Todo lo elegido: la variante y los textos («Talla 10 · Nombre a estampar: Pepe»). */
    readonly detail: string,
  ) {}
}

/** Un producto de material: nombre, precio de venta por defecto y sus campos, definidos desde la aplicación. */
export class Product {
  private constructor(
    readonly id: ProductId,
    private title: string,
    private salePrice: Money,
    private fieldList: readonly ProductField[],
    private offered: boolean,
  ) {}

  static create(id: ProductId, name: string, price: Money, fields: ProductField[]): Product {
    const product = new Product(id, '', Money.zero(), [], true);
    product.update(name, price, fields, true, new Set());
    return product;
  }

  static restore(
    id: ProductId,
    name: string,
    price: Money,
    fields: ProductField[],
    active: boolean,
  ): Product {
    return new Product(id, name, price, fields, active);
  }

  /**
   * `inUse`: las opciones que ya usan pedidos o compras («idCampo=opción»); no se pueden quitar ni dejar sin su campo de
   * lista.
   */
  update(
    name: string,
    price: Money,
    fields: ProductField[],
    active: boolean,
    inUse: ReadonlySet<string>,
  ): void {
    const title = trimmed(name, MAX_NAME);
    if (title === '') throw new InvalidValue('name', 'Indica el nombre del producto.');
    if (price.isNegative()) throw new InvalidValue('price', 'El precio no puede ser negativo.');
    const names = fields.map((f) => f.name.toLocaleLowerCase('es'));
    if (new Set(names).size !== names.length) {
      throw new InvalidValue('fields', 'Hay dos campos con el mismo nombre.');
    }
    if (new Set(fields.map((f) => f.id)).size !== fields.length) {
      throw new InvalidValue('fields', 'Hay dos campos iguales.');
    }
    const kept = new Set(
      fields.filter((f) => f.kind === 'options').flatMap((f) =>
        f.options.map((o) => `${f.id}=${o}`)
      ),
    );
    const removed = [...inUse].find((used) => !kept.has(used));
    if (removed !== undefined) {
      const [fieldId, option] = removed.split(/=(.*)/s);
      const field = this.fieldList.find((f) => f.id === fieldId);
      throw new InvalidValue(
        'fields',
        `No se puede quitar «${option}»${
          field ? ` de «${field.name}»` : ''
        }: hay pedidos o compras con esa opción.`,
      );
    }
    this.title = title;
    this.salePrice = price;
    this.fieldList = fields;
    this.offered = active;
  }

  get name(): string {
    return this.title;
  }

  get price(): Money {
    return this.salePrice;
  }

  get fields(): readonly ProductField[] {
    return this.fieldList;
  }

  isActive(): boolean {
    return this.offered;
  }

  /** Lo elegido en un pedido: una opción de cada campo de lista y, si se quiere, los textos. */
  select(values: Readonly<Record<string, string>>): Selection {
    return this.selection(values, true);
  }

  /** La variante de una línea de compra: solo los campos de lista. */
  variant(values: Readonly<Record<string, string>>): Selection {
    return this.selection(values, false);
  }

  private selection(values: Readonly<Record<string, string>>, withText: boolean): Selection {
    const chosen: Record<string, string> = {};
    const variant: [string, string][] = [];
    const variantParts: string[] = [];
    const textParts: string[] = [];
    for (const field of this.fieldList) {
      const raw = (values[field.id] ?? '').trim();
      if (field.kind === 'options') {
        if (!field.options.includes(raw)) {
          throw new InvalidValue('values', `Elige ${field.name.toLocaleLowerCase('es')}.`);
        }
        chosen[field.id] = raw;
        variant.push([field.id, raw]);
        variantParts.push(`${field.name} ${raw}`);
      } else if (withText) {
        const text = trimmed(raw, MAX_TEXT);
        if (text !== '') {
          chosen[field.id] = text;
          textParts.push(`${field.name}: ${text}`);
        }
      }
    }
    variant.sort(([a], [b]) => a.localeCompare(b));
    return new Selection(
      chosen,
      JSON.stringify(variant),
      variantParts.join(' · '),
      [...variantParts, ...textParts].join(' · '),
    );
  }
}

function quantityOf(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new InvalidValue('quantity', 'La cantidad debe ser un número entero de 1 en adelante.');
  }
  return quantity;
}

function noteOf(note: string | null): string | null {
  if (note === null) return null;
  const text = trimmed(note, MAX_NOTE);
  return text === '' ? null : text;
}

export class NotEnoughStock extends Error implements HasErrorDetails {
  constructor(readonly available: number) {
    super(
      available === 0
        ? 'No queda ninguno de esa variante: registra antes la compra.'
        : `Solo quedan ${available} de esa variante: registra antes la compra.`,
    );
    this.name = 'NotEnoughStock';
  }

  details(): Record<string, number> {
    return { available: this.available };
  }
}

/** Reservado (sin precio), pedido (con precio y cobro) o cancelado. «Pagado» sale de que su cobro esté cubierto. */
export type OrderStatus = 'reserved' | 'ordered' | 'cancelled';

/** Pedido de un producto para un alumno. */
export class Order {
  private constructor(
    readonly id: OrderId,
    readonly student: StudentRef,
    readonly product: ProductId,
    private units: number,
    private chosen: Selection,
    private remark: string | null,
    private state: OrderStatus,
    private agreed: Money | null,
    private chargeRef: ChargeRef | null,
    readonly createdOn: LocalDate,
    private orderedDay: LocalDate | null,
    private deliveredDay: LocalDate | null,
    private cancelledDay: LocalDate | null,
    /** Al cancelarlo entregado: si la unidad volvió al stock. */
    private returned: boolean,
  ) {}

  static reserve(fields: {
    id: OrderId;
    student: StudentRef;
    product: Product;
    quantity: number;
    values: Readonly<Record<string, string>>;
    note: string | null;
    today: LocalDate;
  }): Order {
    if (!fields.product.isActive()) {
      throw new InvalidValue('productId', 'Ese producto ya no se ofrece.');
    }
    return new Order(
      fields.id,
      fields.student,
      fields.product.id,
      quantityOf(fields.quantity),
      fields.product.select(fields.values),
      noteOf(fields.note),
      'reserved',
      null,
      null,
      fields.today,
      null,
      null,
      null,
      false,
    );
  }

  static restore(fields: {
    id: OrderId;
    student: StudentRef;
    product: ProductId;
    quantity: number;
    selection: Selection;
    note: string | null;
    status: OrderStatus;
    price: Money | null;
    charge: ChargeRef | null;
    createdOn: LocalDate;
    orderedOn: LocalDate | null;
    deliveredOn: LocalDate | null;
    cancelledOn: LocalDate | null;
    returnedToStock: boolean;
  }): Order {
    return new Order(
      fields.id,
      fields.student,
      fields.product,
      fields.quantity,
      fields.selection,
      fields.note,
      fields.status,
      fields.price,
      fields.charge,
      fields.createdOn,
      fields.orderedOn,
      fields.deliveredOn,
      fields.cancelledOn,
      fields.returnedToStock,
    );
  }

  /** Corrige la cantidad, los campos o la nota: mientras no esté entregado ni cancelado. */
  edit(
    product: Product,
    quantity: number,
    values: Readonly<Record<string, string>>,
    note: string | null,
  ): void {
    this.mustBeOpen();
    if (this.deliveredDay !== null) {
      throw new InvalidValue('id', 'El pedido ya está entregado: deshaz antes la entrega.');
    }
    this.units = quantityOf(quantity);
    this.chosen = product.select(values);
    this.remark = noteOf(note);
  }

  /** De reservado a pedido: ya tiene precio y su cobro. */
  place(price: Money, charge: ChargeRef, today: LocalDate): void {
    this.mustBeOpen();
    if (this.state !== 'reserved') throw new InvalidValue('id', 'El pedido ya tiene precio.');
    if (price.isNegative()) {
      throw new InvalidValue('priceCents', 'El precio no puede ser negativo.');
    }
    this.state = 'ordered';
    this.agreed = price;
    this.chargeRef = charge;
    this.orderedDay = today;
  }

  /** Corrige el precio (la aplicación comprueba que no tenga nada cobrado). */
  changePrice(price: Money): void {
    this.mustBeOpen();
    if (this.state !== 'ordered') throw new InvalidValue('id', 'El pedido aún no tiene precio.');
    if (price.isNegative()) {
      throw new InvalidValue('priceCents', 'El precio no puede ser negativo.');
    }
    this.agreed = price;
  }

  /** Lo entrega si quedan unidades de su variante (`available`: el stock de esa variante). */
  deliver(on: LocalDate, today: LocalDate, available: number): void {
    this.mustBeOpen();
    if (this.state !== 'ordered') {
      throw new InvalidValue('id', 'Pásalo antes a pedido con su precio.');
    }
    if (this.deliveredDay !== null) throw new InvalidValue('id', 'El pedido ya está entregado.');
    if (today.isBefore(on)) throw new InvalidValue('date', 'La fecha no puede ser futura.');
    if (on.isBefore(this.createdOn)) {
      throw new InvalidValue('date', 'La fecha no puede ser anterior al pedido.');
    }
    if (available < this.units) throw new NotEnoughStock(Math.max(0, available));
    this.deliveredDay = on;
  }

  undoDelivery(): void {
    this.mustBeOpen();
    if (this.deliveredDay === null) throw new InvalidValue('id', 'El pedido no está entregado.');
    this.deliveredDay = null;
  }

  /** Lo anula; si estaba entregado, `returnToStock` dice si la unidad vuelve al stock. */
  cancel(today: LocalDate, returnToStock: boolean): void {
    this.mustBeOpen();
    this.state = 'cancelled';
    this.cancelledDay = today;
    this.returned = this.deliveredDay !== null && returnToStock;
  }

  /** Vuelve a estar pedido (si tenía precio) o reservado. */
  reactivate(): void {
    if (this.state !== 'cancelled') throw new InvalidValue('id', 'El pedido no está cancelado.');
    this.state = this.agreed === null ? 'reserved' : 'ordered';
    this.cancelledDay = null;
    this.returned = false;
  }

  private mustBeOpen(): void {
    if (this.state === 'cancelled') throw new InvalidValue('id', 'El pedido está cancelado.');
  }

  /** Concepto del cobro y del recibo: «2 × Chándal · Talla 10». */
  concept(productName: string): string {
    const what = [productName, this.chosen.detail].filter((p) => p !== '').join(' · ');
    return this.units > 1 ? `${this.units} × ${what}` : what;
  }

  /** Si cuenta como entregado para el stock (cancelado y devuelto, no). */
  takesStock(): boolean {
    return this.deliveredDay !== null && !this.returned;
  }

  get quantity(): number {
    return this.units;
  }

  get selection(): Selection {
    return this.chosen;
  }

  get status(): OrderStatus {
    return this.state;
  }

  get price(): Money | null {
    return this.agreed;
  }

  get charge(): ChargeRef | null {
    return this.chargeRef;
  }

  note(): string | null {
    return this.remark;
  }

  orderedOn(): LocalDate | null {
    return this.orderedDay;
  }

  deliveredOn(): LocalDate | null {
    return this.deliveredDay;
  }

  cancelledOn(): LocalDate | null {
    return this.cancelledDay;
  }

  returnedToStock(): boolean {
    return this.returned;
  }
}

export class PurchaseLine {
  constructor(
    readonly selection: Selection,
    readonly quantity: number,
  ) {}
}

/** Compra al proveedor (un lote): un producto, lo que costó entero y cuántas unidades de cada variante. */
export class Purchase {
  private constructor(
    readonly id: PurchaseId,
    readonly product: ProductId,
    private day: LocalDate,
    private total: Money,
    private lineList: readonly PurchaseLine[],
    private remark: string | null,
  ) {}

  static register(fields: {
    id: PurchaseId;
    product: Product;
    boughtOn: LocalDate;
    cost: Money;
    lines: { values: Readonly<Record<string, string>>; quantity: number }[];
    note: string | null;
    today: LocalDate;
  }): Purchase {
    const purchase = new Purchase(
      fields.id,
      fields.product.id,
      fields.boughtOn,
      Money.zero(),
      [],
      null,
    );
    purchase.update(fields);
    return purchase;
  }

  static restore(
    id: PurchaseId,
    product: ProductId,
    boughtOn: LocalDate,
    cost: Money,
    lines: PurchaseLine[],
    note: string | null,
  ): Purchase {
    return new Purchase(id, product, boughtOn, cost, lines, note);
  }

  update(fields: {
    product: Product;
    boughtOn: LocalDate;
    cost: Money;
    lines: { values: Readonly<Record<string, string>>; quantity: number }[];
    note: string | null;
    today: LocalDate;
  }): void {
    if (!fields.product.id.equals(this.product)) {
      throw new InvalidValue('productId', 'Una compra no cambia de producto.');
    }
    if (fields.today.isBefore(fields.boughtOn)) {
      throw new InvalidValue('date', 'La fecha no puede ser futura.');
    }
    if (fields.cost.isNegative()) {
      throw new InvalidValue('costCents', 'El coste no puede ser negativo.');
    }
    const lines = fields.lines.map((l) =>
      new PurchaseLine(fields.product.variant(l.values), quantityOf(l.quantity))
    );
    if (lines.length === 0) throw new InvalidValue('lines', 'Indica cuántas unidades se compran.');
    if (new Set(lines.map((l) => l.selection.variantKey)).size !== lines.length) {
      throw new InvalidValue('lines', 'Hay dos líneas de la misma variante: júntalas.');
    }
    this.day = fields.boughtOn;
    this.total = fields.cost;
    this.lineList = lines;
    this.remark = noteOf(fields.note);
  }

  get boughtOn(): LocalDate {
    return this.day;
  }

  get cost(): Money {
    return this.total;
  }

  get lines(): readonly PurchaseLine[] {
    return this.lineList;
  }

  note(): string | null {
    return this.remark;
  }

  units(): number {
    return this.lineList.reduce((sum, l) => sum + l.quantity, 0);
  }

  /** Unidades de una variante en esta compra. */
  unitsOf(variantKey: string): number {
    return this.lineList.find((l) => l.selection.variantKey === variantKey)?.quantity ?? 0;
  }

  /** Lo que cuesta cada unidad del lote: el total entre sus unidades. */
  unitCost(): Money {
    return Money.cents(roundHalfAwayFromZero(this.total.cents / this.units()));
  }
}

/** Margen de un producto con el coste medio de todo lo comprado. */
export class ProductMargin {
  readonly averageCost: Money | null;
  /** Coste de las unidades vendidas (null si aún no se ha comprado nada). */
  readonly soldCost: Money | null;
  readonly margin: Money | null;
  readonly marginPerUnit: Money | null;

  constructor(
    readonly unitsBought: number,
    readonly spent: Money,
    readonly unitsSold: number,
    readonly revenue: Money,
  ) {
    if (unitsBought === 0) {
      this.averageCost = null;
      this.soldCost = null;
      this.margin = null;
      this.marginPerUnit = null;
      return;
    }
    this.averageCost = Money.cents(roundHalfAwayFromZero(spent.cents / unitsBought));
    this.soldCost = Money.cents(roundHalfAwayFromZero((spent.cents * unitsSold) / unitsBought));
    this.margin = revenue.minus(this.soldCost);
    this.marginPerUnit = unitsSold === 0
      ? null
      : Money.cents(roundHalfAwayFromZero(this.margin.cents / unitsSold));
  }
}
