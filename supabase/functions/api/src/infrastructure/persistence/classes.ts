import { LocalDate } from '../../domain/common/mod.ts';
import {
  Capacity,
  ClassGroup,
  ClassGroupId,
  Classroom,
  Enrolment,
  EnrolmentId,
  GroupDetails,
  GroupName,
  HalfHour,
  levelFromName,
  StudentReference,
  TeacherReference,
  weekdayCode,
  weekdayFromNumber,
  WeeklySlot,
} from '../../domain/classes/mod.ts';
import type {
  ClassGroupRepository,
  ClassQuery,
  EnrolledStudent,
  EnrolmentRepository,
  GroupSummary,
} from '../../application/classes/mod.ts';
import { Row, type Sql } from './sql.ts';

function toGroup(row: Row): ClassGroup {
  return ClassGroup.restore(
    ClassGroupId.fromString(row.string('id')),
    new GroupDetails(
      row.bool('custom_name') ? GroupName.fromString(row.string('name')) : null,
      levelFromName(row.string('level')),
      TeacherReference.fromString(row.string('teacher_id')),
      WeeklySlot.of(
        row.intList('days').map(weekdayFromNumber),
        HalfHour.fromMinutes(row.int('start_minutes')),
        HalfHour.fromMinutes(row.int('end_minutes')),
      ),
      Classroom.fromString(row.string('classroom')),
      Capacity.of(row.int('capacity')),
    ),
  );
}

export class SqlClassGroupRepository implements ClassGroupRepository {
  constructor(private readonly sql: Sql) {}

  async find(id: ClassGroupId): Promise<ClassGroup | null> {
    const rows = await this.sql`SELECT * FROM classes_group WHERE id = ${id.value}`;
    return rows[0] ? toGroup(new Row(rows[0])) : null;
  }

  async all(): Promise<ClassGroup[]> {
    return Row.all(await this.sql`SELECT * FROM classes_group ORDER BY id`).map(toGroup);
  }

  async save(group: ClassGroup): Promise<void> {
    const d = group.details();
    const record = {
      id: group.id.value,
      name: d.name.value,
      custom_name: d.customName,
      level: d.level,
      teacher_id: d.teacher.value,
      // Columna json: postgres.js serializa el array (una cadena quedaría codificada dos veces).
      days: [...d.slot.days],
      start_minutes: d.slot.start.minutes,
      end_minutes: d.slot.end.minutes,
      classroom: d.classroom.code,
      capacity: d.capacity.value,
    };
    await this.sql`INSERT INTO classes_group ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET ${
      this.sql(
        record,
        'name',
        'custom_name',
        'level',
        'teacher_id',
        'days',
        'start_minutes',
        'end_minutes',
        'classroom',
        'capacity',
      )
    }`;
  }
}

function toEnrolment(row: Row): Enrolment {
  const endsOn = row.nullableString('ends_on');
  return Enrolment.restore(
    EnrolmentId.fromString(row.string('id')),
    StudentReference.fromString(row.string('student_id')),
    ClassGroupId.fromString(row.string('class_group_id')),
    LocalDate.fromString(row.string('enrolled_on')),
    endsOn === null ? null : LocalDate.fromString(endsOn),
  );
}

export class SqlEnrolmentRepository implements EnrolmentRepository {
  constructor(private readonly sql: Sql) {}

  async save(enrolment: Enrolment): Promise<void> {
    const record = {
      id: enrolment.id.value,
      student_id: enrolment.student.value,
      class_group_id: enrolment.group.value,
      enrolled_on: enrolment.enrolledOn.toString(),
      ends_on: enrolment.endsOn()?.toString() ?? null,
    };
    await this.sql`INSERT INTO classes_enrolment ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET ends_on = EXCLUDED.ends_on`;
  }

  async activeForStudent(student: StudentReference, on: LocalDate): Promise<Enrolment[]> {
    const rows = await this.sql`SELECT * FROM classes_enrolment
      WHERE student_id = ${student.value} AND enrolled_on <= ${on.toString()} AND (ends_on IS NULL OR ends_on > ${on.toString()})
      ORDER BY enrolled_on, id`;
    return Row.all(rows).map(toEnrolment);
  }

