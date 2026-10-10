import { LocalDate, Money, Season, YearMonth } from '../../domain/common/mod.ts';
import {
  BillingSettings,
  Charge,
  ChargeId,
  type ChargeKind,
  ClubFiscalData,
  DocumentNumber,
  Invoice,
  InvoiceCustomer,
  Payment,
  PaymentId,
  type PaymentMethod,
  preferredPlanFromName,
  QuoteLine,
  StudentAccount,
  StudentRef,
  Tariff,
} from '../../domain/billing/mod.ts';
import type {
  BillingQuery,
  BillingSettingsRepository,
  BillingStudent,
  CancelledChargeView,
  ChargeRepository,
  ChargeView,
  DocumentSequence,
  PaymentDetail,
  PaymentRepository,
  PaymentSummary,
  PrivateEnrolment,
  StudentAccountRepository,
  StudentDirectory,
} from '../../application/billing/mod.ts';
import type { FeeIncome } from '../../application/dashboard/mod.ts';
import type { ClosedPeriods } from '../../application/common/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Ejercicio contable del club: de septiembre a agosto. */
export function fiscalYearOf(date: LocalDate): number {
  return date.month >= 9 ? date.year : date.year - 1;
}

export class SqlClosedPeriods implements ClosedPeriods {
  constructor(private readonly sql: Sql) {}

  async isClosed(date: LocalDate): Promise<boolean> {
    const rows = await this.sql`SELECT 1 FROM accounting_closing WHERE start_year = ${
      fiscalYearOf(date)
    }`;
    return rows.length > 0;
  }
}

const SETTINGS_ID = 'club';

export class SqlBillingSettingsRepository implements BillingSettingsRepository {
  constructor(private readonly sql: Sql) {}

  async get(): Promise<BillingSettings> {
    const rows = await this.sql`SELECT data FROM billing_settings WHERE id = ${SETTINGS_ID}`;
    if (!rows[0]) return BillingSettings.defaults();
    const d = new Row(rows[0]).json('data') as Record<string, unknown>;
    const int = (key: string): number => {
      const value = d[key];
      if (typeof value !== 'number') throw new Error(`Ajuste ${key}: se esperaba un número`);
      return value;
    };
    const str = (key: string): string => {
      const value = d[key];
      if (typeof value !== 'string') throw new Error(`Ajuste ${key}: se esperaba texto`);
      return value;
    };
    const rates = new Map<string, Money>();
    for (
      const [teacher, cents] of Object.entries((d.privateRates ?? {}) as Record<string, number>)
    ) {
      rates.set(teacher, Money.cents(cents));
    }
    return new BillingSettings(
      new Tariff(
        Money.cents(int('threeHours')),
        Money.cents(int('twoHours')),
        Money.cents(int('hourAndHalf')),
        Money.cents(int('oneHour')),
        Money.cents(int('membershipFee')),
        int('familyPercent'),
        int('threeMonthsPercent'),
        int('sixMonthsPercent'),
        int('seasonPercent'),
      ),
      Money.cents(int('defaultPrivateRate')),
      rates,
      new ClubFiscalData(str('clubName'), str('clubTaxId'), str('clubAddress')),
    );
  }

