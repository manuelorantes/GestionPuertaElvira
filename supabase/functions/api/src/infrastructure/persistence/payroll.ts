import { LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
import {
  ClubDuty,
  DutyRef,
  GroupRef,
  MonthlySettlement,
  ScheduledGroup,
  SessionMinutes,
  Settlement,
  SettlementLine,
  Substitution,
  TeacherRef,
  TimesheetEntry,
  TimesheetEntryId,
} from '../../domain/payroll/mod.ts';
import type {
  DutyRepository,
  HolidayCalendar,
  PayrollQuery,
  ProposalLog,
  ScheduleDirectory,
  SessionView,
  SettlementRepository,
  SubstitutionRepository,
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
    row.nullableInt('start_minutes'),
    row.nullableString('source'),
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
      start_minutes: entry.start,
      source: entry.source,
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

  async wasProposed(date: LocalDate): Promise<boolean> {
    return (await this
      .sql`SELECT 1 FROM payroll_proposed_day WHERE proposed_date = ${date.toString()}`)
      .length > 0;
  }

  async markProposed(date: LocalDate): Promise<void> {
    await this
      .sql`INSERT INTO payroll_proposed_day (proposed_date) VALUES (${date.toString()}) ON CONFLICT DO NOTHING`;
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
        row.int('start_minutes'),
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
    // Lo realmente cobrado por ese mes: el total de cada cobro repartido entre los meses que cubre (con sus descuentos).
    const charges = await this.sql`
      SELECT p.student_id, ROUND(p.total_cents::numeric / GREATEST(jsonb_array_length(p.periods::jsonb), 1)) AS amount_cents
        FROM billing_payment p
       WHERE p.kind = 'monthly' AND p.periods::jsonb ? ${month.toString()}`;
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

/** Festivos (tabla `payroll_holiday`). */
export class SqlHolidayCalendar implements HolidayCalendar {
  constructor(private readonly sql: Sql) {}

  async isHoliday(date: LocalDate): Promise<boolean> {
    return (await this.sql`SELECT 1 FROM payroll_holiday WHERE holiday_date = ${date.toString()}`)
      .length > 0;
  }

  async add(date: LocalDate, name: string): Promise<void> {
    await this
      .sql`INSERT INTO payroll_holiday (holiday_date, name) VALUES (${date.toString()}, ${name})
      ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name`;
  }

  async remove(date: LocalDate): Promise<void> {
    await this.sql`DELETE FROM payroll_holiday WHERE holiday_date = ${date.toString()}`;
  }

  async between(from: LocalDate, to: LocalDate): Promise<{ date: string; name: string }[]> {
    const rows = await this.sql`SELECT holiday_date::text AS date, name FROM payroll_holiday
      WHERE holiday_date BETWEEN ${from.toString()} AND ${to.toString()} ORDER BY holiday_date`;
    return Row.all(rows).map((r) => ({ date: r.string('date'), name: r.string('name') }));
  }
}

function toDuty(row: Row): ClubDuty {
  return new ClubDuty(
    DutyRef.fromString(row.string('id')),
    TeacherRef.fromString(row.string('teacher_id')),
    row.int('weekday'),
    row.int('start_minutes'),
    row.int('end_minutes'),
    row.string('label'),
  );
}

/** Turnos fijos (tabla `payroll_duty`). */
export class SqlDutyRepository implements DutyRepository {
  constructor(private readonly sql: Sql) {}

  async all(): Promise<ClubDuty[]> {
    return Row.all(await this.sql`SELECT * FROM payroll_duty ORDER BY weekday, start_minutes`).map(
      toDuty,
    );
  }

  async duty(id: DutyRef): Promise<ClubDuty | null> {
    const rows = await this.sql`SELECT * FROM payroll_duty WHERE id = ${id.value}`;
    return rows[0] ? toDuty(new Row(rows[0])) : null;
  }

  async save(duty: ClubDuty): Promise<void> {
    const record = {
      id: duty.id.value,
      teacher_id: duty.teacher.value,
      weekday: duty.weekday,
      start_minutes: duty.start,
      end_minutes: duty.end,
      label: duty.label,
    };
    await this.sql`INSERT INTO payroll_duty ${this.sql(record)} ON CONFLICT (id) DO UPDATE SET ${
      this.sql(record, 'teacher_id', 'weekday', 'start_minutes', 'end_minutes', 'label')
    }`;
  }

  async delete(id: DutyRef): Promise<void> {
    await this.sql`DELETE FROM payroll_duty WHERE id = ${id.value}`;
  }
}

function toSubstitution(row: Row): Substitution {
  return new Substitution(
    GroupRef.fromString(row.string('group_id')),
    LocalDate.fromString(row.string('substitution_date')),
    TeacherRef.fromString(row.string('teacher_id')),
    row.nullableString('reason'),
  );
}

/** Sustituciones planificadas (tabla `payroll_substitution`). */
export class SqlSubstitutionRepository implements SubstitutionRepository {
  constructor(private readonly sql: Sql) {}

  async onDate(date: LocalDate): Promise<Substitution[]> {
    return Row.all(
      await this
        .sql`SELECT * FROM payroll_substitution WHERE substitution_date = ${date.toString()}`,
    ).map(toSubstitution);
  }

  async find(group: GroupRef, date: LocalDate) {
    const rows = await this.sql`SELECT * FROM payroll_substitution
      WHERE group_id = ${group.value} AND substitution_date = ${date.toString()}`;
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    return { id: row.string('id'), substitution: toSubstitution(row) };
  }

  async byId(id: string): Promise<Substitution | null> {
    const rows = await this.sql`SELECT * FROM payroll_substitution WHERE id::text = ${id}`;
    return rows[0] ? toSubstitution(new Row(rows[0])) : null;
  }

  async save(id: string, s: Substitution): Promise<void> {
    const record = {
      id,
      group_id: s.group.value,
      substitution_date: s.date.toString(),
      teacher_id: s.teacher.value,
      reason: s.reason,
    };
    await this.sql`INSERT INTO payroll_substitution ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, reason = EXCLUDED.reason`;
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM payroll_substitution WHERE id::text = ${id}`;
  }
}

/** Sustitución tal y como se ve en el calendario. */
export interface SubstitutionView {
  id: string;
  date: string;
  groupId: string;
  groupName: string;
  start: string;
  end: string;
  teacherId: string;
  teacherName: string;
  substituteId: string;
  substituteName: string;
  reason: string | null;
}

/** Turno fijo tal y como se ve en la lista. */
export interface DutyView {
  id: string;
  teacherId: string;
  teacherName: string;
  weekday: number;
  start: string;
  end: string;
  label: string;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Lecturas para el calendario de sustituciones y la lista de turnos. */
export class SqlPlanningQuery {
  constructor(private readonly sql: Sql) {}

  async substitutions(from: LocalDate, to: LocalDate): Promise<SubstitutionView[]> {
    const rows = await this.sql`
      SELECT s.id, s.substitution_date::text AS date, s.group_id, s.reason, g.name AS group_name,
             g.start_minutes, g.end_minutes, g.teacher_id AS owner_id, o.full_name AS owner_name,
             s.teacher_id, t.full_name AS substitute_name
        FROM payroll_substitution s
        JOIN classes_group g ON g.id = s.group_id
        JOIN teachers_teacher o ON o.id = g.teacher_id
        JOIN teachers_teacher t ON t.id = s.teacher_id
       WHERE s.substitution_date BETWEEN ${from.toString()} AND ${to.toString()}
       ORDER BY s.substitution_date, g.start_minutes`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      date: r.string('date'),
      groupId: r.string('group_id'),
      groupName: r.string('group_name'),
      start: hhmm(r.int('start_minutes')),
      end: hhmm(r.int('end_minutes')),
      teacherId: r.string('owner_id'),
      teacherName: r.string('owner_name'),
      substituteId: r.string('teacher_id'),
      substituteName: r.string('substitute_name'),
      reason: r.nullableString('reason'),
    }));
  }

  async duties(): Promise<DutyView[]> {
    const rows = await this.sql`SELECT d.*, t.full_name FROM payroll_duty d
      JOIN teachers_teacher t ON t.id = d.teacher_id ORDER BY d.weekday, d.start_minutes`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      teacherId: r.string('teacher_id'),
      teacherName: r.string('full_name'),
      weekday: r.int('weekday'),
      start: hhmm(r.int('start_minutes')),
      end: hhmm(r.int('end_minutes')),
      label: r.string('label'),
    }));
  }
}
