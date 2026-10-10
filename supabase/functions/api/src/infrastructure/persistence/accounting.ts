import { LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
import {
  Attachment,
  type Category,
  CategoryCatalog,
  type EntryKind,
  FiscalYear,
  ManualEntry,
  ManualEntryId,
  methodFromName,
  MonthlyCategories,
  SeasonClosing,
  SupplierInvoice,
  SupplierInvoiceId,
} from '../../domain/accounting/mod.ts';
import type {
  AccountingCategoryRepository,
  AccountingSettingsRepository,
  InvoiceQuery,
  InvoiceView,
  LedgerLine,
  LedgerQuery,
  ManualEntryRepository,
  SeasonClosingRepository,
  SupplierInvoiceRepository,
} from '../../application/accounting/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Repositorios de Accounting: apuntes manuales, facturas de proveedores y cierres. */
export class SqlAccountingRepository
  implements
    ManualEntryRepository,
    SupplierInvoiceRepository,
    SeasonClosingRepository,
    AccountingSettingsRepository,
    AccountingCategoryRepository {
  constructor(private readonly sql: Sql) {}

  async catalog(): Promise<CategoryCatalog> {
    const rows = await this.sql`SELECT code, kind, label FROM accounting_category ORDER BY label`;
    return CategoryCatalog.of(
      Row.all(rows).map((r) => ({
        code: r.string('code'),
        kind: r.string('kind') === 'income' ? 'income' : 'expense',
        label: r.string('label'),
        custom: true,
      })),
    );
  }

  async saveCategory(c: Category): Promise<void> {
    await this.sql`INSERT INTO accounting_category (code, kind, label)
      VALUES (${c.code}, ${c.kind}, ${c.label})
      ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label`;
  }

  async categoryInUse(code: string): Promise<boolean> {
    const rows = await this.sql`SELECT
      EXISTS (SELECT 1 FROM accounting_entry WHERE category = ${code})
      OR EXISTS (SELECT 1 FROM accounting_invoice WHERE category = ${code}) AS used`;
    return new Row(rows[0] ?? {}).bool('used');
  }

  async removeCategory(code: string): Promise<void> {
    await this.sql`DELETE FROM accounting_category WHERE code = ${code}`;
  }

  async monthlyCategories(): Promise<MonthlyCategories> {
    const rows = await this.sql`SELECT monthly_categories FROM accounting_settings WHERE id = 1`;
    if (!rows[0]) return MonthlyCategories.defaults();
    return MonthlyCategories.restore(new Row(rows[0]).json('monthly_categories') as string[]);
  }

  async saveMonthlyCategories(categories: MonthlyCategories): Promise<void> {
    const list = this.sql.json(categories.list(await this.catalog()));
    await this.sql`INSERT INTO accounting_settings (id, monthly_categories) VALUES (1, ${list})
      ON CONFLICT (id) DO UPDATE SET monthly_categories = EXCLUDED.monthly_categories`;
  }

  async entry(id: ManualEntryId): Promise<ManualEntry | null> {
    const rows = await this.sql`SELECT * FROM accounting_entry WHERE id = ${id.value}`;
    if (!rows[0]) return null;
    const r = new Row(rows[0]);
    return ManualEntry.restore({
      id: ManualEntryId.fromString(r.string('id')),
      date: LocalDate.fromString(r.string('entry_date')),
      kind: r.string('kind') as EntryKind,
      concept: r.string('concept'),
      category: r.string('category'),
      method: methodFromName(r.string('method')),
      amount: Money.cents(r.int('amount_cents')),
      period: periodOf(r.nullableString('period')),
    });
  }

  async saveEntry(e: ManualEntry): Promise<void> {
    await this
      .sql`INSERT INTO accounting_entry (id, entry_date, kind, concept, category, method, amount_cents, period)
      VALUES (${e.id.value}, ${e.date.toString()}, ${e.kind}, ${e.concept}, ${e.category}, ${e.method}, ${e.amount.cents}, ${e.period.toString()})
      ON CONFLICT (id) DO NOTHING`;
  }

  async deleteEntry(id: ManualEntryId): Promise<void> {
    await this.sql`DELETE FROM accounting_entry WHERE id = ${id.value}`;
  }

  async invoice(id: SupplierInvoiceId): Promise<SupplierInvoice | null> {
    const rows = await this.sql`SELECT * FROM accounting_invoice WHERE id = ${id.value}`;
    if (!rows[0]) return null;
    const r = new Row(rows[0]);
    const key = r.nullableString('attachment_key');
    const paidOn = r.nullableString('paid_on');
    const method = r.nullableString('method');
    return SupplierInvoice.restore({
      id: SupplierInvoiceId.fromString(r.string('id')),
      date: LocalDate.fromString(r.string('invoice_date')),
      number: r.string('number'),
      supplier: r.string('supplier'),
      concept: r.string('concept'),
      category: r.string('category'),
      amount: Money.cents(r.int('amount_cents')),
      period: periodOf(r.nullableString('period')),
      paidOn: paidOn === null ? null : LocalDate.fromString(paidOn),
      method: method === null ? null : methodFromName(method),
      attachment: key === null ? null : new Attachment(
        key,
        r.nullableString('attachment_name') ?? '',
        r.nullableString('attachment_type') ?? '',
        r.nullableInt('attachment_bytes') ?? 0,
      ),
    });
  }

  async saveInvoice(i: SupplierInvoice): Promise<void> {
    const a = i.attachment();
    const record = {
      id: i.id.value,
      invoice_date: i.date.toString(),
      number: i.number,
      supplier: i.supplier,
      concept: i.concept,
      category: i.category,
      amount_cents: i.amount.cents,
      period: i.period.toString(),
      paid_on: i.paidOn()?.toString() ?? null,
      method: i.method() ?? null,
      attachment_key: a?.key ?? null,
      attachment_name: a?.originalName ?? null,
      attachment_type: a?.mimeType ?? null,
      attachment_bytes: a?.bytes ?? null,
    };
    await this.sql`INSERT INTO accounting_invoice ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET ${
      this.sql(
        record,
        'paid_on',
        'method',
        'attachment_key',
        'attachment_name',
        'attachment_type',
        'attachment_bytes',
      )
    }`;
  }

  async deleteInvoice(id: SupplierInvoiceId): Promise<void> {
    await this.sql`DELETE FROM accounting_invoice WHERE id = ${id.value}`;
  }

  async closing(year: FiscalYear): Promise<SeasonClosing | null> {
    const rows = await this
      .sql`SELECT * FROM accounting_closing WHERE start_year = ${year.startYear}`;
    return rows[0] ? toClosing(new Row(rows[0])) : null;
  }

  async closings(): Promise<SeasonClosing[]> {
    return Row.all(await this.sql`SELECT * FROM accounting_closing ORDER BY start_year`).map(
      toClosing,
    );
  }

  async saveClosing(c: SeasonClosing): Promise<void> {
    await this
      .sql`INSERT INTO accounting_closing (start_year, income_cents, expense_cents, closed_on)
      VALUES (${c.year.startYear}, ${c.income.cents}, ${c.expenses.cents}, ${c.closedOn.toString()})`;
  }
}

function periodOf(value: string | null): YearMonth | null {
  return value === null ? null : YearMonth.fromString(value);
}

function toClosing(r: Row): SeasonClosing {
  return SeasonClosing.close(
    new FiscalYear(r.int('start_year')),
    Money.cents(r.int('income_cents')),
    Money.cents(r.int('expense_cents')),
    LocalDate.fromString(r.string('closed_on')),
  );
}

export class SqlInvoiceQuery implements InvoiceQuery {
  constructor(private readonly sql: Sql) {}

  async all(): Promise<InvoiceView[]> {
    const rows = await this
      .sql`SELECT * FROM accounting_invoice ORDER BY invoice_date DESC, number DESC`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      date: r.string('invoice_date'),
      number: r.string('number'),
      supplier: r.string('supplier'),
      concept: r.string('concept'),
      category: r.string('category'),
      amountCents: r.int('amount_cents'),
      paidOn: r.nullableString('paid_on'),
      method: r.nullableString('method'),
      attachmentName: r.nullableString('attachment_name'),
      period: r.nullableString('period') ?? r.string('invoice_date').slice(0, 7),
    }));
  }
}

