import { LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
import {
  accountFromName,
  Attachment,
  type Category,
  CategoryCatalog,
  type EntryKind,
  FiscalYear,
  type LedgerCorrection,
  ManualEntry,
  ManualEntryId,
  methodFromName,
  MonthlyCategories,
  PeriodShares,
  SeasonClosing,
  SupplierInvoice,
  SupplierInvoiceId,
  Transfer,
  TransferId,
} from '../../domain/accounting/mod.ts';
import type {
  AccountingCategoryRepository,
  AccountingSettingsRepository,
  InvoiceQuery,
  InvoiceView,
  LedgerCorrections,
  LedgerLine,
  LedgerQuery,
  ManualEntryRepository,
  SeasonClosingRepository,
  ShareView,
  SupplierInvoiceRepository,
  TransferRepository,
} from '../../application/accounting/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Repositorios de Accounting: apuntes manuales, facturas de proveedores y cierres. */
export class SqlAccountingRepository
  implements
    ManualEntryRepository,
    SupplierInvoiceRepository,
    SeasonClosingRepository,
    AccountingSettingsRepository,
    AccountingCategoryRepository,
    LedgerCorrections {
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

  async saveCorrection(c: LedgerCorrection): Promise<void> {
    await this.sql`INSERT INTO accounting_correction
      (source, source_id, concept, category, method, amount_cents, period, period_shares)
      VALUES (${c.source}, ${c.sourceId}, ${c.concept}, ${c.category}, ${c.method},
              ${c.amount.cents}, ${c.period.toString()}, ${this.sharesColumn(c.shares)})
      ON CONFLICT (source, source_id) DO UPDATE SET concept = EXCLUDED.concept,
        category = EXCLUDED.category, method = EXCLUDED.method,
        amount_cents = EXCLUDED.amount_cents, period = EXCLUDED.period,
        period_shares = EXCLUDED.period_shares`;
  }

  /** Nulo si todo corresponde a un solo mes (el de `period`). */
  private sharesColumn(shares: PeriodShares) {
    return shares.isSingle() ? null : this.sql.json(
      shares.list().map((s) => ({ period: s.period.toString(), amount_cents: s.amount.cents })),
    );
  }

  async categoryInUse(code: string): Promise<boolean> {
    const rows = await this.sql`SELECT
      EXISTS (SELECT 1 FROM accounting_entry WHERE category = ${code})
      OR EXISTS (SELECT 1 FROM accounting_invoice WHERE category = ${code})
      OR EXISTS (SELECT 1 FROM accounting_correction WHERE category = ${code}) AS used`;
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
    const amount = Money.cents(r.int('amount_cents'));
    return ManualEntry.restore({
      id: ManualEntryId.fromString(r.string('id')),
      date: LocalDate.fromString(r.string('entry_date')),
      kind: r.string('kind') as EntryKind,
      concept: r.string('concept'),
      category: r.string('category'),
      method: methodFromName(r.string('method')),
      amount,
      shares: storedShares(r, amount),
    });
  }

  async saveEntry(e: ManualEntry): Promise<void> {
    await this
      .sql`INSERT INTO accounting_entry (id, entry_date, kind, concept, category, method, amount_cents, period, period_shares)
      VALUES (${e.id.value}, ${e.date.toString()}, ${e.kind}, ${e.concept}, ${e.category}, ${e.method}, ${e.amount.cents}, ${e.period.toString()}, ${
      this.sharesColumn(e.shares)
    })
      ON CONFLICT (id) DO UPDATE SET concept = EXCLUDED.concept, category = EXCLUDED.category,
        method = EXCLUDED.method, amount_cents = EXCLUDED.amount_cents, period = EXCLUDED.period,
        period_shares = EXCLUDED.period_shares`;
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
    const amount = Money.cents(r.int('amount_cents'));
    return SupplierInvoice.restore({
      id: SupplierInvoiceId.fromString(r.string('id')),
      date: LocalDate.fromString(r.string('invoice_date')),
      number: r.string('number'),
      supplier: r.string('supplier'),
      concept: r.string('concept'),
      category: r.string('category'),
      amount,
      shares: storedShares(r, amount),
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
      period_shares: this.sharesColumn(i.shares),
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
        'invoice_date',
        'number',
        'supplier',
        'concept',
        'category',
        'amount_cents',
        'period',
        'period_shares',
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
      .sql`INSERT INTO accounting_closing (start_year, income_cents, expense_cents, cash_cents, closed_on)
      VALUES (${c.year.startYear}, ${c.income.cents}, ${c.expenses.cents}, ${c.cash.cents}, ${c.closedOn.toString()})`;
  }
}

/** Traspasos entre caja y banco. */
export class SqlTransferRepository implements TransferRepository {
  constructor(private readonly sql: Sql) {}

  async transfer(id: TransferId): Promise<Transfer | null> {
    const rows = await this.sql`SELECT * FROM accounting_transfer WHERE id = ${id.value}`;
    return rows[0] ? toTransfer(new Row(rows[0])) : null;
  }

  async saveTransfer(t: Transfer): Promise<void> {
    await this
      .sql`INSERT INTO accounting_transfer (id, transfer_date, from_account, to_account, amount_cents, note)
      VALUES (${t.id.value}, ${t.date.toString()}, ${t.from}, ${t.to}, ${t.amount.cents}, ${t.note})`;
  }

  async deleteTransfer(id: TransferId): Promise<void> {
    await this.sql`DELETE FROM accounting_transfer WHERE id = ${id.value}`;
  }

  async transfers(): Promise<Transfer[]> {
    const rows = await this
      .sql`SELECT * FROM accounting_transfer ORDER BY transfer_date DESC, id DESC`;
    return Row.all(rows).map(toTransfer);
  }

  async transfersBetween(from: LocalDate, to: LocalDate): Promise<Transfer[]> {
    const rows = await this.sql`SELECT * FROM accounting_transfer
      WHERE transfer_date BETWEEN ${from.toString()} AND ${to.toString()}
      ORDER BY transfer_date DESC, id DESC`;
    return Row.all(rows).map(toTransfer);
  }
}

function toTransfer(r: Row): Transfer {
  return Transfer.restore({
    id: TransferId.fromString(r.string('id')),
    date: LocalDate.fromString(r.string('transfer_date')),
    from: accountFromName(r.string('from_account')),
    to: accountFromName(r.string('to_account')),
    amount: Money.cents(r.int('amount_cents')),
    note: r.string('note'),
  });
}

/** El reparto guardado; sin él, todo al mes de `period` (o, en filas antiguas sin mes, null: el de su fecha). */
function storedShares(r: Row, amount: Money): PeriodShares | null {
  const stored = shareList(r.json('period_shares'));
  if (stored !== null) {
    return PeriodShares.of(
      amount,
      stored.map((s) => ({
        period: YearMonth.fromString(s.period),
        amount: Money.cents(s.amountCents),
      })),
    );
  }
  const period = r.nullableString('period');
  return period === null ? null : PeriodShares.single(YearMonth.fromString(period), amount);
}

function shareList(value: unknown): ShareView[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item: { period: string; amount_cents: number }) => ({
    period: item.period,
    amountCents: item.amount_cents,
  }));
}

/**
 * Lo que corresponde a cada mes de una línea del libro: el reparto de su corrección o el suyo y, si no tiene, en los
 * cobros de cuotas, a partes iguales entre los meses que pagan (como el resumen); si no, todo a su mes.
 */
function lineShares(r: Row, amountCents: number): ShareView[] {
  const amount = Money.cents(amountCents);
  const stored = shareList(r.json('shares'));
  if (stored !== null) return stored;
  const paid = r.json('paid_periods');
  const periods = !r.bool('corrected') && Array.isArray(paid) && paid.length > 0
    ? (paid as string[]).map((p) => YearMonth.fromString(p))
    : [YearMonth.fromString(r.string('period'))];
  return PeriodShares.equal(amount, periods).list().map((s) => ({
    period: s.period.toString(),
    amountCents: s.amount.cents,
  }));
}

function toClosing(r: Row): SeasonClosing {
  return SeasonClosing.close(
    new FiscalYear(r.int('start_year')),
    Money.cents(r.int('income_cents')),
    Money.cents(r.int('expense_cents')),
    Money.cents(r.int('cash_cents')),
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
      shares: shareList(r.json('period_shares')) ?? [{
        period: r.nullableString('period') ?? r.string('invoice_date').slice(0, 7),
        amountCents: r.int('amount_cents'),
      }],
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
    // Lo que viene de Cobros y Profesorado sale con su corrección en contabilidad, si la tiene.
    const rows = await this.sql`
      SELECT u.source, u.source_id, u.date, u.kind,
             COALESCE(c.concept, u.concept) AS concept, COALESCE(c.category, u.category) AS category,
             COALESCE(c.method, u.method) AS method, COALESCE(c.amount_cents, u.amount) AS amount,
             u.student_id, COALESCE(c.period, u.period) AS period, c.source IS NOT NULL AS corrected,
             CASE WHEN c.source IS NOT NULL THEN c.period_shares ELSE u.shares END AS shares, u.paid_periods
        FROM (
      SELECT 'payment' AS source, p.id::text AS source_id, p.paid_on::text AS date, 'income' AS kind,
             p.concept || ' · ' || s.full_name AS concept,
             CASE p.kind WHEN 'membership' THEN 'membership' WHEN 'material' THEN 'material_sales' ELSE 'fees' END AS category, p.method, p.total_cents AS amount,
             p.student_id::text AS student_id, to_char(p.paid_on, 'YYYY-MM') AS period,
             NULL::jsonb AS shares, CASE WHEN p.kind = 'monthly' THEN p.periods::jsonb END AS paid_periods
        FROM billing_payment p JOIN students_student s ON s.id = p.student_id
       WHERE p.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'settlement', st.teacher_id::text || '/' || st.month, st.paid_on::text, 'expense',
             'Liquidación ' || st.month || ' · ' || t.full_name, 'teachers', 'transfer',
             -- Lo adelantado a cuenta de ese mes ya salió como anticipo.
             st.amount_cents - COALESCE((SELECT SUM(a.amount_cents) FROM payroll_advance a
                WHERE a.teacher_id = st.teacher_id AND a.month = st.month), 0), NULL, st.month, NULL, NULL
        FROM payroll_settlement st JOIN teachers_teacher t ON t.id = st.teacher_id
       WHERE st.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'advance', a.teacher_id::text || '/' || a.id::text, a.paid_on::text, 'expense',
             'Anticipo a cuenta de ' || a.month || ' · ' || t.full_name || COALESCE(' · ' || a.note, ''),
             'teachers', 'transfer', a.amount_cents, NULL, a.month, NULL, NULL
        FROM payroll_advance a JOIN teachers_teacher t ON t.id = a.teacher_id
       WHERE a.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'invoice', i.id::text, i.paid_on::text, 'expense', i.supplier || ' · ' || i.concept, i.category, i.method, i.amount_cents, NULL,
             COALESCE(i.period, to_char(i.invoice_date, 'YYYY-MM')), i.period_shares, NULL
        FROM accounting_invoice i
       WHERE i.paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT 'manual', e.id::text, e.entry_date::text, e.kind, e.concept, e.category, e.method, e.amount_cents, NULL,
             COALESCE(e.period, to_char(e.entry_date, 'YYYY-MM')), e.period_shares, NULL
        FROM accounting_entry e
       WHERE e.entry_date BETWEEN ${from} AND ${to}
        ) u
        LEFT JOIN accounting_correction c ON c.source = u.source AND c.source_id = u.source_id`;
    return Row.all(rows).map((r) => {
      const shares = lineShares(r, r.int('amount'));
      return {
        source: r.string('source'),
        sourceId: r.string('source_id'),
        date: r.string('date'),
        kind: r.string('kind'),
        concept: r.string('concept'),
        category: r.string('category'),
        method: r.string('method'),
        amountCents: r.int('amount'),
        studentId: r.nullableString('student_id'),
        period: shares[0]?.period ?? r.string('period'),
        shares,
        corrected: r.bool('corrected'),
      };
    });
  }
}
