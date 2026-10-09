import { LocalDate, type YearMonth } from '../../domain/common/mod.ts';
import { PointMovement, type PointsKind, Tournament } from '../../domain/points/mod.ts';
import type {
  FridayGrid,
  PointMovementRepository,
  PointMovementView,
  PointsQuery,
  PointsStudents,
  StudentPointsView,
  TournamentDetailView,
  TournamentRepository,
  TournamentView,
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

/** Torneos (tabla `points_tournament`). */
export class SqlTournamentRepository implements TournamentRepository {
  constructor(private readonly sql: Sql) {}

  async find(id: string): Promise<Tournament | null> {
    const rows = await this.sql`SELECT id, name, held_on::text AS held_on, points_per_photo
      FROM points_tournament WHERE id::text = ${id}`;
    if (!rows[0]) return null;
    const r = new Row(rows[0]);
    return Tournament.restore(
      r.string('id'),
      r.string('name'),
      LocalDate.fromString(r.string('held_on')),
      r.int('points_per_photo'),
    );
  }

  async save(t: Tournament): Promise<void> {
    const record = {
      id: t.id,
      name: t.name,
      held_on: t.date.toString(),
      points_per_photo: t.pointsPerPhoto,
    };
    await this.sql`INSERT INTO points_tournament ${this.sql(record)}
      ON CONFLICT (id) DO UPDATE SET ${this.sql(record, 'name', 'held_on', 'points_per_photo')}`;
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM points_tournament WHERE id::text = ${id}`;
  }

  async photos(id: string): Promise<number> {
    const [row] = await this.sql`SELECT COUNT(*)::int AS n FROM points_movement
      WHERE kind = 'tournament' AND reference = ${id}`;
    return row ? new Row(row).int('n') : 0;
  }
}

/** Alumnos de alta ese día. */
export class SqlPointsStudents implements PointsStudents {
  constructor(private readonly sql: Sql) {}

  async isActive(student: string, on: LocalDate): Promise<boolean> {
    const day = on.toString();
    const rows = await this.sql`SELECT 1 FROM students_student WHERE id::text = ${student}
      AND joined_on <= ${day} AND (withdrawn_on IS NULL OR withdrawn_on > ${day})`;
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
       WHERE (s.joined_on <= ${day} AND (s.withdrawn_on IS NULL OR s.withdrawn_on > ${day}))
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
             t.name AS tournament, u.full_name AS by_name
        FROM points_movement m
        JOIN students_student s ON s.id = m.student_id
        LEFT JOIN points_tournament t ON m.kind = 'tournament' AND t.id::text = m.reference
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
        ? `Foto en ${r.nullableString('tournament') ?? 'un torneo'}`
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
       WHERE s.joined_on <= ${to} AND (s.withdrawn_on IS NULL OR s.withdrawn_on > ${from})
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

  async tournaments(from: LocalDate, to: LocalDate): Promise<TournamentView[]> {
    const rows = await this.sql`
      SELECT t.id, t.name, t.held_on::text AS held_on, t.points_per_photo,
             (SELECT COUNT(*) FROM points_movement m WHERE m.kind = 'tournament' AND m.reference = t.id::text)::int AS photos
        FROM points_tournament t
       WHERE t.held_on BETWEEN ${from.toString()} AND ${to.toString()}
       ORDER BY t.held_on DESC, t.name`;
    return Row.all(rows).map(toTournamentView);
  }

  async tournament(id: string): Promise<TournamentDetailView | null> {
    const [found] = await this.sql`
      SELECT t.id, t.name, t.held_on::text AS held_on, t.points_per_photo,
             (SELECT COUNT(*) FROM points_movement m WHERE m.kind = 'tournament' AND m.reference = t.id::text)::int AS photos
        FROM points_tournament t WHERE t.id::text = ${id}`;
    if (!found) return null;
    const view = toTournamentView(new Row(found));
    const rows = await this.sql`
      SELECT s.id, s.full_name, s.member_number,
             EXISTS (SELECT 1 FROM points_movement m WHERE m.student_id = s.id AND m.kind = 'tournament'
                       AND m.reference = ${id}) AS sent
        FROM students_student s
       WHERE (s.joined_on <= ${view.date} AND (s.withdrawn_on IS NULL OR s.withdrawn_on > ${view.date}))
          OR EXISTS (SELECT 1 FROM points_movement m WHERE m.student_id = s.id AND m.kind = 'tournament'
                       AND m.reference = ${id})
       ORDER BY s.search_name`;
    return {
      ...view,
      students: Row.all(rows).map((r) => ({
        id: r.string('id'),
        name: r.string('full_name'),
        memberNumber: r.nullableInt('member_number'),
        sent: r.bool('sent'),
      })),
    };
  }
}

function toTournamentView(r: Row): TournamentView {
  return {
    id: r.string('id'),
    name: r.string('name'),
    date: r.string('held_on'),
    pointsPerPhoto: r.int('points_per_photo'),
    photos: r.int('photos'),
  };
}
