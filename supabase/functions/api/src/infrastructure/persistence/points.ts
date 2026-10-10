import { LocalDate, type YearMonth } from '../../domain/common/mod.ts';
import { PointMovement, type PointsKind, TournamentPhoto } from '../../domain/points/mod.ts';
import type {
  FridayGrid,
  PhotoView,
  PointMovementRepository,
  PointMovementView,
  PointsQuery,
  PointsStudents,
  StudentPointsView,
  TournamentPhotoRepository,
} from '../../application/points/mod.ts';
import { Row, type Sql } from './sql.ts';

function toMovement(r: Row): PointMovement {
  return PointMovement.restore({
    id: r.string('id'),
    student: r.string('student_id'),
    date: LocalDate.fromString(r.string('movement_date')),
    delta: r.int('delta'),
    kind: r.string('kind') as PointsKind,
    reference: r.nullableString('reference'),
    note: r.nullableString('note'),
    by: r.nullableString('created_by'),
  });
}

const COLUMNS =
  'id, student_id, movement_date::text AS movement_date, delta, kind, reference, note, created_by';

/** Movimientos de puntos (tabla `points_movement`). */
export class SqlPointMovementRepository implements PointMovementRepository {
  constructor(private readonly sql: Sql) {}

  async forStudent(student: string): Promise<PointMovement[]> {
    const rows = await this.sql`SELECT ${this.sql.unsafe(COLUMNS)} FROM points_movement
      WHERE student_id = ${student} ORDER BY movement_date`;
    return Row.all(rows).map(toMovement);
  }

  async find(student: string, kind: PointsKind, reference: string): Promise<PointMovement | null> {
    const rows = await this.sql`SELECT ${this.sql.unsafe(COLUMNS)} FROM points_movement
      WHERE student_id = ${student} AND kind = ${kind} AND reference = ${reference}`;
    return rows[0] ? toMovement(new Row(rows[0])) : null;
  }

  async add(m: PointMovement): Promise<void> {
    await this.sql`INSERT INTO points_movement ${
      this.sql({
        id: m.id,
        student_id: m.student,
        movement_date: m.date.toString(),
        delta: m.delta,
        kind: m.kind,
        reference: m.reference,
        note: m.note,
        created_by: m.by,
      })
    }`;
  }

  async remove(id: string): Promise<void> {
    await this.sql`DELETE FROM points_movement WHERE id = ${id}`;
  }
}

/** Fotos de torneo (tabla `points_photo`; la imagen, en el almacén de documentos). */
export class SqlTournamentPhotoRepository implements TournamentPhotoRepository {
  constructor(private readonly sql: Sql) {}

  async find(id: string): Promise<TournamentPhoto | null> {
    const rows = await this
      .sql`SELECT id, student_id, taken_on::text AS taken_on, note, document_key, mime_type
      FROM points_photo WHERE id::text = ${id}`;
    if (!rows[0]) return null;
    const r = new Row(rows[0]);
    return TournamentPhoto.restore({
      id: r.string('id'),
      student: r.string('student_id'),
      date: LocalDate.fromString(r.string('taken_on')),
      note: r.nullableString('note'),
      documentKey: r.string('document_key'),
      mimeType: r.string('mime_type'),
    });
  }

