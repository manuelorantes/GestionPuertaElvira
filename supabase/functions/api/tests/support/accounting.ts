import { type LocalDate, YearMonth } from '../../src/domain/common/mod.ts';
import {
  type Category,
  CategoryCatalog,
  FiscalYear,
  type LedgerCorrection,
  type ManualEntry,
  type ManualEntryId,
  type SeasonClosing,
  type SupplierInvoice,
  type SupplierInvoiceId,
} from '../../src/domain/accounting/mod.ts';
import type {
  AccountingCategoryRepository,
  DocumentStorage,
  LedgerCorrections,
  LedgerLine,
  LedgerQuery,
  ManualEntryRepository,
  PaymentMethods,
  SeasonClosingRepository,
  SupplierInvoiceRepository,
} from '../../src/application/accounting/mod.ts';
import type { ClosedPeriods } from '../../src/application/common/mod.ts';
import { FrozenClock } from './identity.ts';

/** Dobles en memoria de Accounting; el libro se compone de apuntes, facturas pagadas y líneas externas. */
export class AccountingFixture
  implements
    ManualEntryRepository,
    SupplierInvoiceRepository,
    SeasonClosingRepository,
    DocumentStorage,
    LedgerQuery,
    ClosedPeriods,
    AccountingCategoryRepository,
    LedgerCorrections,
    PaymentMethods {
  customCategories: Category[] = [];
  corrections = new Map<string, LedgerCorrection>();
  paymentMethodChanges: [string, string][] = [];

  saveCorrection(correction: LedgerCorrection): Promise<void> {
    this.corrections.set(`${correction.source}/${correction.sourceId}`, correction);
    return Promise.resolve();
  }

  changePaymentMethod(paymentId: string, method: string): Promise<void> {
    this.paymentMethodChanges.push([paymentId, method]);
    // El cobro cambia: el libro lo verá con su nueva forma de pago.
    this.external = this.external.map((l) =>
      l.source === 'payment' && l.sourceId === paymentId ? { ...l, method } : l
    );
    return Promise.resolve();
  }
  entries = new Map<string, ManualEntry>();
  invoices = new Map<string, SupplierInvoice>();
  seasonClosings = new Map<number, SeasonClosing>();
  files = new Map<string, Uint8Array>();
  /** Líneas que vendrían de Cobros y Profesorado. */
  external: LedgerLine[] = [];
  readonly clock: FrozenClock;

  constructor(now = '2027-09-05T10:00:00+02:00') {
    this.clock = new FrozenClock(now);
  }

  catalog(): Promise<CategoryCatalog> {
    return Promise.resolve(CategoryCatalog.of(this.customCategories));
  }

  saveCategory(category: Category): Promise<void> {
    this.customCategories = [
      ...this.customCategories.filter((c) => c.code !== category.code),
      category,
    ];
    return Promise.resolve();
  }

  categoryInUse(code: string): Promise<boolean> {
    return Promise.resolve(
      [...this.entries.values(), ...this.invoices.values()].some((m) => m.category === code),
    );
  }

  removeCategory(code: string): Promise<void> {
    this.customCategories = this.customCategories.filter((c) => c.code !== code);
    return Promise.resolve();
  }

  entry(id: ManualEntryId): Promise<ManualEntry | null> {
    return Promise.resolve(this.entries.get(id.value) ?? null);
  }

  saveEntry(entry: ManualEntry): Promise<void> {
    this.entries.set(entry.id.value, entry);
    return Promise.resolve();
  }

  deleteEntry(id: ManualEntryId): Promise<void> {
    this.entries.delete(id.value);
    return Promise.resolve();
  }

  invoice(id: SupplierInvoiceId): Promise<SupplierInvoice | null> {
    return Promise.resolve(this.invoices.get(id.value) ?? null);
  }

  saveInvoice(invoice: SupplierInvoice): Promise<void> {
    this.invoices.set(invoice.id.value, invoice);
    return Promise.resolve();
  }

  deleteInvoice(id: SupplierInvoiceId): Promise<void> {
    this.invoices.delete(id.value);
    return Promise.resolve();
  }

  closing(year: FiscalYear): Promise<SeasonClosing | null> {
    return Promise.resolve(this.seasonClosings.get(year.startYear) ?? null);
  }

  closings(): Promise<SeasonClosing[]> {
    return Promise.resolve([...this.seasonClosings.values()]);
  }

  saveClosing(closing: SeasonClosing): Promise<void> {
    this.seasonClosings.set(closing.year.startYear, closing);
    return Promise.resolve();
  }

  put(key: string, contents: Uint8Array): Promise<void> {
    this.files.set(key, contents);
    return Promise.resolve();
  }

  read(key: string): Promise<Uint8Array> {
    return Promise.resolve(this.files.get(key) ?? new Uint8Array());
  }

  remove(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }

  async isClosed(date: LocalDate): Promise<boolean> {
    return (await this.closing(FiscalYear.of(date))) !== null;
  }

  async linesBetween(from: YearMonth, to: YearMonth): Promise<LedgerLine[]> {
    const lines: LedgerLine[] = [];
    for (let m = from; !to.isBefore(m); m = m.next()) lines.push(...(await this.lines(m)));
    return lines;
  }

  lines(month: YearMonth): Promise<LedgerLine[]> {
    const lines = this.external
      .filter((l) => l.date.startsWith(month.toString()))
      .map((l) => {
        const c = this.corrections.get(`${l.source}/${l.sourceId}`);
        return c
          ? {
            ...l,
            concept: c.concept,
            category: c.category,
            method: c.method ?? l.method,
            amountCents: c.amount.cents,
            period: c.period.toString(),
            corrected: true,
          }
          : l;
      });
    for (const e of this.entries.values()) {
      if (YearMonth.of(e.date).equals(month)) {
        lines.push({
          source: 'manual',
          sourceId: e.id.value,
          date: e.date.toString(),
          kind: e.kind,
          concept: e.concept,
          category: e.category,
          method: e.method,
          amountCents: e.amount.cents,
          studentId: null,
          period: e.period.toString(),
          corrected: false,
        });
      }
    }
    for (const i of this.invoices.values()) {
      const paidOn = i.paidOn();
      if (paidOn !== null && YearMonth.of(paidOn).equals(month)) {
        lines.push({
          source: 'invoice',
          sourceId: i.id.value,
          date: paidOn.toString(),
          kind: 'expense',
          concept: `${i.supplier} · ${i.concept}`,
          category: i.category,
          method: i.method() ?? '',
          amountCents: i.amount.cents,
          studentId: null,
          period: i.period.toString(),
          corrected: false,
        });
      }
    }
    return Promise.resolve(lines);
  }
}
