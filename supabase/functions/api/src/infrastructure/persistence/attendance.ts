import { LocalDate, YearMonth } from '../../domain/common/mod.ts';
import { ActivityCheck, type ActivityCheckKind } from '../../domain/attendance/mod.ts';
import type {
  ActivityCheckRepository,
  ClassRoster,
  GroupAttendanceData,
  GroupAttendanceQuery,
  MissedRollCall,
  MissedRollCallQuery,
  RosterStudent,
  StudentAttendanceQuery,
  StudentAttendanceSummary,
  TeacherGroupRoster,
  TeacherRosterQuery,
} from '../../application/attendance/mod.ts';
import { Row, type Sql } from './sql.ts';

const WEEKDAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Alumnos inscritos en una clase un día (los de horario especial, solo los días que vienen). */
export class SqlClassRoster implements ClassRoster {
  constructor(private readonly sql: Sql) {}

  async studentsOn(groupId: string, date: LocalDate): Promise<RosterStudent[]> {
    const day = date.toString();
    const rows = await this.sql`
      SELECT s.id, s.full_name
        FROM classes_enrolment e
        JOIN students_student s ON s.id = e.student_id
       WHERE e.class_group_id = ${groupId}
         AND e.enrolled_on <= ${day} AND (e.ends_on IS NULL OR e.ends_on > ${day})
         AND (e.attendance_days IS NULL OR e.attendance_days::jsonb @> jsonb_build_array(${date.isoWeekday()}::int))
       ORDER BY s.search_name`;
    return Row.all(rows).map((r) => ({ id: r.string('id'), name: r.string('full_name') }));
  }

  async classroomOf(groupId: string): Promise<string | null> {
    const rows = await this.sql`SELECT classroom FROM classes_group WHERE id = ${groupId}`;
    return rows[0] ? new Row(rows[0]).string('classroom') : null;
  }

  async clubStudentsOn(date: LocalDate): Promise<RosterStudent[]> {
    const day = date.toString();
    const rows = await this.sql`SELECT id, full_name FROM students_student
      WHERE joined_on <= ${day} AND (withdrawn_on IS NULL OR withdrawn_on > ${day}) ORDER BY search_name`;
    return Row.all(rows).map((r) => ({ id: r.string('id'), name: r.string('full_name') }));
  }

  async namesOf(ids: readonly string[]): Promise<RosterStudent[]> {
    if (ids.length === 0) return [];
    const rows = await this.sql`SELECT id, full_name FROM students_student
      WHERE id::text = ANY(${[...ids]}) ORDER BY search_name`;
    return Row.all(rows).map((r) => ({ id: r.string('id'), name: r.string('full_name') }));
  }
}

/** Grupos de los que un profesor es titular, con sus alumnos (sin datos de contacto) y los días que viene cada uno. */
export class SqlTeacherRosterQuery implements TeacherRosterQuery {
  constructor(private readonly sql: Sql) {}

  async groupsOf(teacherId: string, on: LocalDate): Promise<TeacherGroupRoster[]> {
    const day = on.toString();
    const groups = await this.sql`
      SELECT id, name, days, start_minutes, end_minutes, classroom FROM classes_group
       WHERE teacher_id = ${teacherId} ORDER BY start_minutes, name`;
    const students = await this.sql`
      SELECT e.class_group_id, s.id, s.full_name, COALESCE(e.attendance_days, g.days) AS days
        FROM classes_enrolment e
        JOIN classes_group g ON g.id = e.class_group_id
        JOIN students_student s ON s.id = e.student_id
       WHERE g.teacher_id = ${teacherId}
         AND e.enrolled_on <= ${day} AND (e.ends_on IS NULL OR e.ends_on > ${day})
       ORDER BY s.search_name`;
    const codes = (days: number[]) => days.map((d) => WEEKDAY_CODES[d - 1] ?? String(d));
    const enrolled = Row.all(students);
    return Row.all(groups).map((g) => ({
      groupId: g.string('id'),
      name: g.string('name'),
      days: codes(g.intList('days')),
      start: hhmm(g.int('start_minutes')),
      end: hhmm(g.int('end_minutes')),
      classroom: g.string('classroom'),
      students: enrolled
        .filter((s) => s.string('class_group_id') === g.string('id'))
        .map((s) => ({
          id: s.string('id'),
          name: s.string('full_name'),
          days: codes(s.intList('days')),
        })),
    }));
  }
}

/**
 * Clases apuntadas en las horas sin lista ni confirmación (sesiones de grupo frente a `attendance_roll_call`), de
 * profesores que pueden pasar lista: con su cuenta activa vinculada, y desde el día en que se vinculó.
 */
export class SqlMissedRollCallQuery implements MissedRollCallQuery {
  constructor(private readonly sql: Sql) {}

  async since(): Promise<LocalDate> {
    const rows = await this.sql`SELECT since::text AS since FROM attendance_settings WHERE id = 1`;
    return rows[0]
      ? LocalDate.fromString(new Row(rows[0]).string('since'))
      : LocalDate.fromInstant(new Date());
  }

