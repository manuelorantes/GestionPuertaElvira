import { InvalidValue, LocalDate, type Money, Uuid, YearMonth } from '../common/mod.ts';

export class ManualEntryId extends Uuid {}
export class SupplierInvoiceId extends Uuid {}

export type EntryKind = 'income' | 'expense';

export type Method = 'cash' | 'transfer' | 'card';

export function methodFromName(name: string): Method {
  if (name !== 'cash' && name !== 'transfer' && name !== 'card') {
    throw new InvalidValue('method', 'Forma de pago desconocida.');
  }
  return name;
}

export function methodLabel(method: Method): string {
  return { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' }[method];
}

export type LedgerCategory =
  | 'teachers'
  | 'rent'
  | 'material'
  | 'federation'
  | 'tournaments'
  | 'utilities'
  | 'president'
  | 'cleaning'
  | 'water'
  | 'electricity'
  | 'internet'
  | 'other_expenses'
  | 'fees'
  | 'membership'
  | 'material_sales'
  | 'grants'
  | 'tournament_income'
  | 'other_income';

const CATEGORIES: Record<LedgerCategory, { kind: EntryKind; label: string }> = {
  teachers: { kind: 'expense', label: 'Profesores' },
  rent: { kind: 'expense', label: 'Alquiler' },
  material: { kind: 'expense', label: 'Material' },
  federation: { kind: 'expense', label: 'Federación' },
  tournaments: { kind: 'expense', label: 'Torneos' },
  utilities: { kind: 'expense', label: 'Suministros' },
  president: { kind: 'expense', label: 'Presidente' },
  cleaning: { kind: 'expense', label: 'Limpieza' },
  water: { kind: 'expense', label: 'Agua' },
  electricity: { kind: 'expense', label: 'Electricidad' },
  internet: { kind: 'expense', label: 'Wifi' },
  other_expenses: { kind: 'expense', label: 'Otros gastos' },
  fees: { kind: 'income', label: 'Cuotas' },
  membership: { kind: 'income', label: 'Cuota de socio' },
  material_sales: { kind: 'income', label: 'Venta de material' },
  grants: { kind: 'income', label: 'Subvenciones' },
  tournament_income: { kind: 'income', label: 'Torneos' },
  other_income: { kind: 'income', label: 'Otros ingresos' },
};

/** Una categoría del libro: de serie o creada por el club (`custom`). */
export interface Category {
  code: string;
  kind: EntryKind;
  label: string;
  custom: boolean;
}

/**
 * Las categorías del libro: las de serie, que no cambian, y las que crea el club, que se pueden renombrar. Sin nombres
 * repetidos dentro de los ingresos ni dentro de los gastos.
 */
export class CategoryCatalog {
  private static readonly MAX_LABEL = 40;

  private constructor(private readonly custom: Category[]) {}

  static of(custom: readonly Category[]): CategoryCatalog {
    return new CategoryCatalog(custom.map((c) => ({ ...c, custom: true })));
  }

  /** De serie primero y las del club después, cada tipo con su orden. */
  all(): Category[] {
    const builtIn = (Object.keys(CATEGORIES) as LedgerCategory[]).map((code) => ({
      code,
      kind: CATEGORIES[code].kind,
      label: CATEGORIES[code].label,
      custom: false,
    }));
    return [...builtIn, ...this.custom];
  }

  find(code: string): Category | null {
    return this.all().find((c) => c.code === code) ?? null;
  }

  /** La categoría, que debe existir (y ser de ese tipo, si se indica). */
  require(code: string, kind?: EntryKind): Category {
    const category = this.find(code);
    if (category === null) throw new InvalidValue('category', 'Categoría desconocida.');
    if (kind !== undefined && category.kind !== kind) {
      throw new InvalidValue(
        'category',
        `La categoría no corresponde a un ${kind === 'income' ? 'ingreso' : 'gasto'}.`,
      );
    }
    return category;
  }

  label(code: string): string {
    return this.find(code)?.label ?? code;
  }

  add(code: string, kind: EntryKind, label: string): Category {
    const category = { code, kind, label: this.checkedLabel(kind, label, null), custom: true };
    this.custom.push(category);
    return { ...category };
  }

  rename(code: string, label: string): Category {
    const category = this.custom.find((c) => c.code === code);
    if (!category) {
      throw new InvalidValue(
        'category',
        'Solo se pueden renombrar las categorías creadas por el club.',
      );
    }
    category.label = this.checkedLabel(category.kind, label, code);
    return { ...category };
  }

  private checkedLabel(kind: EntryKind, label: string, except: string | null): string {
    const clean = label.replace(/\s+/gu, ' ').trim();
    if (clean === '' || clean.length > CategoryCatalog.MAX_LABEL) {
      throw new InvalidValue('label', 'Indica un nombre de hasta 40 caracteres.');
    }
    const same = (a: string) => a.toLocaleLowerCase('es') === clean.toLocaleLowerCase('es');
    if (this.all().some((c) => c.kind === kind && c.code !== except && same(c.label))) {
      throw new InvalidValue('label', 'Ya hay una categoría con ese nombre.');
    }
    return clean;
  }
}

export function categoryFromName(name: string): LedgerCategory {
  if (!(name in CATEGORIES)) throw new InvalidValue('category', 'Categoría desconocida.');
  return name as LedgerCategory;
}

export function categoryKind(category: LedgerCategory): EntryKind {
  return CATEGORIES[category].kind;
}

export function categoryLabel(category: LedgerCategory): string {
  return CATEGORIES[category].label;
}

/**
 * Categorías que cuentan como ingresos y gastos «del mes» (lo que corresponde a cada mes en el resumen): por defecto, las
 * cuotas y los gastos fijos del club.
 */
export class MonthlyCategories {
  private static readonly DEFAULTS: readonly LedgerCategory[] = [
    'fees',
    'teachers',
    'president',
    'rent',
    'cleaning',
    'water',
    'electricity',
    'internet',
  ];

  private constructor(private readonly chosen: ReadonlySet<string>) {}

  static defaults(): MonthlyCategories {
    return new MonthlyCategories(new Set(MonthlyCategories.DEFAULTS));
  }

  /** Las elegidas, que deben existir. */
  static of(codes: readonly string[], catalog: CategoryCatalog): MonthlyCategories {
    return new MonthlyCategories(new Set(codes.map((c) => catalog.require(c).code)));
  }

  /** Tal como se guardaron. */
  static restore(codes: readonly string[]): MonthlyCategories {
    return new MonthlyCategories(new Set(codes));
  }

  includes(category: string): boolean {
    return this.chosen.has(category);
  }

  /** En el orden de las categorías (las que ya no existen, fuera). */
  list(catalog: CategoryCatalog): string[] {
    return catalog.all().map((c) => c.code).filter((c) => this.chosen.has(c));
  }
}

/** Ejercicio contable del club: de septiembre a agosto. */
export class FiscalYear {
  constructor(readonly startYear: number) {}

  static of(date: LocalDate): FiscalYear {
    return FiscalYear.ofMonth(YearMonth.of(date));
  }

  static ofMonth(month: YearMonth): FiscalYear {
    return new FiscalYear(month.month >= 9 ? month.year : month.year - 1);
  }

  /** De septiembre a agosto. */
  months(): YearMonth[] {
    const months: YearMonth[] = [];
    let month = this.firstMonth();
    for (let i = 0; i < 12; i++, month = month.next()) months.push(month);
    return months;
  }

  firstMonth(): YearMonth {
    return YearMonth.fromString(`${String(this.startYear).padStart(4, '0')}-09`);
  }

  lastMonth(): YearMonth {
    return YearMonth.fromString(`${String(this.startYear + 1).padStart(4, '0')}-08`);
  }

  includes(date: LocalDate): boolean {
    return FiscalYear.of(date).equals(this);
  }

  previous(): FiscalYear {
    return new FiscalYear(this.startYear - 1);
  }

  equals(other: FiscalYear): boolean {
    return this.startYear === other.startYear;
  }

  label(): string {
    return `${this.startYear}/${String((this.startYear + 1) % 100).padStart(2, '0')}`;
  }
}

/**
 * Ingreso o gasto anotado a mano (subvención, venta de material, comisión del banco…). `period` es el mes al que
 * corresponde (la luz de septiembre pagada en octubre); por defecto, el de su fecha.
 */
export class ManualEntry {
  private constructor(
    readonly id: ManualEntryId,
    readonly date: LocalDate,
    readonly kind: EntryKind,
    readonly concept: string,
    readonly category: string,
    readonly method: Method,
    readonly amount: Money,
    readonly period: YearMonth,
  ) {}

  static record(
    id: ManualEntryId,
    date: LocalDate,
    kind: EntryKind,
    concept: string,
    category: Category,
    method: Method,
    amount: Money,
    period: YearMonth | null = null,
  ): ManualEntry {
    if (concept.trim() === '') throw new InvalidValue('concept', 'Indica el concepto.');
    if (amount.cents <= 0) throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
    if (category.kind !== kind) {
      throw new InvalidValue(
        'category',
        `La categoría no corresponde a un ${kind === 'income' ? 'ingreso' : 'gasto'}.`,
      );
    }
    return new ManualEntry(
      id,
      date,
      kind,
      concept.trim(),
      category.code,
      method,
      amount,
      period ?? YearMonth.of(date),
    );
  }

  /** El mismo apunte con otros datos (la fecha y el tipo no cambian). */
  revise(
    concept: string,
    category: Category,
    method: Method,
    amount: Money,
    period: YearMonth,
  ): ManualEntry {
    return ManualEntry.record(
      this.id,
      this.date,
      this.kind,
      concept,
      category,
      method,
      amount,
      period,
    );
  }

  static restore(fields: {
    id: ManualEntryId;
    date: LocalDate;
    kind: EntryKind;
    concept: string;
    category: string;
    method: Method;
    amount: Money;
    period: YearMonth | null;
  }): ManualEntry {
    return new ManualEntry(
      fields.id,
      fields.date,
      fields.kind,
      fields.concept,
      fields.category,
      fields.method,
      fields.amount,
      fields.period ?? YearMonth.of(fields.date),
    );
  }
}

export class InvoiceAlreadyPaid extends Error {
  constructor() {
    super('Esa factura ya está pagada.');
    this.name = 'InvoiceAlreadyPaid';
  }
}

/** Documento adjunto a una factura: PDF o foto de hasta 10 MB. */
export class Attachment {
  static readonly MAX_BYTES = 10 * 1024 * 1024;
  static readonly TYPES: readonly string[] = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  constructor(
    readonly key: string,
    readonly originalName: string,
    readonly mimeType: string,
    readonly bytes: number,
  ) {
    if (!Attachment.TYPES.includes(mimeType)) {
      throw new InvalidValue('file', 'El documento debe ser un PDF o una foto (JPG, PNG o WEBP).');
    }
    if (bytes <= 0 || bytes > Attachment.MAX_BYTES) {
      throw new InvalidValue('file', 'El documento no puede superar los 10 MB.');
    }
  }
}

/**
 * Factura de un proveedor del club, pendiente o pagada, con su documento. `period` es el mes al que corresponde; por
 * defecto, el de la factura.
 */
export class SupplierInvoice {
  private constructor(
    readonly id: SupplierInvoiceId,
    readonly date: LocalDate,
    readonly number: string,
    readonly supplier: string,
    private currentConcept: string,
    private currentCategory: string,
    private currentAmount: Money,
    private currentPeriod: YearMonth,
    private paid: LocalDate | null,
    private paymentMethod: Method | null,
    private document: Attachment | null,
  ) {}

  static register(
    id: SupplierInvoiceId,
    date: LocalDate,
    number: string,
    supplier: string,
    concept: string,
    category: Category,
    amount: Money,
    period: YearMonth | null = null,
  ): SupplierInvoice {
    if (supplier.trim() === '' || concept.trim() === '') {
      throw new InvalidValue('supplier', 'Indica el proveedor y el concepto.');
    }
    if (category.kind !== 'expense') {
      throw new InvalidValue('category', 'Una factura de proveedor es un gasto.');
    }
    if (amount.cents <= 0) throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
    return new SupplierInvoice(
      id,
      date,
      number.trim(),
      supplier.trim(),
      concept.trim(),
      category.code,
      amount,
      period ?? YearMonth.of(date),
      null,
      null,
      null,
    );
  }

  static restore(fields: {
    id: SupplierInvoiceId;
    date: LocalDate;
    number: string;
    supplier: string;
    concept: string;
    category: string;
    amount: Money;
    period: YearMonth | null;
    paidOn: LocalDate | null;
    method: Method | null;
    attachment: Attachment | null;
  }): SupplierInvoice {
    return new SupplierInvoice(
      fields.id,
      fields.date,
      fields.number,
      fields.supplier,
      fields.concept,
      fields.category,
      fields.amount,
      fields.period ?? YearMonth.of(fields.date),
      fields.paidOn,
      fields.method,
      fields.attachment,
    );
  }

  get concept(): string {
    return this.currentConcept;
  }

  get category(): string {
    return this.currentCategory;
  }

  get amount(): Money {
    return this.currentAmount;
  }

  get period(): YearMonth {
    return this.currentPeriod;
  }

  /** Corrige sus datos; la forma de pago, solo si ya está pagada. */
  revise(
    concept: string,
    category: Category,
    amount: Money,
    period: YearMonth,
    method: Method | null,
  ): void {
    if (concept.trim() === '') throw new InvalidValue('concept', 'Indica el concepto.');
    if (category.kind !== 'expense') {
      throw new InvalidValue('category', 'Una factura de proveedor es un gasto.');
    }
    if (amount.cents <= 0) throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
    this.currentConcept = concept.trim();
    this.currentCategory = category.code;
    this.currentAmount = amount;
    this.currentPeriod = period;
    if (this.paid !== null && method !== null) this.paymentMethod = method;
  }

  pay(on: LocalDate, method: Method): void {
    if (this.paid !== null) throw new InvoiceAlreadyPaid();
    this.paid = on;
    this.paymentMethod = method;
  }

  /** Devuelve el documento anterior, si lo había. */
  attach(attachment: Attachment): Attachment | null {
    const previous = this.document;
    this.document = attachment;
    return previous;
  }

  isPaid(): boolean {
    return this.paid !== null;
  }

  paidOn(): LocalDate | null {
    return this.paid;
  }

  method(): Method | null {
    return this.paymentMethod;
  }

  attachment(): Attachment | null {
    return this.document;
  }
}

/**
 * Corrección en contabilidad de un movimiento que viene de otra sección (un cobro, una liquidación, un anticipo): cambia
 * cómo sale en el libro, no el cobro ni la nómina. `method` null: la del movimiento.
 */
export class LedgerCorrection {
  private constructor(
    readonly source: string,
    readonly sourceId: string,
    readonly concept: string,
    readonly category: string,
    readonly method: Method | null,
    readonly amount: Money,
    readonly period: YearMonth,
  ) {}

  static of(
    source: string,
    sourceId: string,
    kind: EntryKind,
    concept: string,
    category: Category,
    method: Method | null,
    amount: Money,
    period: YearMonth,
  ): LedgerCorrection {
    if (concept.trim() === '') throw new InvalidValue('concept', 'Indica el concepto.');
    if (amount.cents <= 0) throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
    if (category.kind !== kind) {
      throw new InvalidValue(
        'category',
        `La categoría no corresponde a un ${kind === 'income' ? 'ingreso' : 'gasto'}.`,
      );
    }
    return new LedgerCorrection(
      source,
      sourceId,
      concept.trim(),
      category.code,
      method,
      amount,
      period,
    );
  }
}

/** Cierre de un ejercicio: congela ingresos, gastos y resultado, que pasa como saldo inicial del siguiente. */
export class SeasonClosing {
  private constructor(
    readonly year: FiscalYear,
    readonly income: Money,
    readonly expenses: Money,
    readonly closedOn: LocalDate,
  ) {}

  static close(
    year: FiscalYear,
    income: Money,
    expenses: Money,
    closedOn: LocalDate,
  ): SeasonClosing {
    return new SeasonClosing(year, income, expenses, closedOn);
  }

  result(): Money {
    return this.income.minus(this.expenses);
  }
}