/** El libro se compone en lectura a partir de Cobros, Profesorado, facturas pagadas y apuntes manuales. */
export class SqlLedgerQuery implements LedgerQuery {
  constructor(private readonly sql: Sql) {}

  lines(month: YearMonth): Promise<LedgerLine[]> {
    return this.linesBetween(month, month);
  }

  async linesBetween(first: YearMonth, last: YearMonth): Promise<LedgerLine[]> {
    const from = first.firstDay().toString();
    const to = last.lastDay().toString();
    const rows = await this.sql`
      SELECT 'payment' AS source, p.id::text AS source_id, p.paid_on::text AS date, 'income' AS kind,
             p.concept || ' · ' || s.full_name AS concept,
             CASE p.kind WHEN 'membership' THEN 'membership' WHEN 'material' THEN 'material_sales' ELSE 'fees' END AS category, p.method, p.total_cents AS amount,
             p.student_id::text AS student_id, to_char(p.paid_on, 'YYYY-MM') AS period
        FROM billing_payment p JOIN students_student s ON s.id = p.student_id
       WHERE p.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'settlement', st.teacher_id::text || '/' || st.month, st.paid_on::text, 'expense',
             'Liquidación ' || st.month || ' · ' || t.full_name, 'teachers', 'transfer',
             -- Lo adelantado a cuenta de ese mes ya salió como anticipo.
             st.amount_cents - COALESCE((SELECT SUM(a.amount_cents) FROM payroll_advance a
                WHERE a.teacher_id = st.teacher_id AND a.month = st.month), 0), NULL, st.month
        FROM payroll_settlement st JOIN teachers_teacher t ON t.id = st.teacher_id
       WHERE st.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'advance', a.teacher_id::text || '/' || a.id::text, a.paid_on::text, 'expense',
             'Anticipo a cuenta de ' || a.month || ' · ' || t.full_name || COALESCE(' · ' || a.note, ''),
             'teachers', 'transfer', a.amount_cents, NULL, a.month
        FROM payroll_advance a JOIN teachers_teacher t ON t.id = a.teacher_id
       WHERE a.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'invoice', i.id::text, i.paid_on::text, 'expense', i.supplier || ' · ' || i.concept, i.category, i.method, i.amount_cents, NULL,
             COALESCE(i.period, to_char(i.invoice_date, 'YYYY-MM'))
        FROM accounting_invoice i
       WHERE i.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'manual', e.id::text, e.entry_date::text, e.kind, e.concept, e.category, e.method, e.amount_cents, NULL,
             COALESCE(e.period, to_char(e.entry_date, 'YYYY-MM'))
        FROM accounting_entry e
       WHERE e.entry_date BETWEEN ${from} AND ${to}`;
    return Row.all(rows).map((r) => ({
      source: r.string('source'),
      sourceId: r.string('source_id'),
      date: r.string('date'),
      kind: r.string('kind'),
      concept: r.string('concept'),
      category: r.string('category'),
      method: r.string('method'),
      amountCents: r.int('amount'),
      studentId: r.nullableString('student_id'),
      period: r.string('period'),
    }));
  }
}
