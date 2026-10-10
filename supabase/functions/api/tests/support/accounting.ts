import { type LocalDate, YearMonth } from '../../src/domain/common/mod.ts';
import {
  FiscalYear,
  type ManualEntry,
  type ManualEntryId,
  type SeasonClosing,
  type SupplierInvoice,
  type SupplierInvoiceId,
} from '../../src/domain/accounting/mod.ts';
import type {
  DocumentStorage,
  LedgerLine,
  LedgerQuery,
  ManualEntryRepository,
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
    ClosedPeriods {
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
    const lines = this.external.filter((l) => l.date.startsWith(month.toString()));
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
          concept: i.supplier,
          category: i.category,
          method: i.method() ?? '',
          amountCents: i.amount.cents,
          studentId: null,
        });
      }
    }
    return Promise.resolve(lines);
  }
}
