import { type LocalDate, YearMonth } from '../../src/domain/common/mod.ts';
import {
  type Category,
  CategoryCatalog,
  type ExpectedExpense,
  type ExpectedExpenseId,
  FiscalYear,
  type LedgerCorrection,
  type ManualEntry,
  type ManualEntryId,
  type SeasonClosing,
  type SupplierInvoice,
  type SupplierInvoiceId,
  type Transfer,
  type TransferId,
} from '../../src/domain/accounting/mod.ts';
import {
  type AccountingCategoryRepository,
  type DocumentStorage,
  type ExpectedExpenseRepository,
  type ExpectedSettlement,
  type LedgerCorrections,
  type LedgerLine,
  type LedgerQuery,
  type ManualEntryRepository,
  type PaymentMethods,
  type SeasonClosingRepository,
  shareViews,
  type SupplierInvoiceRepository,
  type TransferRepository,
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
    PaymentMethods,
    TransferRepository,
    ExpectedExpenseRepository {
  expectedList = new Map<string, ExpectedExpense>();
  /** «gasto/mes» → id del apunte con que se pagó, o null si se saltó. */
  expectedMonths = new Map<string, string | null>();

  expectedExpenses(): Promise<ExpectedExpense[]> {
    return Promise.resolve([...this.expectedList.values()]);
  }

  expectedExpense(id: ExpectedExpenseId): Promise<ExpectedExpense | null> {
    return Promise.resolve(this.expectedList.get(id.value) ?? null);
  }

  saveExpectedExpense(expense: ExpectedExpense): Promise<void> {
    this.expectedList.set(expense.id.value, expense);
    return Promise.resolve();
  }

  deleteExpectedExpense(id: ExpectedExpenseId): Promise<void> {
    this.expectedList.delete(id.value);
    for (const key of [...this.expectedMonths.keys()]) {
      if (key.startsWith(`${id.value}/`)) this.expectedMonths.delete(key);
    }
    return Promise.resolve();
  }

  settlements(first: YearMonth, last: YearMonth): Promise<ExpectedSettlement[]> {
    const list: ExpectedSettlement[] = [];
    for (const [key, entryId] of this.expectedMonths) {
      const [expenseId = '', period = ''] = key.split('/');
      if (period < first.toString() || period > last.toString()) continue;
      const entry = entryId === null ? null : this.entries.get(entryId) ?? null;
      list.push({
        expenseId,
        period,
        entryId,
        amountCents: entry?.amount.cents ?? null,
        date: entry?.date.toString() ?? null,
      });
    }
    return Promise.resolve(list);
  }

  settleExpected(
    id: ExpectedExpenseId,
    period: YearMonth,
    entry: ManualEntryId | null,
  ): Promise<void> {
    this.expectedMonths.set(`${id.value}/${period.toString()}`, entry?.value ?? null);
    return Promise.resolve();
  }

  unsettleExpected(id: ExpectedExpenseId, period: YearMonth): Promise<void> {
    this.expectedMonths.delete(`${id.value}/${period.toString()}`);
    return Promise.resolve();
  }

  customCategories: Category[] = [];
  transferList = new Map<string, Transfer>();

  transfer(id: TransferId): Promise<Transfer | null> {
    return Promise.resolve(this.transferList.get(id.value) ?? null);
  }

  saveTransfer(transfer: Transfer): Promise<void> {
    this.transferList.set(transfer.id.value, transfer);
    return Promise.resolve();
  }

  deleteTransfer(id: TransferId): Promise<void> {
    this.transferList.delete(id.value);
    return Promise.resolve();
  }

  transfers(): Promise<Transfer[]> {
    return Promise.resolve(
      [...this.transferList.values()].sort((a, b) =>
        b.date.toString().localeCompare(a.date.toString())
      ),
    );
  }

  async transfersBetween(from: LocalDate, to: LocalDate): Promise<Transfer[]> {
    return (await this.transfers()).filter((t) => !t.date.isBefore(from) && !to.isBefore(t.date));
  }
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
    // Como en la base: el mes que pagaba vuelve a estar pendiente.
    for (const [key, entryId] of this.expectedMonths) {
      if (entryId === id.value) this.expectedMonths.delete(key);
    }
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
            shares: shareViews(c.shares),
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
          shares: shareViews(e.shares),
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
          shares: shareViews(i.shares),
          corrected: false,
        });
      }
    }
    return Promise.resolve(lines);
  }
}