  async saveSettings(s: BillingSettings): Promise<void> {
    const t = s.tariff;
    const data = {
      threeHours: t.threeHours.cents,
      twoHours: t.twoHours.cents,
      hourAndHalf: t.hourAndHalf.cents,
      oneHour: t.oneHour.cents,
      membershipFee: t.membershipFee.cents,
      familyPercent: t.familyPercent,
      threeMonthsPercent: t.threeMonthsPercent,
      sixMonthsPercent: t.sixMonthsPercent,
      seasonPercent: t.seasonPercent,
      defaultPrivateRate: s.defaultPrivateRate.cents,
      privateRates: Object.fromEntries([...s.privateRates].map(([k, m]) => [k, m.cents])),
      clubName: s.club.name,
      clubTaxId: s.club.taxId,
      clubAddress: s.club.address,
    };
    await this.sql`INSERT INTO billing_settings (id, data) VALUES (${SETTINGS_ID}, ${
      this.sql.json(data)
    })
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
  }
}

function toAccount(row: Row): StudentAccount {
  const rate = row.nullableInt('private_rate_cents');
  return StudentAccount.restore(
    StudentRef.fromString(row.string('student_id')),
    preferredPlanFromName(row.string('preferred_plan')),
    row.bool('member'),
    rate === null ? null : Money.cents(rate),
  );
}

export class SqlStudentAccountRepository implements StudentAccountRepository {
  constructor(private readonly sql: Sql) {}

  async account(student: StudentRef): Promise<StudentAccount | null> {
    const rows = await this.sql`SELECT * FROM billing_account WHERE student_id = ${student.value}`;
    return rows[0] ? toAccount(new Row(rows[0])) : null;
  }

  async accountsOf(students: StudentRef[]): Promise<Map<string, StudentAccount>> {
    if (students.length === 0) return new Map();
    const rows = await this.sql`SELECT * FROM billing_account
      WHERE student_id::text = ANY(${students.map((s) => s.value)})`;
    return new Map(Row.all(rows).map((row) => [row.string('student_id'), toAccount(row)]));
  }

  async saveAccount(account: StudentAccount): Promise<void> {
    const record = {
      student_id: account.student.value,
      preferred_plan: account.preferredPlan(),
      member: account.isMember(),
      private_rate_cents: account.privateRate()?.cents ?? null,
    };
    await this.sql`INSERT INTO billing_account ${this.sql(record)}
      ON CONFLICT (student_id) DO UPDATE SET ${
      this.sql(record, 'preferred_plan', 'member', 'private_rate_cents')
    }`;
  }
}

function toCharge(row: Row): Charge {
  const paidBy = row.nullableString('paid_by');
  const remindedOn = row.nullableString('reminded_on');
  const cancelledOn = row.nullableString('cancelled_on');
  return Charge.restore({
    id: ChargeId.fromString(row.string('id')),
    student: StudentRef.fromString(row.string('student_id')),
    kind: row.string('kind') as ChargeKind,
    period: YearMonth.fromString(row.string('period')),
    amount: Money.cents(row.int('amount_cents')),
    paidBy: paidBy === null ? null : PaymentId.fromString(paidBy),
    remindedOn: remindedOn === null ? null : LocalDate.fromString(remindedOn),
    manual: row.bool('manual'),
    note: row.nullableString('note'),
    discountPercent: row.int('discount_percent'),
    cancellation: cancelledOn === null ? null : {
      on: LocalDate.fromString(cancelledOn),
      kept: Money.cents(row.int('kept_cents')),
    },
    concept: row.nullableString('concept'),
  });
}

/** Lo que se debe de una cuota en SQL: su importe o, si se canceló, lo que se conservó. */
const DUE =
  `CASE WHEN c.cancelled_on IS NULL THEN c.amount_cents ELSE LEAST(c.amount_cents, c.kept_cents) END`;

/**
 * Cuotas con lo que tienen cubierto: lo que cubren los cobros del alumno (por tipo) se reparte entre sus cuotas de la
 * más antigua a la más reciente (ver cuotas-separadas-de-los-cobros.md); las de material, solo con los cobros que
 * apuntan a cada una (ver material-deportivo-como-cobro.md). Se usa como CTE `allocated`.
 */
export const ALLOCATED = `allocated AS (
  SELECT c.*, c.cancelled_on::text AS cancelled_day, (${DUE})::integer AS due_cents,
         LEAST(${DUE}, GREATEST(0,
           COALESCE(CASE WHEN c.kind = 'material' THEN mc.credit ELSE cr.credit END, 0)
           - COALESCE(SUM(${DUE}) OVER (
             PARTITION BY c.student_id, c.kind, CASE WHEN c.kind = 'material' THEN c.id END ORDER BY c.period
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)))::integer AS covered_cents
    FROM billing_charge c
    LEFT JOIN (SELECT student_id, kind, SUM(credit_cents) AS credit FROM billing_payment
                WHERE charge_id IS NULL GROUP BY student_id, kind) cr
      ON cr.student_id = c.student_id AND cr.kind = c.kind
    LEFT JOIN (SELECT charge_id, SUM(credit_cents) AS credit FROM billing_payment
                WHERE charge_id IS NOT NULL GROUP BY charge_id) mc ON mc.charge_id = c.id
)`;

export class SqlChargeRepository implements ChargeRepository {
  constructor(private readonly sql: Sql) {}

  async charge(id: ChargeId): Promise<Charge | null> {
    const rows = await this.sql`SELECT * FROM billing_charge WHERE id = ${id.value}`;
    return rows[0] ? toCharge(new Row(rows[0])) : null;
  }

  async chargeFor(
    student: StudentRef,
    kind: ChargeKind,
    period: YearMonth,
  ): Promise<Charge | null> {
    const rows = await this.sql`SELECT * FROM billing_charge
      WHERE student_id = ${student.value} AND kind = ${kind} AND period = ${period.toString()}`;
    return rows[0] ? toCharge(new Row(rows[0])) : null;
  }

  async chargedStudents(kind: ChargeKind, period: YearMonth): Promise<Set<string>> {
    const rows = await this.sql`SELECT DISTINCT student_id FROM billing_charge
      WHERE kind = ${kind} AND period = ${period.toString()}`;
    return new Set(Row.all(rows).map((r) => r.string('student_id')));
  }

  async allFor(student: StudentRef, kind: ChargeKind): Promise<Charge[]> {
    const rows = await this.sql`SELECT * FROM billing_charge
      WHERE student_id = ${student.value} AND kind = ${kind} ORDER BY period`;
    return Row.all(rows).map(toCharge);
  }

  async creditFor(student: StudentRef, kind: ChargeKind): Promise<Money> {
    const rows = await this.sql`SELECT COALESCE(SUM(credit_cents), 0) AS credit FROM billing_payment
      WHERE student_id = ${student.value} AND kind = ${kind}`;
    return Money.cents(rows[0] ? new Row(rows[0]).int('credit') : 0);
  }

  async creditForCharge(charge: ChargeId): Promise<Money> {
    const rows = await this.sql`SELECT COALESCE(SUM(credit_cents), 0) AS credit FROM billing_payment
      WHERE charge_id = ${charge.value}`;
    return Money.cents(rows[0] ? new Row(rows[0]).int('credit') : 0);
  }

  async paidTotal(student: StudentRef, kind: ChargeKind): Promise<Money> {
    const rows = await this.sql`SELECT COALESCE(SUM(total_cents), 0) AS total FROM billing_payment
      WHERE student_id = ${student.value} AND kind = ${kind}`;
    return Money.cents(rows[0] ? new Row(rows[0]).int('total') : 0);
  }

  async saveCharge(charge: Charge): Promise<void> {
    const record = {
      id: charge.id.value,
      student_id: charge.student.value,
      kind: charge.kind,
      period: charge.period.toString(),
      amount_cents: charge.fullAmount().cents,
      paid_by: charge.paidBy()?.value ?? null,
      reminded_on: charge.remindedOn()?.toString() ?? null,
      manual: charge.isManual(),
      note: charge.note(),
      discount_percent: charge.discountPercent(),
      cancelled_on: charge.cancelledOn()?.toString() ?? null,
      kept_cents: charge.keptOnCancellation()?.cents ?? null,
      concept: charge.concept(),
    };
    await this.sql`INSERT INTO billing_charge ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET amount_cents = EXCLUDED.amount_cents, paid_by = EXCLUDED.paid_by,
        reminded_on = EXCLUDED.reminded_on, manual = EXCLUDED.manual, note = EXCLUDED.note,
        discount_percent = EXCLUDED.discount_percent, cancelled_on = EXCLUDED.cancelled_on,
        kept_cents = EXCLUDED.kept_cents, concept = EXCLUDED.concept`;
  }
}

function invoiceData(i: Invoice): Record<string, string | number> {
  return {
    number: i.number.toString(),
    issuedOn: i.issuedOn.toString(),
    customerName: i.customer.name,
    customerTaxId: i.customer.taxId,
    customerAddress: i.customer.address,
    vatPercent: i.vatPercent,
    baseCents: i.base.cents,
    vatCents: i.vat.cents,
    totalCents: i.total.cents,
  };
}

function toInvoice(d: Record<string, unknown>): Invoice {
  const str = (k: string) => String(d[k]);
  const num = (k: string) => Number(d[k]);
  return new Invoice(
    DocumentNumber.fromString(str('number')),
    LocalDate.fromString(str('issuedOn')),
    new InvoiceCustomer(str('customerName'), str('customerTaxId'), str('customerAddress')),
    num('vatPercent'),
    Money.cents(num('baseCents')),
    Money.cents(num('vatCents')),
    Money.cents(num('totalCents')),
  );
}

function toPayment(row: Row): Payment {
  const lines = row.json('lines') as { label: string; amountCents: number }[];
  const invoice = row.json('invoice') as Record<string, unknown> | null;
  const chargeId = row.nullableString('charge_id');
  return Payment.restore({
    id: PaymentId.fromString(row.string('id')),
    student: StudentRef.fromString(row.string('student_id')),
    paidOn: LocalDate.fromString(row.string('paid_on')),
    method: row.string('method') as PaymentMethod,
    receipt: DocumentNumber.fromString(row.string('receipt_number')),
    kind: row.string('kind') as ChargeKind,
    concept: row.string('concept'),
    lines: lines.map((l) => new QuoteLine(l.label, Money.cents(l.amountCents))),
    total: Money.cents(row.int('total_cents')),
    periods: row.stringList('periods').map((p) => YearMonth.fromString(p)),
    invoice: invoice === null || invoice === undefined ? null : toInvoice(invoice),
    credit: Money.cents(row.int('credit_cents')),
    charge: chargeId === null ? null : ChargeId.fromString(chargeId),
  });
}

export class SqlPaymentRepository implements PaymentRepository {
  constructor(private readonly sql: Sql) {}

  async payment(id: PaymentId): Promise<Payment | null> {
    const rows = await this.sql`SELECT * FROM billing_payment WHERE id = ${id.value}`;
    return rows[0] ? toPayment(new Row(rows[0])) : null;
  }

  async savePayment(payment: Payment): Promise<void> {
    const invoice = payment.invoice();
    const record = {
      id: payment.id.value,
      student_id: payment.student.value,
      paid_on: payment.paidOn.toString(),
      method: payment.method,
      receipt_number: payment.receipt.toString(),
      kind: payment.kind,
      concept: payment.concept,
      lines: this.sql.json(
        payment.lines.map((l) => ({ label: l.label, amountCents: l.amount.cents })),
      ),
      total_cents: payment.total.cents,
      credit_cents: payment.credit.cents,
      periods: this.sql.json(payment.periods.map((p) => p.toString())),
      invoice_number: invoice?.number.toString() ?? null,
      invoice: invoice === null ? null : this.sql.json(invoiceData(invoice)),
      charge_id: payment.charge?.value ?? null,
    };
    await this.sql`INSERT INTO billing_payment ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET method = EXCLUDED.method, paid_on = EXCLUDED.paid_on,
        lines = EXCLUDED.lines, total_cents = EXCLUDED.total_cents, credit_cents = EXCLUDED.credit_cents,
        invoice_number = EXCLUDED.invoice_number, invoice = EXCLUDED.invoice`;
  }
}

/**
 * Incremento atómico con bloqueo de fila: dos cobros simultáneos nunca reciben el mismo número,
 * y si la transacción se deshace el número vuelve a quedar libre (sin huecos).
 */
export class SqlDocumentSequence implements DocumentSequence {
  constructor(private readonly sql: Sql) {}

  async next(prefix: string, seasonYear: number): Promise<number> {
    const rows = await this.sql`
      INSERT INTO billing_document_sequence (prefix, season_year, last_value) VALUES (${prefix}, ${seasonYear}, 1)
      ON CONFLICT (prefix, season_year) DO UPDATE SET last_value = billing_document_sequence.last_value + 1
      RETURNING last_value`;
    return rows[0] ? new Row(rows[0]).int('last_value') : 1;
  }
}

const GUARDIAN = `COALESCE(s.guardians::jsonb -> 0 ->> 'name', s.full_name)`;
const PHONE = `COALESCE(s.guardians::jsonb -> 0 ->> 'phone', s.own_phone, '')`;

function toChargeView(row: Row, today: LocalDate): ChargeView {
  const charge = toCharge(row);
  return {
    id: charge.id.value,
    studentId: charge.student.value,
    studentName: row.string('full_name'),
    guardianName: row.string('guardian_name'),
    guardianPhone: row.string('guardian_phone'),
    kind: charge.kind,
    period: charge.period.toString(),
    amountCents: charge.amount.cents,
    status: charge.statusOn(today, Money.cents(row.int('covered_cents'))),
    paymentId: charge.paidBy()?.value ?? null,
    coveredCents: row.int('covered_cents'),
    manual: charge.isManual(),
    note: charge.note(),
    receiptNumber: row.nullableString('receipt_number'),
    remindedOn: row.nullableString('reminded_on'),
    fullAmountCents: charge.fullAmount().cents,
    cancelledCents: charge.cancelledAmount().cents,
    concept: charge.concept(),
  };
}

function toSummary(row: Row): PaymentSummary {
  return {
    id: row.string('id'),
    receiptNumber: row.string('receipt_number'),
    paidOn: row.string('paid_on'),
    studentId: row.string('student_id'),
    studentName: row.string('full_name'),
    kind: row.string('kind'),
    concept: row.string('concept'),
    method: row.string('method'),
    totalCents: row.int('total_cents'),
    invoiceNumber: row.nullableString('invoice_number'),
  };
}

export class SqlBillingQuery implements BillingQuery {
  constructor(private readonly sql: Sql) {}

  async charges(month: YearMonth, today: LocalDate): Promise<ChargeView[]> {
    const seasonStart = Season.containing(month).firstMonth().toString();
    const rows = await this.sql.unsafe(
      `WITH ${ALLOCATED}
       SELECT c.*, s.full_name, ${GUARDIAN} AS guardian_name, ${PHONE} AS guardian_phone, p.receipt_number
         FROM allocated c
         JOIN students_student s ON s.id = c.student_id
         LEFT JOIN billing_payment p ON p.id = c.paid_by
        WHERE ((c.kind = 'monthly' AND c.period = $1)
           OR (c.kind = 'membership' AND c.period = $2 AND (c.covered_cents < c.due_cents OR $1 = $2))
           OR (c.kind = 'material' AND (c.period = $1 OR (c.period < $1 AND c.covered_cents < c.due_cents))))
          AND NOT (c.cancelled_on IS NOT NULL AND c.due_cents = 0)
        ORDER BY s.search_name, c.kind DESC, c.period`,
      [month.toString(), seasonStart],
    );
    return Row.all(rows).map((row) => toChargeView(row, today));
  }

  async overdue(today: LocalDate): Promise<ChargeView[]> {
    const rows = await this.sql.unsafe(
      `WITH ${ALLOCATED}
       SELECT c.*, s.full_name, ${GUARDIAN} AS guardian_name, ${PHONE} AS guardian_phone, NULL AS receipt_number
         FROM allocated c JOIN students_student s ON s.id = c.student_id
        WHERE c.kind = 'monthly' AND c.covered_cents < c.due_cents AND (c.period < $1 OR (c.period = $1 AND $2 > 5))
        ORDER BY c.period, s.search_name`,
      [YearMonth.of(today).toString(), today.day],
    );
    return Row.all(rows).map((row) => toChargeView(row, today));
  }

  async cancelled(season: Season): Promise<CancelledChargeView[]> {
    const rows = await this.sql`
      SELECT c.id, c.student_id, s.full_name, c.kind, c.period, c.amount_cents, c.cancelled_on::text AS cancelled_day,
             LEAST(c.amount_cents, c.kept_cents) AS kept
        FROM billing_charge c JOIN students_student s ON s.id = c.student_id
       WHERE c.cancelled_on IS NOT NULL AND c.kind <> 'material'
         AND c.period BETWEEN ${season.firstMonth().toString()} AND ${season.lastMonth().toString()}
       ORDER BY s.search_name, c.kind DESC, c.period`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      studentId: r.string('student_id'),
      studentName: r.string('full_name'),
      kind: r.string('kind'),
      period: r.string('period'),
      fullAmountCents: r.int('amount_cents'),
      keptCents: r.int('kept'),
      cancelledCents: r.int('amount_cents') - r.int('kept'),
      cancelledOn: r.string('cancelled_day'),
    }));
  }

  async payments(studentId: string | null): Promise<PaymentSummary[]> {
    const rows = await this
      .sql`SELECT p.*, s.full_name FROM billing_payment p JOIN students_student s ON s.id = p.student_id
      WHERE (${studentId}::uuid IS NULL OR p.student_id = ${studentId}::uuid)
      ORDER BY p.paid_on DESC, p.receipt_number DESC`;
    return Row.all(rows).map(toSummary);
  }

  async payment(id: string): Promise<PaymentDetail | null> {
    const rows = await this.sql.unsafe(
      `SELECT p.*, s.full_name, ${GUARDIAN} AS guardian_name FROM billing_payment p JOIN students_student s ON s.id = p.student_id WHERE p.id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    const lines = row.json('lines') as { label: string; amountCents: number }[];
    return {
      summary: toSummary(row),
      guardianName: row.string('guardian_name'),
      lines: lines.map((l) => ({ label: l.label, amountCents: l.amountCents })),
      periods: row.stringList('periods'),
      invoice: (row.json('invoice') as Record<string, unknown> | null) ?? null,
    };
  }
}

/**
 * Perfil de facturación a partir de Alumnado (tutor, hermanos) y Clases (horas semanales por tipo de grupo).
 */
export class SqlStudentDirectory implements StudentDirectory {
  constructor(private readonly sql: Sql) {}