  async missed(from: LocalDate, until: LocalDate): Promise<MissedRollCall[]> {
    // Clases sin lista y actividades sin confirmar (un turno sin «Turno hecho»; los viernes, sin ninguna marca del
    // encargado), de profesores con la cuenta activa vinculada y desde el día en que se vinculó.
    const rows = await this.sql`
      SELECT s.id, s.group_id, d.id AS duty_id, s.session_date::text AS date,
             COALESCE(g.name, d.label, s.label) AS label, t.full_name, st.teacher_id IS NOT NULL AS locked
        FROM payroll_session s
        JOIN teachers_teacher t ON t.id = s.teacher_id
        JOIN identity_user u ON u.teacher_id = s.teacher_id AND u.status = 'active'
        LEFT JOIN classes_group g ON g.id = s.group_id
        LEFT JOIN payroll_duty d ON s.group_id IS NULL AND s.source = 'duty:' || d.id
        LEFT JOIN payroll_settlement st
               ON st.teacher_id = s.teacher_id AND st.month = to_char(s.session_date, 'YYYY-MM')
       WHERE (s.group_id IS NOT NULL OR d.id IS NOT NULL)
         AND s.session_date BETWEEN ${from.toString()} AND ${until.toString()}
         AND s.session_date >= (u.teacher_linked_at AT TIME ZONE 'Europe/Madrid')::date
         AND NOT EXISTS (SELECT 1 FROM attendance_roll_call r
                          WHERE r.group_id = s.group_id AND r.roll_date = s.session_date)
         AND NOT EXISTS (SELECT 1 FROM attendance_activity_check c
                          WHERE c.duty_id = d.id AND c.check_date = s.session_date)
         AND NOT (COALESCE(d.kind, '') = 'fridays' AND EXISTS (
               SELECT 1 FROM points_movement m JOIN identity_user mu ON mu.id = m.created_by
                WHERE m.kind = 'friday' AND m.reference = s.session_date::text
                  AND mu.teacher_id = s.teacher_id))
       ORDER BY s.session_date, s.start_minutes NULLS LAST, label`;
    return Row.all(rows).map((r) => ({
      sessionId: r.string('id'),
      groupId: r.nullableString('group_id'),
      dutyId: r.nullableString('duty_id'),
      date: r.string('date'),
      label: r.string('label'),
      teacherName: r.string('full_name'),
      locked: r.bool('locked'),
    }));
  }
}

/** Listas pasadas de los grupos de un alumno los días que le tocaba ir (con su horario especial) y sus faltas. */
export class SqlStudentAttendanceQuery implements StudentAttendanceQuery {
  constructor(private readonly sql: Sql) {}

  async summary(
    studentId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<StudentAttendanceSummary> {
    const [count] = await this.sql`
      SELECT COUNT(*)::int AS classes
        FROM attendance_roll_call r
        JOIN classes_enrolment e ON e.class_group_id = r.group_id AND e.student_id = ${studentId}
       WHERE r.kind = 'taken' AND r.roll_date BETWEEN ${from.toString()} AND ${to.toString()}
         AND e.enrolled_on <= r.roll_date AND (e.ends_on IS NULL OR e.ends_on > r.roll_date)
         AND (e.attendance_days IS NULL
              OR e.attendance_days::jsonb @> jsonb_build_array(EXTRACT(ISODOW FROM r.roll_date)::int))`;
    const absences = await this.sql`
      SELECT a.roll_date::text AS date, g.name
        FROM attendance_absence a JOIN classes_group g ON g.id = a.group_id
       WHERE a.student_id = ${studentId} AND a.roll_date BETWEEN ${from.toString()} AND ${to.toString()}
       ORDER BY a.roll_date DESC`;
    const specials = await this.sql`
      SELECT a.roll_date::text AS date, g.name
        FROM attendance_guest a JOIN classes_group g ON g.id = a.group_id
       WHERE a.student_id = ${studentId} AND a.roll_date BETWEEN ${from.toString()} AND ${to.toString()}
       ORDER BY a.roll_date DESC`;
    return {
      classes: count ? new Row(count).int('classes') : 0,
      absences: Row.all(absences).map((r) => ({ date: r.string('date'), label: r.string('name') })),
      specials: Row.all(specials).map((r) => ({ date: r.string('date'), label: r.string('name') })),
    };
  }
}

/** Confirmaciones de las actividades del club (tabla `attendance_activity_check`). */
export class SqlActivityCheckRepository implements ActivityCheckRepository {
  constructor(private readonly sql: Sql) {}

  async find(duty: string, date: LocalDate): Promise<ActivityCheck | null> {
    const rows = await this.sql`SELECT * FROM attendance_activity_check
      WHERE duty_id::text = ${duty} AND check_date = ${date.toString()}`;
    if (!rows[0]) return null;
    const r = new Row(rows[0]);
    return ActivityCheck.restore({
      duty,
      date,
      kind: r.string('kind') as ActivityCheckKind,
      teacher: r.nullableString('taken_by_teacher'),
      user: r.nullableString('taken_by_user'),
      at: r.date('taken_at'),
    });
  }

