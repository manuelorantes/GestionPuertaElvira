import { LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
import {
  Attachment,
  categoryFromName,
  type EntryKind,
  FiscalYear,
  ManualEntry,
  ManualEntryId,
  methodFromName,
  SeasonClosing,
  SupplierInvoice,
  SupplierInvoiceId,
} from '../../domain/accounting/mod.ts';
import type {
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
  implements ManualEntryRepository, SupplierInvoiceRepository, SeasonClosingRepository {
  constructor(private readonly sql: Sql) {}

  async entry(id: ManualEntryId): Promise<ManualEntry | null> {
    const rows = await this.sql`SELECT * FROM accounting_entry WHERE id = ${id.value}`;
    if (!rows[0]) return null;
    const r = new Row(rows[0]);
    return ManualEntry.record(
      ManualEntryId.fromString(r.string('id')),
      LocalDate.fromString(r.string('entry_date')),
      r.string('kind') as EntryKind,
      r.string('concept'),
      categoryFromName(r.string('category')),
      methodFromName(r.string('method')),
      Money.cents(r.int('amount_cents')),
    );
  }

  async saveEntry(e: ManualEntry): Promise<void> {
    await this
      .sql`INSERT INTO accounting_entry (id, entry_date, kind, concept, category, method, amount_cents)
      VALUES (${e.id.value}, ${e.date.toString()}, ${e.kind}, ${e.concept}, ${e.category}, ${e.method}, ${e.amount.cents})
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
      category: categoryFromName(r.string('category')),
      amount: Money.cents(r.int('amount_cents')),
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
             CASE p.kind WHEN 'membership' THEN 'membership' ELSE 'fees' END AS category, p.method, p.total_cents AS amount
        FROM billing_payment p JOIN students_student s ON s.id = p.student_id
       WHERE p.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'settlement', st.teacher_id::text || '/' || st.month, st.paid_on::text, 'expense',
             'Liquidación ' || st.month || ' · ' || t.full_name, 'teachers', 'transfer',
             -- Lo adelantado a cuenta de ese mes ya salió como anticipo.
             st.amount_cents - COALESCE((SELECT SUM(a.amount_cents) FROM payroll_advance a
                WHERE a.teacher_id = st.teacher_id AND a.month = st.month), 0)
        FROM payroll_settlement st JOIN teachers_teacher t ON t.id = st.teacher_id
       WHERE st.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'advance', a.teacher_id::text || '/' || a.id::text, a.paid_on::text, 'expense',
             'Anticipo a cuenta de ' || a.month || ' · ' || t.full_name || COALESCE(' · ' || a.note, ''),
             'teachers', 'transfer', a.amount_cents
        FROM payroll_advance a JOIN teachers_teacher t ON t.id = a.teacher_id
       WHERE a.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'invoice', i.id::text, i.paid_on::text, 'expense', i.supplier || ' · ' || i.concept, i.category, i.method, i.amount_cents
        FROM accounting_invoice i
       WHERE i.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'manual', e.id::text, e.entry_date::text, e.kind, e.concept, e.category, e.method, e.amount_cents
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
    }));
  }
}