  async activeIn(month: YearMonth): Promise<BillingStudent[]> {
    const from = month.firstDay().toString();
    const to = month.lastDay().toString();
    const rows = await this.sql.unsafe(
      `${this.columns()} FROM students_student s
        WHERE student_active_between(s.id, $1::date, $2::date)
        ORDER BY s.search_name`,
      [from, to],
    );
    return await this.build(Row.all(rows), from, to);
  }

  async find(student: StudentRef, day: LocalDate): Promise<BillingStudent | null> {
    const date = day.toString();
    const rows = await this.sql.unsafe(
      `${this.columns()} FROM students_student s WHERE s.id = $2`,
      [date, student.value],
    );
    return (await this.build(Row.all(rows), date, date))[0] ?? null;
  }

  private columns(): string {
    return `SELECT s.id, s.full_name, s.guardians, s.own_phone,
      EXISTS (
        SELECT 1 FROM students_student sib
         WHERE sib.id::text IN (SELECT jsonb_array_elements_text(s.sibling_ids::jsonb))
           AND (sib.withdrawn_on IS NULL OR sib.withdrawn_on > $1)
      ) AS has_siblings`;
  }

  private async build(rows: Row[], from: string, to: string): Promise<BillingStudent[]> {
    if (rows.length === 0) return [];
    const groups = await this.groupsByStudent(rows.map((r) => r.string('id')), from, to);
    return rows.map((row) => {
      const id = row.string('id');
      const guardians = row.json('guardians') as { name?: unknown; phone?: unknown }[];
      const first = guardians[0] ?? {};
      let regular = 0;
      const privateLessons: PrivateEnrolment[] = [];
      for (const group of groups.get(id) ?? []) {
        if (group.level === 'private_lesson') {
          privateLessons.push({
            groupName: group.name,
            teacherId: group.teacherId,
            weeklyHours: group.hours,
          });
        } else regular += group.hours;
      }
      return {
        id,
        name: row.string('full_name'),
        guardianName: typeof first.name === 'string' ? first.name : row.string('full_name'),
        guardianPhone: typeof first.phone === 'string'
          ? first.phone
          : row.nullableString('own_phone') ?? '',
        hasSiblings: row.bool('has_siblings'),
        regularWeeklyHours: regular,
        privateLessons,
      };
    });
  }