  async save(check: ActivityCheck): Promise<void> {
    const record = {
      duty_id: check.duty,
      check_date: check.date.toString(),
      kind: check.kind,
      taken_by_teacher: check.by.teacher,
      taken_by_user: check.by.user,
      taken_at: check.at,
    };
    await this.sql`INSERT INTO attendance_activity_check ${this.sql(record)}
      ON CONFLICT (duty_id, check_date) DO NOTHING`;
  }
}

/** La asistencia de los viernes de los puntos (tabla `points_movement`), para la actividad de los viernes. */
export class SqlFridayRoster {
  constructor(private readonly sql: Sql) {}

  async markedByTeacher(teacherId: string, date: LocalDate): Promise<number> {
    const [row] = await this.sql`
      SELECT COUNT(*)::int AS n FROM points_movement m JOIN identity_user u ON u.id = m.created_by
       WHERE m.kind = 'friday' AND m.reference = ${date.toString()} AND u.teacher_id::text = ${teacherId}`;
    return row ? new Row(row).int('n') : 0;
  }

  async proposed(date: LocalDate): Promise<RosterStudent[]> {
    const month = YearMonth.of(date);
    const rows = await this.sql`
      SELECT DISTINCT s.id, s.full_name, s.search_name
        FROM points_movement m JOIN students_student s ON s.id = m.student_id
       WHERE m.kind = 'friday'
         AND m.movement_date BETWEEN ${month.previous().firstDay().toString()} AND ${month.lastDay().toString()}
       ORDER BY s.search_name`;
    return Row.all(rows).map((r) => ({ id: r.string('id'), name: r.string('full_name') }));
  }

  async presentOn(date: LocalDate): Promise<string[]> {
    const rows = await this.sql`SELECT student_id FROM points_movement
      WHERE kind = 'friday' AND reference = ${date.toString()}`;
    return Row.all(rows).map((r) => r.string('student_id'));
  }

  async everyone(date: LocalDate): Promise<RosterStudent[]> {
    const day = date.toString();
    const rows = await this.sql`SELECT id, full_name FROM students_student
      WHERE joined_on <= ${day} AND (withdrawn_on IS NULL OR withdrawn_on > ${day}) ORDER BY search_name`;
    return Row.all(rows).map((r) => ({ id: r.string('id'), name: r.string('full_name') }));
  }
}

/** Horario, festivos, listas, inscripciones y faltas de un grupo en un periodo. */
export class SqlGroupAttendanceQuery implements GroupAttendanceQuery {
  constructor(private readonly sql: Sql) {}

  async between(
    groupId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<GroupAttendanceData | null> {
    const [group] = await this.sql`SELECT name, days FROM classes_group WHERE id = ${groupId}`;
    if (!group) return null;
    const [first, last] = [from.toString(), to.toString()];
    const holidays = await this.sql`SELECT holiday_date::text AS day FROM payroll_holiday
      WHERE holiday_date BETWEEN ${first} AND ${last}`;
    const rollCalls = await this.sql`SELECT roll_date::text AS date, kind FROM attendance_roll_call
      WHERE group_id = ${groupId} AND roll_date BETWEEN ${first} AND ${last}`;
    const enrolments = await this.sql`
      SELECT s.id, s.full_name, e.enrolled_on::text AS enrolled_on, e.ends_on::text AS ends_on, e.attendance_days
        FROM classes_enrolment e JOIN students_student s ON s.id = e.student_id
       WHERE e.class_group_id = ${groupId}
         AND e.enrolled_on <= ${last} AND (e.ends_on IS NULL OR e.ends_on > ${first})
       ORDER BY s.search_name, e.enrolled_on`;
    const absences = await this
      .sql`SELECT roll_date::text AS date, student_id FROM attendance_absence
      WHERE group_id = ${groupId} AND roll_date BETWEEN ${first} AND ${last}`;
    const guests = await this.sql`
      SELECT a.roll_date::text AS date, a.student_id, s.full_name
        FROM attendance_guest a JOIN students_student s ON s.id = a.student_id
       WHERE a.group_id = ${groupId} AND a.roll_date BETWEEN ${first} AND ${last}`;
    const g = new Row(group);
    return {
      guests: Row.all(guests).map((r) => ({
        date: r.string('date'),
        studentId: r.string('student_id'),
        name: r.string('full_name'),
      })),
      name: g.string('name'),
      weekdays: g.intList('days'),
      holidays: new Set(Row.all(holidays).map((r) => r.string('day'))),
      rollCalls: Row.all(rollCalls).map((r) => ({
        date: r.string('date'),
        kind: r.string('kind') === 'confirmed' ? 'confirmed' : 'taken',
      })),
      enrolments: Row.all(enrolments).map((r) => ({
        studentId: r.string('id'),
        name: r.string('full_name'),
        from: r.string('enrolled_on'),
        until: r.nullableString('ends_on'),
        days: r.json('attendance_days') === null ? null : r.intList('attendance_days'),
      })),
      absences: Row.all(absences).map((r) => ({
        date: r.string('date'),
        studentId: r.string('student_id'),
      })),
    };
  }
}