  async activeForStudentInGroup(
    student: StudentReference,
    group: ClassGroupId,
    on: LocalDate,
  ): Promise<Enrolment | null> {
    const rows = await this.sql`SELECT * FROM classes_enrolment
      WHERE student_id = ${student.value} AND class_group_id = ${group.value}
        AND enrolled_on <= ${on.toString()} AND (ends_on IS NULL OR ends_on > ${on.toString()})
      LIMIT 1`;
    return rows[0] ? toEnrolment(new Row(rows[0])) : null;
  }

  async activeCount(group: ClassGroupId, on: LocalDate): Promise<number> {
    const rows = await this.sql`SELECT COUNT(*) AS total FROM classes_enrolment
      WHERE class_group_id = ${group.value} AND enrolled_on <= ${on.toString()} AND (ends_on IS NULL OR ends_on > ${on.toString()})`;
    return rows[0] ? new Row(rows[0]).int('total') : 0;
  }
}

/** Lectura del horario: grupos con su profesor y su ocupación en una fecha. */
export class SqlClassQuery implements ClassQuery {
  constructor(private readonly sql: Sql) {}

  private select(on: LocalDate) {
    return this.sql`
      SELECT g.id, g.name, g.custom_name, g.level, g.teacher_id, g.days, g.start_minutes, g.end_minutes, g.classroom, g.capacity,
             t.full_name AS teacher_name,
             (SELECT COUNT(*) FROM classes_enrolment e
               WHERE e.class_group_id = g.id AND e.enrolled_on <= ${on.toString()} AND (e.ends_on IS NULL OR e.ends_on > ${on.toString()})) AS occupied
        FROM classes_group g
        JOIN teachers_teacher t ON t.id = g.teacher_id`;
  }

  async groups(on: LocalDate): Promise<GroupSummary[]> {
    const rows = await this.sql`${this.select(on)} ORDER BY g.classroom, g.start_minutes, g.name`;
    const groups = Row.all(rows).map(toSummary);
    const key = (g: GroupSummary) =>
      [g.days[0] ?? 'mon', g.start, Classroom.fromString(g.classroom).position(), g.name] as const;
    const dayIndex = (code: string) => ['mon', 'tue', 'wed', 'thu', 'fri'].indexOf(code);
    return groups.sort((a, b) => {
      const [da, sa, ca, na] = key(a);
      const [db, sb, cb, nb] = key(b);
      return dayIndex(da) - dayIndex(db) || sa.localeCompare(sb) || ca - cb || na.localeCompare(nb);
    });
  }

  async group(id: string, on: LocalDate): Promise<GroupSummary | null> {
    const rows = await this.sql`${this.select(on)} WHERE g.id = ${id}`;
    return rows[0] ? toSummary(new Row(rows[0])) : null;
  }

  /** Alumnos con inscripción activa, por nombre. */
  async enrolledStudents(groupId: string, on: LocalDate): Promise<EnrolledStudent[]> {
    const rows = await this.sql`
      SELECT s.id, s.full_name, s.birth_date
        FROM classes_enrolment e
        JOIN students_student s ON s.id = e.student_id
       WHERE e.class_group_id = ${groupId} AND e.enrolled_on <= ${on.toString()} AND (e.ends_on IS NULL OR e.ends_on > ${on.toString()})
       ORDER BY s.search_name`;
    return Row.all(rows).map((row) => ({
      id: row.string('id'),
      fullName: row.string('full_name'),
      age: row.nullableString('birth_date') === null
        ? null
        : LocalDate.fromString(row.string('birth_date')).ageOn(on),
    }));
  }
}

function toSummary(row: Row): GroupSummary {
  const group = toGroup(row);
  const d = group.details();
  return {
    id: group.id.value,
    name: d.name.value,
    customName: d.customName,
    level: d.level,
    teacherId: d.teacher.value,
    teacherName: row.string('teacher_name'),
    days: d.slot.days.map(weekdayCode),
    start: d.slot.start.toString(),
    end: d.slot.end.toString(),
    slotLabel: d.slot.label(),
    classroom: d.classroom.code,
    capacity: d.capacity.value,
    occupied: row.int('occupied'),
    weeklyPlan: d.weeklyPlan(),
  };
}
