import { LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
import {
  GroupRef,
  MonthlySettlement,
  ScheduledGroup,
  SessionMinutes,
  Settlement,
  SettlementLine,
  TeacherRef,
  TimesheetEntry,
  TimesheetEntryId,
} from '../../domain/payroll/mod.ts';
import type {
  PayrollQuery,
  ProposalLog,
  ScheduleDirectory,
  SessionView,
  SettlementRepository,
  TeacherActivity,
  TeacherRate,
  TeacherRates,
  TimesheetRepository,
} from '../../application/payroll/mod.ts';
import { Row, type Sql } from './sql.ts';

function toEntry(row: Row): TimesheetEntry {
  const group = row.nullableString('group_id');
  return TimesheetEntry.record(
    TimesheetEntryId.fromString(row.string('id')),
    TeacherRef.fromString(row.string('teacher_id')),
    LocalDate.fromString(row.string('session_date')),
    group === null ? null : GroupRef.fromString(group),
    row.string('label'),
    SessionMinutes.fromMinutes(row.int('minutes')),
    row.bool('from_schedule'),
  );
}

export class SqlTimesheetRepository implements TimesheetRepository {
  constructor(private readonly sql: Sql) {}

  async entry(id: TimesheetEntryId): Promise<TimesheetEntry | null> {
    const rows = await this.sql`SELECT * FROM payroll_session WHERE id = ${id.value}`;
    return rows[0] ? toEntry(new Row(rows[0])) : null;
  }

  async save(entry: TimesheetEntry): Promise<void> {
    const record = {
      id: entry.id.value,
      teacher_id: entry.teacher().value,
      session_date: entry.date.toString(),
      group_id: entry.group?.value ?? null,
      label: entry.label,
      minutes: entry.minutes().minutes,
      from_schedule: entry.fromSchedule,
    };
    await this.sql`INSERT INTO payroll_session ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, minutes = EXCLUDED.minutes`;
  }

  async delete(id: TimesheetEntryId): Promise<void> {
    await this.sql`DELETE FROM payroll_session WHERE id = ${id.value}`;
  }

  async forMonth(month: YearMonth): Promise<TimesheetEntry[]> {
    const rows = await this.sql`SELECT * FROM payroll_session
      WHERE session_date BETWEEN ${month.firstDay().toString()} AND ${month.lastDay().toString()} ORDER BY session_date, id`;
    return Row.all(rows).map(toEntry);
  }

  async onDate(date: LocalDate): Promise<TimesheetEntry[]> {
    const rows = await this
      .sql`SELECT * FROM payroll_session WHERE session_date = ${date.toString()} ORDER BY id`;
    return Row.all(rows).map(toEntry);
  }
}

function toSettlement(row: Row): MonthlySettlement {
  const lines = row.json('lines') as { label: string; minutes: number; amountCents: number }[];
  return new MonthlySettlement(
    TeacherRef.fromString(row.string('teacher_id')),
    YearMonth.fromString(row.string('month')),
    new Settlement(
      row.int('minutes'),
      Money.cents(row.int('rate_cents')),
      Money.cents(row.int('amount_cents')),
      lines.map((l) => new SettlementLine(l.label, l.minutes, Money.cents(l.amountCents))),
    ),
    LocalDate.fromString(row.string('paid_on')),
  );
}

/** Liquidaciones pagadas y registro de meses propuestos. */
export class SqlSettlementRepository implements SettlementRepository, ProposalLog {
  constructor(private readonly sql: Sql) {}

  async settlement(teacher: TeacherRef, month: YearMonth): Promise<MonthlySettlement | null> {
    const rows = await this
      .sql`SELECT * FROM payroll_settlement WHERE teacher_id = ${teacher.value} AND month = ${month.toString()}`;
    return rows[0] ? toSettlement(new Row(rows[0])) : null;
  }

  async settlementsOf(month: YearMonth): Promise<MonthlySettlement[]> {
    return Row.all(
      await this.sql`SELECT * FROM payroll_settlement WHERE month = ${month.toString()}`,
    ).map(toSettlement);
  }

  async saveSettlement(s: MonthlySettlement): Promise<void> {
    await this
      .sql`INSERT INTO payroll_settlement (teacher_id, month, minutes, rate_cents, amount_cents, lines, paid_on)
      VALUES (${s.teacher.value}, ${s.month.toString()}, ${s.settlement.minutes}, ${s.settlement.rate.cents}, ${s.settlement.amount.cents},
              ${
      this.sql.json(
        s.settlement.lines.map((l) => ({
          label: l.label,
          minutes: l.minutes,
          amountCents: l.amount.cents,
        })),
      )
    },
              ${s.paidOn.toString()})`;
  }

  async wasProposed(month: YearMonth): Promise<boolean> {
    return (await this.sql`SELECT 1 FROM payroll_proposed_month WHERE month = ${month.toString()}`)
      .length > 0;
  }

  async markProposed(month: YearMonth): Promise<void> {
    await this
      .sql`INSERT INTO payroll_proposed_month (month) VALUES (${month.toString()}) ON CONFLICT DO NOTHING`;
  }
}

/** Tarifas de Teachers vistas desde Payroll. */
export class SqlTeacherRates implements TeacherRates {
  constructor(private readonly sql: Sql) {}

  async all(): Promise<TeacherRate[]> {
    const rows = await this
      .sql`SELECT id, full_name, hourly_rate_cents, active FROM teachers_teacher ORDER BY full_name`;
    return Row.all(rows).map((row) => ({
      id: row.string('id'),
      name: row.string('full_name'),
      rate: Money.cents(row.int('hourly_rate_cents')),
      active: row.bool('active'),
    }));
  }
}

/** Horario de Clases visto desde Payroll. */
export class SqlScheduleDirectory implements ScheduleDirectory {
  constructor(private readonly sql: Sql) {}

  async groups(): Promise<ScheduledGroup[]> {
    const rows = await this
      .sql`SELECT id, name, teacher_id, days, start_minutes, end_minutes FROM classes_group ORDER BY name`;
    return Row.all(rows).map((row) =>
      new ScheduledGroup(
        GroupRef.fromString(row.string('id')),
        row.string('name'),
        TeacherRef.fromString(row.string('teacher_id')),
        row.intList('days'),
        row.int('end_minutes') - row.int('start_minutes'),
      )
    );
  }
}

export class SqlPayrollQuery implements PayrollQuery {
  constructor(
    private readonly sql: Sql,
    private readonly today: () => LocalDate,
  ) {}

  async sessions(month: YearMonth, teacherId: string | null): Promise<SessionView[]> {
    const rows = await this.sql`
      SELECT s.*, t.full_name, COALESCE(st.rate_cents, t.hourly_rate_cents) AS rate_cents, st.teacher_id IS NOT NULL AS locked
        FROM payroll_session s
        JOIN teachers_teacher t ON t.id = s.teacher_id
        LEFT JOIN payroll_settlement st ON st.teacher_id = s.teacher_id AND st.month = ${month.toString()}
       WHERE s.session_date BETWEEN ${month.firstDay().toString()} AND ${month.lastDay().toString()}
         AND (${teacherId}::uuid IS NULL OR s.teacher_id = ${teacherId}::uuid)
       ORDER BY s.session_date, s.label`;
    return Row.all(rows).map((row) => ({
      id: row.string('id'),
      date: row.string('session_date'),
      teacherId: row.string('teacher_id'),
      teacherName: row.string('full_name'),
      groupId: row.nullableString('group_id'),
      label: row.string('label'),
      minutes: row.int('minutes'),
      costCents: Math.round((row.int('rate_cents') * row.int('minutes')) / 60),
      fromSchedule: row.bool('from_schedule'),
      locked: row.bool('locked'),
    }));
  }

  async activity(month: YearMonth): Promise<Map<string, TeacherActivity>> {
    const today = this.today().toString();
    const from = month.firstDay().toString();
    const to = month.lastDay().toString();
    // Grupos y ocupación actual por profesor.
    const groups = await this.sql`
      SELECT g.teacher_id, g.name, g.capacity,
             (SELECT COUNT(*) FROM classes_enrolment e WHERE e.class_group_id = g.id AND e.enrolled_on <= ${today} AND (e.ends_on IS NULL OR e.ends_on > ${today})) AS occupied
        FROM classes_group g ORDER BY g.name`;
    const activity = new Map<
      string,
      { groups: string[]; occupied: number; capacity: number; income: number }
    >();
    for (const row of Row.all(groups)) {
      const teacher = row.string('teacher_id');
      const current = activity.get(teacher) ?? { groups: [], occupied: 0, capacity: 0, income: 0 };
      current.groups.push(row.string('name'));
      current.occupied += row.int('occupied');
      current.capacity += row.int('capacity');
      activity.set(teacher, current);
    }
    // Horas semanales de cada alumno por profesor durante el mes, para repartir su cuota.
    const hours = await this.sql`
      SELECT e.student_id, g.teacher_id, SUM((g.end_minutes - g.start_minutes) * jsonb_array_length(g.days::jsonb)) AS minutes
        FROM classes_enrolment e JOIN classes_group g ON g.id = e.class_group_id
       WHERE e.enrolled_on <= ${to} AND (e.ends_on IS NULL OR e.ends_on > ${from})
       GROUP BY e.student_id, g.teacher_id`;
    const byStudent = new Map<string, Map<string, number>>();
    for (const row of Row.all(hours)) {
      const shares = byStudent.get(row.string('student_id')) ?? new Map<string, number>();
      shares.set(row.string('teacher_id'), row.int('minutes'));
      byStudent.set(row.string('student_id'), shares);
    }
    // Lo realmente cobrado por ese mes: el total del cobro repartido entre los meses que cubre (con sus descuentos).
    const charges = await this.sql`
      SELECT c.student_id, ROUND(p.total_cents::numeric / GREATEST(jsonb_array_length(p.periods::jsonb), 1)) AS amount_cents
        FROM billing_charge c JOIN billing_payment p ON p.id = c.paid_by
       WHERE c.kind = 'monthly' AND c.period = ${month.toString()}`;
    for (const row of Row.all(charges)) {
      const shares = byStudent.get(row.string('student_id')) ?? new Map<string, number>();
      const total = [...shares.values()].reduce((sum, m) => sum + m, 0);
      for (const [teacher, minutes] of shares) {
        const current = activity.get(teacher);
        if (total > 0 && current) current.income += (row.int('amount_cents') * minutes) / total;
      }
    }
    return new Map(
      [...activity].map((
        [teacher, a],
      ) => [teacher, {
        groups: a.groups,
        occupied: a.occupied,
        capacity: a.capacity,
        incomeCents: Math.round(a.income),
      }]),
    );
  }
}
