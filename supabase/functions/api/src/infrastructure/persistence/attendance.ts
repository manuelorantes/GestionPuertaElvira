import { LocalDate } from '../../domain/common/mod.ts';
import type {
  ClassRoster,
  MissedRollCall,
  MissedRollCallQuery,
  RosterStudent,
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

/** Clases apuntadas en las horas sin lista ni confirmación (sesiones de grupo frente a `attendance_roll_call`). */
export class SqlMissedRollCallQuery implements MissedRollCallQuery {
  constructor(private readonly sql: Sql) {}

  async since(): Promise<LocalDate> {
    const rows = await this.sql`SELECT since::text AS since FROM attendance_settings WHERE id = 1`;
    return rows[0]
      ? LocalDate.fromString(new Row(rows[0]).string('since'))
      : LocalDate.fromInstant(new Date());
  }

  async missed(from: LocalDate, until: LocalDate): Promise<MissedRollCall[]> {
    const rows = await this.sql`
      SELECT s.id, s.group_id, s.session_date::text AS date, COALESCE(g.name, s.label) AS label,
             t.full_name, st.teacher_id IS NOT NULL AS locked
        FROM payroll_session s
        JOIN teachers_teacher t ON t.id = s.teacher_id
        LEFT JOIN classes_group g ON g.id = s.group_id
        LEFT JOIN payroll_settlement st
               ON st.teacher_id = s.teacher_id AND st.month = to_char(s.session_date, 'YYYY-MM')
       WHERE s.group_id IS NOT NULL
         AND s.session_date BETWEEN ${from.toString()} AND ${until.toString()}
         AND NOT EXISTS (SELECT 1 FROM attendance_roll_call r
                          WHERE r.group_id = s.group_id AND r.roll_date = s.session_date)
       ORDER BY s.session_date, s.start_minutes NULLS LAST, label`;
    return Row.all(rows).map((r) => ({
      sessionId: r.string('id'),
      groupId: r.string('group_id'),
      date: r.string('date'),
      label: r.string('label'),
      teacherName: r.string('full_name'),
      locked: r.bool('locked'),
    }));
  }
}
