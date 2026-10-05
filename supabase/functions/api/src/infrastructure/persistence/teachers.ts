import { FullName, Money } from '../../domain/common/mod.ts';
import { Teacher, TeacherId } from '../../domain/teachers/mod.ts';
import type {
  TeacherQuery,
  TeacherRepository,
  TeacherSummary,
} from '../../application/teachers/mod.ts';
import { Row, type Sql } from './sql.ts';

export class SqlTeacherRepository implements TeacherRepository {
  constructor(private readonly sql: Sql) {}

  async find(id: TeacherId): Promise<Teacher | null> {
    const rows = await this.sql`SELECT * FROM teachers_teacher WHERE id = ${id.value}`;
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    return Teacher.restore(
      TeacherId.fromString(row.string('id')),
      FullName.fromString(row.string('full_name')),
      row.bool('active'),
      Money.cents(row.int('hourly_rate_cents')),
    );
  }

  async save(teacher: Teacher): Promise<void> {
    const record = {
      id: teacher.id.value,
      full_name: teacher.fullName().value,
      active: teacher.isActive(),
      hourly_rate_cents: teacher.hourlyRate().cents,
    };
    await this.sql`INSERT INTO teachers_teacher ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET ${
      this.sql(record, 'full_name', 'active', 'hourly_rate_cents')
    }`;
  }
}

export class SqlTeacherQuery implements TeacherQuery {
  constructor(private readonly sql: Sql) {}

  async all(): Promise<TeacherSummary[]> {
    const rows = await this.sql`
      SELECT t.id, t.full_name, t.active, t.hourly_rate_cents,
             (SELECT COUNT(*) FROM classes_group g WHERE g.teacher_id = t.id) AS group_count
        FROM teachers_teacher t
       ORDER BY t.full_name`;
    return Row.all(rows).map((row) => ({
      id: row.string('id'),
      fullName: row.string('full_name'),
      active: row.bool('active'),
      groupCount: row.int('group_count'),
      hourlyRate: (row.int('hourly_rate_cents') / 100).toFixed(2),
    }));
  }
}
