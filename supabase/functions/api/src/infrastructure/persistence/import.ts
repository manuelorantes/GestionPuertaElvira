import {
  normaliseText,
  type StudentCandidate,
  type StudentMatcher,
} from '../../application/import/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Coincidencia por nombre normalizado (`search_name`) y parecido por palabras en común. */
export class SqlStudentMatcher implements StudentMatcher {
  private static readonly SUGGESTIONS = 3;

  constructor(private readonly sql: Sql) {}

  async byName(fullName: string): Promise<StudentCandidate | null> {
    const rows = await this.sql`SELECT id, full_name FROM students_student
      WHERE search_name = ${normaliseText(fullName)} ORDER BY withdrawn_on NULLS FIRST LIMIT 1`;
    return rows[0] ? candidate(new Row(rows[0])) : null;
  }

  async similar(fullName: string): Promise<StudentCandidate[]> {
    const tokens = normaliseText(fullName).split(' ').filter((t) => [...t].length >= 3);
    if (tokens.length === 0) return [];
    const scored: { score: number; name: string; candidate: StudentCandidate }[] = [];
    for (
      const row of Row.all(await this.sql`SELECT id, full_name, search_name FROM students_student`)
    ) {
      const words = row.string('search_name').split(' ');
      const score = tokens.filter((t) => words.includes(t)).length;
      if (score > 0) {
        scored.push({ score, name: row.string('full_name'), candidate: candidate(row) });
      }
    }
    return scored
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, SqlStudentMatcher.SUGGESTIONS)
      .map((s) => s.candidate);
  }

  async exists(studentId: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) return false;
    return (await this.sql`SELECT 1 FROM students_student WHERE id = ${studentId}::uuid`).length >
      0;
  }
}

function candidate(row: Row): StudentCandidate {
  return { id: row.string('id'), fullName: row.string('full_name') };
}
