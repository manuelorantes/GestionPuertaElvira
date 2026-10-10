import {
  type Clock,
  generateUuidV7,
  InvalidValue,
  LocalDate,
  Money,
  YearMonth,
} from '../../domain/common/mod.ts';
import {
  Attachment,
  categoryFromName,
  categoryLabel,
  FiscalYear,
  ManualEntry,
  ManualEntryId,
  methodFromName,
  MonthlyCategories,
  SeasonClosing,
  SupplierInvoice,
  SupplierInvoiceId,
} from '../../domain/accounting/mod.ts';
import { type ClosedPeriods, PeriodClosed } from '../common/mod.ts';

// ---- Puertos ---------------------------------------------------------------------------------

/** Almacén de documentos adjuntos (sistema de ficheros en local; Supabase Storage en producción). */
export interface DocumentStorage {
  put(key: string, contents: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

/** Un movimiento del libro; `source` indica de dónde sale (payment, settlement, invoice, manual). */
export interface LedgerLine {
  source: string;
  sourceId: string;
  date: string;
  kind: string;
  concept: string;
  category: string;
  method: string;
  amountCents: number;
  /** El alumno de un cobro; el resto de movimientos no tiene. */
  studentId: string | null;
  /**
   * Mes al que corresponde («AAAA-MM»): el de la liquidación o anticipo para el profesorado, el elegido en apuntes y
   * facturas y, en los cobros, el del cobro.
   */
  period: string;
}

export interface LedgerQuery {
  /** Movimientos del mes: cobros, liquidaciones pagadas, facturas pagadas y apuntes manuales. */
  lines(month: YearMonth): Promise<LedgerLine[]>;
  /** Los movimientos de varios meses seguidos de una vez (de `from` a `to`, ambos incluidos). */
  linesBetween(from: YearMonth, to: YearMonth): Promise<LedgerLine[]>;
}

/** Ingresos y gastos de cada mes («AAAA-MM») a partir de sus movimientos. */
function totalsByMonth(lines: LedgerLine[]): Map<string, [number, number]> {
  const totals = new Map<string, [number, number]>();
  for (const line of lines) {
    const month = line.date.slice(0, 7);
    const [income, expenses] = totals.get(month) ?? [0, 0];
    totals.set(
      month,
      line.kind === 'income'
        ? [income + line.amountCents, expenses]
        : [income, expenses + line.amountCents],
    );
  }
  return totals;
}

export interface InvoiceView {
  id: string;
  date: string;
  number: string;
  supplier: string;
  concept: string;
  category: string;
  amountCents: number;
  paidOn: string | null;
  method: string | null;
  attachmentName: string | null;
  period: string;
}

export interface InvoiceQuery {
  /** Facturas de proveedores, de la más reciente a la más antigua. */
  all(): Promise<InvoiceView[]>;
}

export interface ManualEntryRepository {
  entry(id: ManualEntryId): Promise<ManualEntry | null>;
  saveEntry(entry: ManualEntry): Promise<void>;
  deleteEntry(id: ManualEntryId): Promise<void>;
}

export interface SupplierInvoiceRepository {
  invoice(id: SupplierInvoiceId): Promise<SupplierInvoice | null>;
  saveInvoice(invoice: SupplierInvoice): Promise<void>;
  deleteInvoice(id: SupplierInvoiceId): Promise<void>;
}

export interface AccountingSettingsRepository {
  monthlyCategories(): Promise<MonthlyCategories>;
  saveMonthlyCategories(categories: MonthlyCategories): Promise<void>;
}

/** Las categorías que cuentan como del mes. */
export class GetMonthlyCategories {
  constructor(private readonly settings: AccountingSettingsRepository) {}

  async execute(): Promise<string[]> {
    return (await this.settings.monthlyCategories()).list();
  }
}

export class SetMonthlyCategories {
  constructor(private readonly settings: AccountingSettingsRepository) {}

  async execute(categories: string[]): Promise<void> {
    await this.settings.saveMonthlyCategories(MonthlyCategories.of(categories));
  }
}

export interface SeasonClosingRepository {
  closing(year: FiscalYear): Promise<SeasonClosing | null>;
  closings(): Promise<SeasonClosing[]>;
  saveClosing(closing: SeasonClosing): Promise<void>;
}

// ---- Errores ---------------------------------------------------------------------------------

export class DocumentNotFound extends Error {
  constructor() {
    super('Esa factura no tiene documento adjunto.');
    this.name = 'DocumentNotFound';
  }
}

export class EntryNotFound extends Error {
  constructor() {
    super('No existe ese movimiento.');
    this.name = 'EntryNotFound';
  }
}

export class SupplierInvoiceNotFound extends Error {
  constructor() {
    super('No existe esa factura.');
    this.name = 'SupplierInvoiceNotFound';
  }
}

export class InvoiceAlreadyPaidCannotBeDeleted extends Error {
  constructor() {
    super('Una factura pagada no se puede borrar.');
    this.name = 'InvoiceAlreadyPaidCannotBeDeleted';
  }
}

export class SeasonAlreadyClosed extends Error {
  constructor() {
    super('Esa temporada ya está cerrada.');
    this.name = 'SeasonAlreadyClosed';
  }
}

export class SeasonNotFinished extends Error {
  constructor() {
    super('La temporada solo se puede cerrar a partir de su último mes (agosto).');
    this.name = 'SeasonNotFinished';
  }
}

export class PreviousSeasonOpen extends Error {
  constructor() {
    super('Antes hay que cerrar la temporada anterior.');
    this.name = 'PreviousSeasonOpen';
  }
}

// ---- Casos de uso ----------------------------------------------------------------------------

export interface UploadedDocument {
  originalName: string;
  mimeType: string;
  contents: Uint8Array;
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Valida y guarda un documento subido, devolviendo su adjunto. */
export async function storeDocument(
  storage: DocumentStorage,
  invoiceId: string,
  document: UploadedDocument,
): Promise<Attachment> {
  const key = `invoices/${invoiceId}/${generateUuidV7()}.${EXTENSIONS[document.mimeType] ?? 'bin'}`;
  const name = document.originalName.split(/[\\/]/).pop() ?? document.originalName;
  const attachment = new Attachment(key, name, document.mimeType, document.contents.byteLength);
  await storage.put(key, document.contents);
  return attachment;
}

export interface EntryInput {
  date: string;
  kind: string;
  concept: string;
  category: string;
  method: string;
  amount: string;
  /** Mes al que corresponde («AAAA-MM»); sin él, el de la fecha. */
  period?: string | null;
}

/** Mes opcional de un formulario. */
function periodOf(value: string | null | undefined): YearMonth | null {
  return value ? YearMonth.fromString(value) : null;
}

export class RecordEntry {
  constructor(
    private readonly entries: ManualEntryRepository,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(input: EntryInput): Promise<string> {
    const date = LocalDate.fromString(input.date);
    await PeriodClosed.guard(this.closed, date);
    if (input.kind !== 'income' && input.kind !== 'expense') {
      throw new InvalidValue('kind', 'Indica si es un ingreso o un gasto.');
    }
    const entry = ManualEntry.record(
      ManualEntryId.generate(),
      date,
      input.kind,
      input.concept,
      categoryFromName(input.category),
      methodFromName(input.method),
      Money.fromDecimal(input.amount),
      periodOf(input.period),
    );
    await this.entries.saveEntry(entry);
    return entry.id.value;
  }
}

export class DeleteEntry {
  constructor(
    private readonly entries: ManualEntryRepository,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(id: string): Promise<void> {
    const entry = await this.entries.entry(ManualEntryId.fromString(id));
    if (entry === null) throw new EntryNotFound();
    await PeriodClosed.guard(this.closed, entry.date);
    await this.entries.deleteEntry(entry.id);
  }
}

export interface InvoiceInput {
  date: string;
  number: string;
  supplier: string;
  concept: string;
  category: string;
  amount: string;
  /** Mes al que corresponde («AAAA-MM»); sin él, el de la factura. */
  period?: string | null;
}

export class RegisterInvoice {
  constructor(
    private readonly invoices: SupplierInvoiceRepository,
    private readonly storage: DocumentStorage,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(input: InvoiceInput, document: UploadedDocument | null): Promise<string> {
    const date = LocalDate.fromString(input.date);
    await PeriodClosed.guard(this.closed, date);
    const invoice = SupplierInvoice.register(
      SupplierInvoiceId.generate(),
      date,
      input.number,
      input.supplier,
      input.concept,
      categoryFromName(input.category),
      Money.fromDecimal(input.amount),
      periodOf(input.period),
    );
    if (document !== null) {
      invoice.attach(await storeDocument(this.storage, invoice.id.value, document));
    }
    await this.invoices.saveInvoice(invoice);
    return invoice.id.value;
  }
}

export class PayInvoice {
  constructor(
    private readonly invoices: SupplierInvoiceRepository,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(id: string, date: string, method: string): Promise<void> {
    const invoice = await this.invoices.invoice(SupplierInvoiceId.fromString(id));
    if (invoice === null) throw new SupplierInvoiceNotFound();
    const paidOn = LocalDate.fromString(date);
    await PeriodClosed.guard(this.closed, paidOn);
    invoice.pay(paidOn, methodFromName(method));
    await this.invoices.saveInvoice(invoice);
  }
}

/** Adjunta o sustituye el documento de una factura (el anterior se borra). */
export class AttachDocument {
  constructor(
    private readonly invoices: SupplierInvoiceRepository,
    private readonly storage: DocumentStorage,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(id: string, document: UploadedDocument): Promise<void> {
    const invoice = await this.invoices.invoice(SupplierInvoiceId.fromString(id));
    if (invoice === null) throw new SupplierInvoiceNotFound();
    await PeriodClosed.guard(this.closed, invoice.date);
    const previous = invoice.attach(await storeDocument(this.storage, invoice.id.value, document));
    await this.invoices.saveInvoice(invoice);
    if (previous !== null) await this.storage.remove(previous.key);
  }
}

export class DeleteInvoice {
  constructor(
    private readonly invoices: SupplierInvoiceRepository,
    private readonly storage: DocumentStorage,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(id: string): Promise<void> {
    const invoice = await this.invoices.invoice(SupplierInvoiceId.fromString(id));
    if (invoice === null) throw new SupplierInvoiceNotFound();
    await PeriodClosed.guard(this.closed, invoice.date);
    if (invoice.isPaid()) throw new InvoiceAlreadyPaidCannotBeDeleted();
    await this.invoices.deleteInvoice(invoice.id);
    const attachment = invoice.attachment();
    if (attachment !== null) await this.storage.remove(attachment.key);
  }
}

export interface MonthLedgerView {
  month: string;
  lines: LedgerLine[];
  incomeCents: number;
  expenseCents: number;
  expensesByCategory: { category: string; label: string; amountCents: number }[];
}

/** Movimientos del mes, del más reciente al más antiguo, con totales y gastos por categoría. */
export class MonthLedger {
  constructor(private readonly ledger: LedgerQuery) {}

  async execute(month: string): Promise<MonthLedgerView> {
    return this.view(month, await this.ledger.lines(YearMonth.fromString(month)));
  }

  /** Los libros de varios meses seguidos, leídos de una vez (el gráfico del resumen). */
  async between(from: YearMonth, to: YearMonth): Promise<MonthLedgerView[]> {
    const lines = await this.ledger.linesBetween(from, to);
    const views: MonthLedgerView[] = [];
    for (let m = from; !to.isBefore(m); m = m.next()) {
      const key = m.toString();
      views.push(this.view(key, lines.filter((l) => l.date.startsWith(key))));
    }
    return views;
  }

  private view(month: string, monthLines: LedgerLine[]): MonthLedgerView {
    const lines = [...monthLines]
      .sort((a, b) => b.date.localeCompare(a.date) || b.sourceId.localeCompare(a.sourceId));
    let income = 0;
    let expenses = 0;
    const byCategory = new Map<string, number>();
    for (const line of lines) {
      if (line.kind === 'income') {
        income += line.amountCents;
        continue;
      }
      expenses += line.amountCents;
      byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + line.amountCents);
    }
    const expensesByCategory = [...byCategory]
      .sort((a, b) => b[1] - a[1])
      .map(([category, amountCents]) => ({
        category,
        label: categoryLabel(categoryFromName(category)),
        amountCents,
      }));
    return { month, lines, incomeCents: income, expenseCents: expenses, expensesByCategory };
  }
}

export interface FiscalYearView {
  startYear: number;
  label: string;
  openingCents: number;
  months: {
    month: string;
    incomeCents: number;
    expenseCents: number;
    resultCents: number;
    accumulatedCents: number;
  }[];
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
  canClose: boolean;
  closedOn: string | null;
}

/** El ejercicio mes a mes: ingresos, gastos, resultado y acumulado desde el saldo arrastrado. */
export class FiscalYearSummary {
  constructor(
    private readonly ledger: LedgerQuery,
    private readonly closings: SeasonClosingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(startYear: number): Promise<FiscalYearView> {
    const year = new FiscalYear(startYear);
    let opening = 0;
    for (const closing of await this.closings.closings()) {
      if (closing.year.startYear < startYear) opening += closing.result().cents;
    }
    const months: FiscalYearView['months'] = [];
    let accumulated = opening;
    let income = 0;
    let expenses = 0;
    const byMonth = totalsByMonth(
      await this.ledger.linesBetween(year.firstMonth(), year.lastMonth()),
    );
    for (const month of year.months()) {
      const [monthIncome, monthExpenses] = byMonth.get(month.toString()) ?? [0, 0];
      accumulated += monthIncome - monthExpenses;
      income += monthIncome;
      expenses += monthExpenses;
      months.push({
        month: month.toString(),
        incomeCents: monthIncome,
        expenseCents: monthExpenses,
        resultCents: monthIncome - monthExpenses,
        accumulatedCents: accumulated,
      });
    }
    const closing = await this.closings.closing(year);
    const current = YearMonth.of(LocalDate.fromInstant(this.clock.now()));
    return {
      startYear,
      label: year.label(),
      openingCents: opening,
      months,
      incomeCents: income,
      expenseCents: expenses,
      resultCents: income - expenses,
      canClose: closing === null && !current.isBefore(year.lastMonth()),
      closedOn: closing?.closedOn.toString() ?? null,
    };
  }

  async totals(month: YearMonth): Promise<[number, number]> {
    let income = 0;
    let expenses = 0;
    for (const line of await this.ledger.lines(month)) {
      if (line.kind === 'income') income += line.amountCents;
      else expenses += line.amountCents;
    }
    return [income, expenses];
  }
}

/** Cierra un ejercicio terminado (o en su último mes), en orden, congelando su resultado. */
export class CloseSeason {
  /** Temporadas anteriores que se revisan (el club no tiene datos de antes). */
  private static readonly YEARS_BACK = 10;

  constructor(
    private readonly summary: FiscalYearSummary,
    private readonly closings: SeasonClosingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(startYear: number): Promise<void> {
    const year = new FiscalYear(startYear);
    if ((await this.closings.closing(year)) !== null) throw new SeasonAlreadyClosed();
    const view = await this.summary.execute(startYear);
    if (!view.canClose) throw new SeasonNotFinished();
    // En orden: ninguna temporada anterior con movimientos puede quedar abierta.
    let previous = year.previous();
    for (let i = 0; i < CloseSeason.YEARS_BACK; i++, previous = previous.previous()) {
      if ((await this.closings.closing(previous)) === null && (await this.hasMovements(previous))) {
        throw new PreviousSeasonOpen();
      }
    }
    await this.closings.saveClosing(
      SeasonClosing.close(
        year,
        Money.cents(view.incomeCents),
        Money.cents(view.expenseCents),
        LocalDate.fromInstant(this.clock.now()),
      ),
    );
  }

  private async hasMovements(year: FiscalYear): Promise<boolean> {
    for (const month of year.months()) {
      const [income, expenses] = await this.summary.totals(month);
      if (income !== 0 || expenses !== 0) return true;
    }
    return false;
  }
}
