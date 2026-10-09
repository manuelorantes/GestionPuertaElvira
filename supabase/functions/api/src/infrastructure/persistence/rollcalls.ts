import { LocalDate } from '../../domain/common/mod.ts';
import { ClassComment, RollCall, type RollCallKind } from '../../domain/attendance/mod.ts';
import type {
  ClassCommentQuery,
  ClassCommentRepository,
  ClassCommentView,
  RollCallRepository,
} from '../../application/attendance/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Listas de clase (tablas `attendance_roll_call` y `attendance_absence`). */
export class SqlRollCallRepository implements RollCallRepository {
  constructor(private readonly sql: Sql) {}

  async find(group: string, date: LocalDate): Promise<RollCall | null> {
    const rows = await this.sql`
      SELECT r.*, COALESCE(
               (SELECT json_agg(a.student_id) FROM attendance_absence a
                 WHERE a.group_id = r.group_id AND a.roll_date = r.roll_date), '[]'::json) AS absent,
             COALESCE(
               (SELECT json_agg(g.student_id) FROM attendance_guest g
                 WHERE g.group_id = r.group_id AND g.roll_date = r.roll_date), '[]'::json) AS guests
        FROM attendance_roll_call r WHERE r.group_id = ${group} AND r.roll_date = ${date.toString()}`;
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    return RollCall.restore({
      group,
      date,
      kind: row.string('kind') as RollCallKind,
      absent: row.json('absent') as string[],
      guests: row.json('guests') as string[],
      teacher: row.nullableString('taken_by_teacher'),
      user: row.nullableString('taken_by_user'),
      at: row.date('taken_at'),
    });
  }

  async save(roll: RollCall): Promise<void> {
    const by = roll.takenBy();
    const record = {
      group_id: roll.group,
      roll_date: roll.date.toString(),
      kind: roll.kind(),
      taken_by_teacher: by.teacher,
      taken_by_user: by.user,
      taken_at: roll.takenAt(),
    };
    await this.sql`
      INSERT INTO attendance_roll_call ${this.sql(record)}
      ON CONFLICT (group_id, roll_date) DO UPDATE SET ${
      this.sql(record, 'kind', 'taken_by_teacher', 'taken_by_user', 'taken_at')
    }`;
    const absent = roll.absent();
    await this.sql`
      DELETE FROM attendance_absence WHERE group_id = ${roll.group} AND roll_date = ${record.roll_date}
         AND NOT (student_id::text = ANY(${absent}))`;
    for (const student of absent) {
      await this.sql`
        INSERT INTO attendance_absence (group_id, roll_date, student_id)
        VALUES (${roll.group}, ${record.roll_date}, ${student}) ON CONFLICT DO NOTHING`;
    }
    const guests = roll.guests();
    await this.sql`
      DELETE FROM attendance_guest WHERE group_id = ${roll.group} AND roll_date = ${record.roll_date}
         AND NOT (student_id::text = ANY(${guests}))`;
    for (const student of guests) {
      await this.sql`
        INSERT INTO attendance_guest (group_id, roll_date, student_id)
        VALUES (${roll.group}, ${record.roll_date}, ${student}) ON CONFLICT DO NOTHING`;
    }
  }
}

/** Comentarios de las clases (tabla `attendance_comment`). */
export class SqlClassCommentRepository implements ClassCommentRepository {
  constructor(private readonly sql: Sql) {}

  async find(id: string): Promise<ClassComment | null> {
    const rows = await this.sql`
      SELECT *, class_date::text AS day FROM attendance_comment WHERE id::text = ${id}`;
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    return ClassComment.restore({
      id: row.string('id'),
      group: row.string('group_id'),
      date: LocalDate.fromString(row.string('day')),
      student: row.nullableString('student_id'),
      text: row.string('body'),
      author: {
        teacher: row.nullableString('written_by_teacher'),
        user: row.nullableString('written_by_user'),
      },
      writtenAt: row.date('written_at'),
      updatedAt: row.date('updated_at'),
    });
  }

  async save(comment: ClassComment): Promise<void> {
    const record = {
      id: comment.id,
      group_id: comment.group,
      class_date: comment.date.toString(),
      student_id: comment.student,
      body: comment.text(),
      written_by_teacher: comment.author.teacher,
      written_by_user: comment.author.user,
      written_at: comment.writtenAt,
      updated_at: comment.updatedAt(),
    };
    await this.sql`
      INSERT INTO attendance_comment ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET ${this.sql(record, 'body', 'updated_at')}`;
  }

  async remove(id: string): Promise<void> {
    await this.sql`DELETE FROM attendance_comment WHERE id::text = ${id}`;
  }
}

/** Comentarios para leer, con el grupo, el alumno y el nombre de quien los escribió. */
export class SqlClassCommentQuery implements ClassCommentQuery {
  constructor(private readonly sql: Sql) {}

  async ofClass(groupId: string, date: LocalDate): Promise<ClassCommentView[]> {
    return this.views(
      await this.sql`${this.select()}
        WHERE c.group_id::text = ${groupId} AND c.class_date = ${date.toString()}
        ORDER BY c.written_at, c.id`,
    );
  }

  async ofGroup(groupId: string, from: LocalDate, to: LocalDate): Promise<ClassCommentView[]> {
    return this.views(
      await this.sql`${this.select()}
        WHERE c.group_id::text = ${groupId} AND c.class_date BETWEEN ${from.toString()} AND ${to.toString()}
        ORDER BY c.class_date, c.written_at, c.id`,
    );
  }

  async ofStudent(studentId: string): Promise<ClassCommentView[]> {
    return this.views(
      await this.sql`${this.select()}
        WHERE c.student_id::text = ${studentId}
        ORDER BY c.class_date DESC, c.written_at DESC, c.id DESC`,
    );
  }

  private select() {
    return this.sql`
      SELECT c.id, c.group_id, g.name AS group_name, c.class_date::text AS day, c.student_id,
             s.full_name AS student_name, c.body, c.written_by_teacher, c.written_at,
             COALESCE(t.full_name, u.full_name, 'Desconocido') AS author
        FROM attendance_comment c
        JOIN classes_group g ON g.id = c.group_id
        LEFT JOIN students_student s ON s.id = c.student_id
        LEFT JOIN teachers_teacher t ON t.id = c.written_by_teacher
        LEFT JOIN identity_user u ON u.id = c.written_by_user`;
  }

  private views(rows: Iterable<object | undefined>): ClassCommentView[] {
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      groupId: r.string('group_id'),
      groupName: r.string('group_name'),
      date: r.string('day'),
      studentId: r.nullableString('student_id'),
      studentName: r.nullableString('student_name'),
      text: r.string('body'),
      author: r.string('author'),
      authorTeacherId: r.nullableString('written_by_teacher'),
      writtenAt: r.date('written_at').toISOString(),
    }));
  }
}
