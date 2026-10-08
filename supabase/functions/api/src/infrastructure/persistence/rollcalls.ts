import type { LocalDate } from '../../domain/common/mod.ts';
import { RollCall, type RollCallKind } from '../../domain/attendance/mod.ts';
import type { RollCallRepository } from '../../application/attendance/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Listas de clase (tablas `attendance_roll_call` y `attendance_absence`). */
export class SqlRollCallRepository implements RollCallRepository {
  constructor(private readonly sql: Sql) {}

  async find(group: string, date: LocalDate): Promise<RollCall | null> {
    const rows = await this.sql`
      SELECT r.*, COALESCE(
               (SELECT json_agg(a.student_id) FROM attendance_absence a
                 WHERE a.group_id = r.group_id AND a.roll_date = r.roll_date), '[]'::json) AS absent
        FROM attendance_roll_call r WHERE r.group_id = ${group} AND r.roll_date = ${date.toString()}`;
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    return RollCall.restore({
      group,
      date,
      kind: row.string('kind') as RollCallKind,
      absent: row.json('absent') as string[],
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
  }
}