  async save(photo: TournamentPhoto): Promise<void> {
    await this.sql`INSERT INTO points_photo ${
      this.sql({
        id: photo.id,
        student_id: photo.student,
        taken_on: photo.date.toString(),
        note: photo.note,
        document_key: photo.documentKey,
        mime_type: photo.mimeType,
      })
    }`;
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM points_photo WHERE id::text = ${id}`;
  }
}

/** Alumnos de alta ese día. */
export class SqlPointsStudents implements PointsStudents {
  constructor(private readonly sql: Sql) {}

  async isActive(student: string, on: LocalDate): Promise<boolean> {
    const day = on.toString();
    const rows = await this.sql`SELECT 1 FROM students_student WHERE id::text = ${student}
      AND student_active_between(id, ${day}, ${day})`;
    return rows.length > 0;
  }
}

const DAY_LABEL = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export class SqlPointsQuery implements PointsQuery {
  constructor(private readonly sql: Sql, private readonly today: () => LocalDate) {}

  /** Alumnos de alta hoy (o que tienen movimientos en la temporada), con su saldo del mes y lo de la temporada. */
  async students(month: YearMonth, from: LocalDate, to: LocalDate): Promise<StudentPointsView[]> {
    const day = this.today().toString();
    const rows = await this.sql`
      SELECT s.id, s.full_name, s.member_number,
             COALESCE(SUM(m.delta) FILTER (WHERE m.movement_date BETWEEN ${month.firstDay().toString()}
                                                         AND ${month.lastDay().toString()}), 0)::int AS points,
             COALESCE(SUM(m.delta) FILTER (WHERE m.delta > 0 AND m.movement_date BETWEEN ${from.toString()}
                                                         AND ${to.toString()}), 0)::int AS earned,
             COALESCE(-SUM(m.delta) FILTER (WHERE m.kind = 'redemption' AND m.movement_date BETWEEN ${from.toString()}
                                                         AND ${to.toString()}), 0)::int AS redeemed
        FROM students_student s
        LEFT JOIN points_movement m ON m.student_id = s.id
       WHERE student_active_between(s.id, ${day}, ${day})
          OR m.movement_date BETWEEN ${from.toString()} AND ${to.toString()}
       GROUP BY s.id, s.full_name, s.member_number, s.search_name
       ORDER BY s.search_name`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      name: r.string('full_name'),
      memberNumber: r.nullableInt('member_number'),
      points: r.int('points'),
      seasonEarned: r.int('earned'),
      seasonRedeemed: r.int('redeemed'),
    }));
  }

  async movements(
    from: LocalDate,
    to: LocalDate,
    filter: { kind: PointsKind | null; student: string | null },
  ): Promise<PointMovementView[]> {
    const rows = await this.sql`
      SELECT m.id, m.student_id, s.full_name, m.movement_date::text AS date, m.delta, m.kind, m.reference, m.note,
             p.note AS photo_note, u.full_name AS by_name
        FROM points_movement m
        JOIN students_student s ON s.id = m.student_id
        LEFT JOIN points_photo p ON m.kind = 'tournament' AND p.id::text = m.reference
        LEFT JOIN identity_user u ON u.id = m.created_by
       WHERE m.movement_date BETWEEN ${from.toString()} AND ${to.toString()}
         AND (${filter.kind}::text IS NULL OR m.kind = ${filter.kind})
         AND (${filter.student}::text IS NULL OR m.student_id::text = ${filter.student})
       ORDER BY m.movement_date DESC, m.created_at DESC, m.id DESC`;
    return Row.all(rows).map((r) => {
      const kind = r.string('kind') as PointsKind;
      const concept = kind === 'friday'
        ? `Viernes ${DAY_LABEL(r.string('date'))}`
        : kind === 'tournament'
        ? `Foto de torneo${r.nullableString('photo_note') ? ` · ${r.string('photo_note')}` : ''}`
        : r.nullableString('note') ?? '';
      return {
        id: r.string('id'),
        studentId: r.string('student_id'),
        studentName: r.string('full_name'),
        date: r.string('date'),
        delta: r.int('delta'),
        kind,
        concept,
        by: r.nullableString('by_name'),
      };
    });
  }

  /** Todos los alumnos de alta algún viernes del mes, con los viernes que vinieron. */
  async fridays(month: YearMonth, fridays: LocalDate[]): Promise<FridayGrid> {
    const from = month.firstDay().toString();
    const to = month.lastDay().toString();
    const holidays = await this.sql`SELECT holiday_date::text AS day, name FROM payroll_holiday
      WHERE holiday_date BETWEEN ${from} AND ${to}`;
    const named = new Map(Row.all(holidays).map((r) => [r.string('day'), r.string('name')]));
    const rows = await this.sql`
      SELECT s.id, s.full_name, s.member_number,
             COALESCE(json_agg(m.reference ORDER BY m.reference) FILTER (WHERE m.id IS NOT NULL), '[]') AS present
        FROM students_student s
        LEFT JOIN points_movement m ON m.student_id = s.id AND m.kind = 'friday'
             AND m.movement_date BETWEEN ${from} AND ${to}
       WHERE student_active_between(s.id, ${from}, ${to})
       GROUP BY s.id, s.full_name, s.member_number, s.search_name
       ORDER BY s.search_name`;
    return {
      fridays: fridays.map((d) => ({
        date: d.toString(),
        holiday: named.get(d.toString()) ?? null,
      })),
      students: Row.all(rows).map((r) => ({
        id: r.string('id'),
        name: r.string('full_name'),
        memberNumber: r.nullableInt('member_number'),
        present: r.json('present') as string[],
      })),
    };
  }

  /** Las fotos de un periodo, de la más reciente a la más antigua. */
  async photos(from: LocalDate, to: LocalDate): Promise<PhotoView[]> {
    const rows = await this.sql`
      SELECT p.id, p.student_id, s.full_name, p.taken_on::text AS taken_on, p.note,
             COALESCE((SELECT m.delta FROM points_movement m WHERE m.kind = 'tournament'
                        AND m.reference = p.id::text), 0) AS points
        FROM points_photo p JOIN students_student s ON s.id = p.student_id
       WHERE p.taken_on BETWEEN ${from.toString()} AND ${to.toString()}
       ORDER BY p.taken_on DESC, p.created_at DESC, p.id DESC`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      studentId: r.string('student_id'),
      studentName: r.string('full_name'),
      date: r.string('taken_on'),
      note: r.nullableString('note'),
      points: r.int('points'),
    }));
  }
}
