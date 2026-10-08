import { LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
import {
  Advance,
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
  AdvanceRepository,
  ClassLoad,
  ClassLoadQuery,
  DutyRepository,
  HolidayCalendar,
  MonthlyFees,
  PayrollQuery,
  ProposalLog,
  ScheduleDirectory,
  SessionView,
  SettlementRepository,
  SubstitutionRepository,
  TeacherDutyView,
  TeacherGroupView,
  TeacherRate,
  TeacherRates,
  TeacherReportQuery,
  TeacherSeats,
  TeacherStudentView,
  TeacherSubstitutionView,
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

  async changePaidOn(teacher: TeacherRef, month: YearMonth, date: LocalDate): Promise<void> {
    await this.sql`UPDATE payroll_settlement SET paid_on = ${date.toString()}
      WHERE teacher_id = ${teacher.value} AND month = ${month.toString()}`;
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

function toAdvance(row: Row): Advance {
  return new Advance(
    row.string('id'),
    TeacherRef.fromString(row.string('teacher_id')),
    YearMonth.fromString(row.string('month')),
    Money.cents(row.int('amount_cents')),
    LocalDate.fromString(row.string('paid_on')),
    row.nullableString('note'),
  );
}

/** Anticipos a profesores (tabla `payroll_advance`). */
export class SqlAdvanceRepository implements AdvanceRepository {
  constructor(private readonly sql: Sql) {}

  async forTeacherAdvances(teacher: TeacherRef): Promise<Advance[]> {
    return Row.all(
      await this.sql`SELECT id, teacher_id, month, amount_cents, paid_on::text AS paid_on, note
        FROM payroll_advance WHERE teacher_id = ${teacher.value} ORDER BY paid_on DESC`,
    ).map(toAdvance);
  }

  async advancesOf(month: YearMonth): Promise<Advance[]> {
    return Row.all(
      await this.sql`SELECT id, teacher_id, month, amount_cents, paid_on::text AS paid_on, note
        FROM payroll_advance WHERE month = ${month.toString()}`,
    ).map(toAdvance);
  }

  async advance(id: string): Promise<Advance | null> {
    const rows = await this
      .sql`SELECT id, teacher_id, month, amount_cents, paid_on::text AS paid_on, note
      FROM payroll_advance WHERE id::text = ${id}`;
    return rows[0] ? toAdvance(new Row(rows[0])) : null;
  }

  async saveAdvance(a: Advance): Promise<void> {
    await this.sql`INSERT INTO payroll_advance ${
      this.sql({
        id: a.id,
        teacher_id: a.teacher.value,
        month: a.month.toString(),
        amount_cents: a.amount.cents,
        paid_on: a.paidOn.toString(),
        note: a.note,
      })
    }`;
  }

  async deleteAdvance(id: string): Promise<void> {
    await this.sql`DELETE FROM payroll_advance WHERE id::text = ${id}`;
  }
}

const WEEKDAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Ficha del profesor: sus clases, alumnos, sustituciones y turnos. */
export class SqlTeacherReportQuery implements TeacherReportQuery {
  constructor(private readonly sql: Sql) {}

  async groups(teacherId: string, on: LocalDate): Promise<TeacherGroupView[]> {
    const day = on.toString();
    const rows = await this.sql`
      SELECT g.id, g.name, g.days, g.start_minutes, g.end_minutes, g.classroom, g.capacity,
             (SELECT COUNT(*) FROM classes_enrolment e WHERE e.class_group_id = g.id
                AND e.enrolled_on <= ${day} AND (e.ends_on IS NULL OR e.ends_on > ${day})) AS students,
             (SELECT COALESCE(jsonb_object_agg(d.day, (
                SELECT COUNT(*) FROM classes_enrolment e WHERE e.class_group_id = g.id
                   AND e.enrolled_on <= ${day} AND (e.ends_on IS NULL OR e.ends_on > ${day})
                   AND (e.attendance_days IS NULL OR e.attendance_days::jsonb @> jsonb_build_array(d.day::int)))), '{}'::jsonb)
                FROM jsonb_array_elements_text(g.days::jsonb) AS d(day)) AS by_day
        FROM classes_group g WHERE g.teacher_id = ${teacherId} ORDER BY g.start_minutes, g.name`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      name: r.string('name'),
      days: r.intList('days').map((d) => WEEKDAY_CODES[d - 1] ?? String(d)),
      start: hhmm(r.int('start_minutes')),
      end: hhmm(r.int('end_minutes')),
      classroom: r.string('classroom'),
      capacity: r.int('capacity'),
      occupancyByDay: Object.fromEntries(
        Object.entries(r.json('by_day') as Record<string, unknown>).map((
          [k, v],
        ) => [WEEKDAY_CODES[Number(k) - 1] ?? k, Number(v)]),
      ),
      students: r.int('students'),
    }));
  }

  async students(teacherId: string, on: LocalDate): Promise<TeacherStudentView[]> {
    const day = on.toString();
    const rows = await this.sql`
      SELECT s.id, s.full_name, array_agg(g.name ORDER BY g.name) AS groups,
             SUM((COALESCE(e.attendance_end_minutes, g.end_minutes) - COALESCE(e.attendance_start_minutes, g.start_minutes))
                 * COALESCE(jsonb_array_length(e.attendance_days::jsonb), jsonb_array_length(g.days::jsonb))) AS minutes
        FROM classes_enrolment e
        JOIN classes_group g ON g.id = e.class_group_id
        JOIN students_student s ON s.id = e.student_id
       WHERE g.teacher_id = ${teacherId} AND e.enrolled_on <= ${day} AND (e.ends_on IS NULL OR e.ends_on > ${day})
       GROUP BY s.id, s.full_name, s.search_name ORDER BY s.search_name`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      name: r.string('full_name'),
      groups: r.stringList('groups'),
      weeklyMinutes: r.int('minutes'),
    }));
  }

  async substitutions(
    teacherId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<TeacherSubstitutionView[]> {
    const rows = await this.sql`
      SELECT s.substitution_date::text AS date, COALESCE(g.name, d.label) AS label, s.reason,
             CASE WHEN s.teacher_id = ${teacherId} THEN 'gave' ELSE 'received' END AS role,
             CASE WHEN s.teacher_id = ${teacherId} THEN o.full_name ELSE t.full_name END AS other_name
        FROM payroll_substitution s
        LEFT JOIN classes_group g ON g.id = s.group_id
        LEFT JOIN payroll_duty d ON d.id = s.duty_id
        JOIN teachers_teacher o ON o.id = COALESCE(g.teacher_id, d.teacher_id)
        JOIN teachers_teacher t ON t.id = s.teacher_id
       WHERE (s.teacher_id = ${teacherId} OR COALESCE(g.teacher_id, d.teacher_id) = ${teacherId})
         AND s.substitution_date BETWEEN ${from.toString()} AND ${to.toString()}
       ORDER BY s.substitution_date DESC`;
    return Row.all(rows).map((r) => ({
      date: r.string('date'),
      label: r.string('label'),
      role: r.string('role') === 'gave' ? 'gave' as const : 'received' as const,
      otherName: r.string('other_name'),
      reason: r.nullableString('reason'),
    }));
  }

  async duties(teacherId: string): Promise<TeacherDutyView[]> {
    const rows = await this.sql`SELECT * FROM payroll_duty WHERE teacher_id = ${teacherId}
      ORDER BY weekday, start_minutes`;
    return Row.all(rows).map((r) => ({
      weekday: r.int('weekday'),
      start: hhmm(r.int('start_minutes')),
      end: hhmm(r.int('end_minutes')),
      label: r.string('label'),
    }));
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

export class SqlPayrollQuery implements PayrollQuery, ClassLoadQuery {
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

  async classLoad(month: YearMonth): Promise<ClassLoad> {
    const from = month.firstDay().toString();
    const to = month.lastDay().toString();
    // Día de referencia para la ocupación: hoy si cae en el mes; si no, el último día (pasado) o el primero (futuro).
    const today = this.today().toString();
    const on = today < from ? from : today > to ? to : today;
    // Plazas de cada clase contando cada día: alumnos que van ese día (horario especial incluido) frente al cupo.
    const seats = await this.sql`
      SELECT g.teacher_id, g.name,
             g.capacity * jsonb_array_length(g.days::jsonb) AS capacity,
             (SELECT COUNT(*) FROM classes_enrolment e, jsonb_array_elements_text(g.days::jsonb) AS d(day)
               WHERE e.class_group_id = g.id AND e.enrolled_on <= ${on} AND (e.ends_on IS NULL OR e.ends_on > ${on})
                 AND (e.attendance_days IS NULL OR e.attendance_days::jsonb @> jsonb_build_array(d.day::int))) AS occupied
        FROM classes_group g ORDER BY g.name`;
    const teachers = new Map<string, TeacherSeats>();
    for (const row of Row.all(seats)) {
      const teacher = row.string('teacher_id');
      const current = teachers.get(teacher) ?? { groups: [], occupied: 0, capacity: 0 };
      current.groups.push(row.string('name'));
      current.occupied += row.int('occupied');
      current.capacity += row.int('capacity');
      teachers.set(teacher, current);
    }
    // Minutos semanales de cada alumno con cada profesor durante el mes (con su horario especial, si lo tiene).
    const hours = await this.sql`
      SELECT e.student_id, g.teacher_id,
             SUM((COALESCE(e.attendance_end_minutes, g.end_minutes) - COALESCE(e.attendance_start_minutes, g.start_minutes))
                 * COALESCE(jsonb_array_length(e.attendance_days::jsonb), jsonb_array_length(g.days::jsonb))) AS minutes
        FROM classes_enrolment e JOIN classes_group g ON g.id = e.class_group_id
       WHERE e.enrolled_on <= ${to} AND (e.ends_on IS NULL OR e.ends_on > ${from})
       GROUP BY e.student_id, g.teacher_id`;
    const students = new Map<string, Map<string, number>>();
    for (const row of Row.all(hours)) {
      const shares = students.get(row.string('student_id')) ?? new Map<string, number>();
      shares.set(row.string('teacher_id'), row.int('minutes'));
      students.set(row.string('student_id'), shares);
    }
    return { teachers, students };
  }
}

/**
 * Cuotas mensuales del mes por alumno (ya con descuentos) y, para quien aún no la tenga en un mes futuro, la prevista.
 */
export class SqlMonthlyFees implements MonthlyFees {
  constructor(
    private readonly sql: Sql,
    private readonly expected: (
      month: string,
    ) => Promise<{ student: { id: string }; amount: Money }[]>,
  ) {}

  async monthlyFees(month: YearMonth): Promise<Map<string, number>> {
    const rows = await this.sql`
      SELECT student_id, amount_cents FROM billing_charge WHERE kind = 'monthly' AND period = ${month.toString()}`;
    const fees = new Map(Row.all(rows).map((r) => [r.string('student_id'), r.int('amount_cents')]));
    for (const { student, amount } of await this.expected(month.toString())) {
      if (!fees.has(student.id)) fees.set(student.id, amount.cents);
    }
    return fees;
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
  const duty = row.nullableString('duty_id');
  return new Substitution(
    duty === null ? GroupRef.fromString(row.string('group_id')) : DutyRef.fromString(duty),
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

  async find(source: string, date: LocalDate) {
    const [kind, id = ''] = source.split(':');
    const column = kind === 'duty' ? 'duty_id' : 'group_id';
    const rows = await this.sql`SELECT * FROM payroll_substitution
      WHERE ${this.sql(column)}::text = ${id} AND substitution_date = ${date.toString()}`;
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
      group_id: s.group?.value ?? null,
      duty_id: s.duty?.value ?? null,
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
  /** La clase sustituida, o null si es un turno. */
  groupId: string | null;
  dutyId: string | null;
  /** Nombre de la clase o del turno. */
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
      SELECT s.id, s.substitution_date::text AS date, s.group_id, s.duty_id, s.reason,
             COALESCE(g.name, d.label) AS group_name,
             COALESCE(g.start_minutes, d.start_minutes) AS start_minutes,
             COALESCE(g.end_minutes, d.end_minutes) AS end_minutes,
             o.id AS owner_id, o.full_name AS owner_name,
             s.teacher_id, t.full_name AS substitute_name
        FROM payroll_substitution s
        LEFT JOIN classes_group g ON g.id = s.group_id
        LEFT JOIN payroll_duty d ON d.id = s.duty_id
        JOIN teachers_teacher o ON o.id = COALESCE(g.teacher_id, d.teacher_id)
        JOIN teachers_teacher t ON t.id = s.teacher_id
       WHERE s.substitution_date BETWEEN ${from.toString()} AND ${to.toString()}
       ORDER BY s.substitution_date, 7`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      date: r.string('date'),
      groupId: r.nullableString('group_id'),
      dutyId: r.nullableString('duty_id'),
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
