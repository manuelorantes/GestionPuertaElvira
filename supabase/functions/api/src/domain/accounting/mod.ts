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
  | 'other_expenses'
  | 'fees'
  | 'membership'
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
  other_expenses: { kind: 'expense', label: 'Otros gastos' },
  fees: { kind: 'income', label: 'Cuotas' },
  membership: { kind: 'income', label: 'Cuota de socio' },
  grants: { kind: 'income', label: 'Subvenciones' },
  tournament_income: { kind: 'income', label: 'Torneos' },
  other_income: { kind: 'income', label: 'Otros ingresos' },
};

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

/** Ingreso o gasto anotado a mano (subvención, venta de material, comisión del banco…). */
export class ManualEntry {
  private constructor(
    readonly id: ManualEntryId,
    readonly date: LocalDate,
    readonly kind: EntryKind,
    readonly concept: string,
    readonly category: LedgerCategory,
    readonly method: Method,
    readonly amount: Money,
  ) {}

  static record(
    id: ManualEntryId,
    date: LocalDate,
    kind: EntryKind,
    concept: string,
    category: LedgerCategory,
    method: Method,
    amount: Money,
  ): ManualEntry {
    if (concept.trim() === '') throw new InvalidValue('concept', 'Indica el concepto.');
    if (amount.cents <= 0) throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
    if (categoryKind(category) !== kind) {
      throw new InvalidValue(
        'category',
        `La categoría no corresponde a un ${kind === 'income' ? 'ingreso' : 'gasto'}.`,
      );
    }
    return new ManualEntry(id, date, kind, concept.trim(), category, method, amount);
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

/** Factura de un proveedor del club, pendiente o pagada, con su documento. */
export class SupplierInvoice {
  private constructor(
    readonly id: SupplierInvoiceId,
    readonly date: LocalDate,
    readonly number: string,
    readonly supplier: string,
    readonly concept: string,
    readonly category: LedgerCategory,
    readonly amount: Money,
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
    category: LedgerCategory,
    amount: Money,
  ): SupplierInvoice {
    if (supplier.trim() === '' || concept.trim() === '') {
      throw new InvalidValue('supplier', 'Indica el proveedor y el concepto.');
    }
    if (categoryKind(category) !== 'expense') {
      throw new InvalidValue('category', 'Una factura de proveedor es un gasto.');
    }
    if (amount.cents <= 0) throw new InvalidValue('amount', 'El importe debe ser mayor que cero.');
    return new SupplierInvoice(
      id,
      date,
      number.trim(),
      supplier.trim(),
      concept.trim(),
      category,
      amount,
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
    category: LedgerCategory;
    amount: Money;
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
      fields.paidOn,
      fields.method,
      fields.attachment,
    );
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