  /** Grupos con inscripción vigente en algún día del rango. */
  private async groupsByStudent(
    studentIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, { name: string; level: string; teacherId: string; hours: number }[]>> {
    const rows = await this.sql`
      SELECT e.student_id, g.name, g.level, g.teacher_id,
             COALESCE(e.attendance_start_minutes, g.start_minutes) AS start_minutes,
             COALESCE(e.attendance_end_minutes, g.end_minutes) AS end_minutes,
             COALESCE(jsonb_array_length(e.attendance_days::jsonb), jsonb_array_length(g.days::jsonb)) AS sessions
        FROM classes_enrolment e JOIN classes_group g ON g.id = e.class_group_id
       WHERE e.student_id IN ${
      this.sql(studentIds)
    } AND e.enrolled_on <= ${to} AND (e.ends_on IS NULL OR e.ends_on > ${from})
       ORDER BY g.name`;
    const groups = new Map<
      string,
      { name: string; level: string; teacherId: string; hours: number }[]
    >();
    for (const row of Row.all(rows)) {
      const list = groups.get(row.string('student_id')) ?? [];
      list.push({
        name: row.string('name'),
        level: row.string('level'),
        teacherId: row.string('teacher_id'),
        hours: ((row.int('end_minutes') - row.int('start_minutes')) / 60) * row.int('sessions'),
      });
      groups.set(row.string('student_id'), list);
    }
    return groups;
  }
}

/** Cuotas mensuales por mes de cobro y por mes al que corresponden (para el gráfico de la temporada). */
export class SqlFeeIncome implements FeeIncome {
  constructor(private readonly sql: Sql) {}

  async collectedByMonth(first: YearMonth, last: YearMonth): Promise<Map<string, number>> {
    const rows = await this.sql`
      SELECT to_char(paid_on, 'YYYY-MM') AS month, SUM(total_cents) AS cents FROM billing_payment
       WHERE kind = 'monthly' AND to_char(paid_on, 'YYYY-MM') BETWEEN ${first.toString()} AND ${last.toString()}
       GROUP BY 1`;
    return new Map(Row.all(rows).map((r) => [r.string('month'), r.int('cents')]));
  }

  async earnedByMonth(first: YearMonth, last: YearMonth): Promise<Map<string, number>> {
    // Reparto exacto: cada mes recibe el cociente y los primeros, un céntimo más hasta agotar el resto.
    const rows = await this.sql`
      SELECT period AS month, SUM(share) AS cents FROM (
        SELECT e.period,
               p.total_cents / k.n + CASE WHEN e.position - 1 < p.total_cents % k.n THEN 1 ELSE 0 END AS share
          FROM billing_payment p
          CROSS JOIN LATERAL (SELECT GREATEST(jsonb_array_length(p.periods::jsonb), 1) AS n) k
          CROSS JOIN LATERAL jsonb_array_elements_text(p.periods::jsonb) WITH ORDINALITY AS e(period, position)
         WHERE p.kind = 'monthly'
      ) shares
       WHERE period BETWEEN ${first.toString()} AND ${last.toString()}
       GROUP BY period`;
    return new Map(Row.all(rows).map((r) => [r.string('month'), r.int('cents')]));
  }
}
