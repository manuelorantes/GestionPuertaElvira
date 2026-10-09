import { generateUuidV7, InvalidValue, type LocalDate, YearMonth } from '../common/mod.ts';

/** Asistencia a los viernes, foto con la equipación oficial en un torneo, ajuste a mano o canje (en un cobro). */
export type PointsKind = 'friday' | 'tournament' | 'manual' | 'redemption';

/** Lo que vale cada asistencia a los viernes. */
export const FRIDAY_POINTS = 1;

/** No se puede quitar o gastar: el saldo de ese mes quedaría en negativo (ya se gastaron). */
export class PointsAlreadySpent extends Error {
  constructor() {
    super('Esos puntos ya se han gastado este mes: el saldo no puede quedar en negativo.');
    this.name = 'PointsAlreadySpent';
  }
}

/**
 * Un movimiento de puntos de un alumno. Los puntos valen solo en el mes en que se ganan: el saldo de un mes es la suma
 * de sus movimientos de ese mes, y nunca puede ser negativo.
 */
export class PointMovement {
  private constructor(
    readonly id: string,
    readonly student: string,
    readonly date: LocalDate,
    readonly delta: number,
    readonly kind: PointsKind,
    /** Viernes («AAAA-MM-DD»), torneo o cobro del que sale; null en los ajustes a mano. */
    readonly reference: string | null,
    readonly note: string | null,
    readonly by: string | null,
  ) {}

  static restore(fields: {
    id: string;
    student: string;
    date: LocalDate;
    delta: number;
    kind: PointsKind;
    reference: string | null;
    note: string | null;
    by: string | null;
  }): PointMovement {
    return new PointMovement(
      fields.id,
      fields.student,
      fields.date,
      fields.delta,
      fields.kind,
      fields.reference,
      fields.note,
      fields.by,
    );
  }

  static friday(student: string, date: LocalDate, by: string | null): PointMovement {
    if (date.isoWeekday() !== 5) throw new InvalidValue('date', 'Esa fecha no es un viernes.');
    return new PointMovement(
      generateUuidV7(),
      student,
      date,
      FRIDAY_POINTS,
      'friday',
      date.toString(),
      null,
      by,
    );
  }

  static manual(
    student: string,
    date: LocalDate,
    delta: number,
    note: string,
    by: string | null,
  ): PointMovement {
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
      throw new InvalidValue('delta', 'Indica cuántos puntos sumar o restar (de 1 a 100).');
    }
    if (note.trim() === '') throw new InvalidValue('note', 'Indica el motivo del ajuste.');
    return new PointMovement(
      generateUuidV7(),
      student,
      date,
      delta,
      'manual',
      null,
      note.trim(),
      by,
    );
  }

  static redemption(
    student: string,
    date: LocalDate,
    points: number,
    reference: string,
    note: string,
  ): PointMovement {
    return new PointMovement(
      generateUuidV7(),
      student,
      date,
      -points,
      'redemption',
      reference,
      note,
      null,
    );
  }

  /** @internal Lo crea un torneo. */
  static tournamentPhoto(
    student: string,
    date: LocalDate,
    points: number,
    tournament: string,
    by: string | null,
  ): PointMovement {
    return new PointMovement(
      generateUuidV7(),
      student,
      date,
      points,
      'tournament',
      tournament,
      null,
      by,
    );
  }

  month(): YearMonth {
    return YearMonth.of(this.date);
  }

  /**
   * Comprueba que aplicar `change` (un movimiento nuevo, o el contrario de uno que se quita) deja el mes en positivo.
   * @throws PointsAlreadySpent
   */
  static assertCanApply(existing: readonly PointMovement[], change: PointMovement): void {
    if (change.delta >= 0) return;
    if (monthBalance(existing, change.date) + change.delta < 0) throw new PointsAlreadySpent();
  }

  /** El movimiento contrario (para comprobar si se puede quitar este). */
  reversed(): PointMovement {
    return new PointMovement(
      this.id,
      this.student,
      this.date,
      -this.delta,
      this.kind,
      this.reference,
      this.note,
      this.by,
    );
  }
}

/** Saldo del mes de `day`: lo ganado menos lo gastado ese mes (los de otros meses no cuentan). */
export function monthBalance(movements: readonly PointMovement[], day: LocalDate): number {
  const month = YearMonth.of(day);
  return movements
    .filter((m) => m.month().equals(month))
    .reduce((sum, m) => sum + m.delta, 0);
}

/** Torneo: quien manda una foto con la equipación oficial gana sus puntos, que cuentan en el mes del torneo. */
export class Tournament {
  private constructor(
    readonly id: string,
    private currentName: string,
    private currentDate: LocalDate,
    private perPhoto: number,
  ) {}

  static create(id: string, name: string, date: LocalDate, pointsPerPhoto: number): Tournament {
    const t = new Tournament(id, '', date, 1);
    t.update(name, date, pointsPerPhoto);
    return t;
  }

  static restore(id: string, name: string, date: LocalDate, pointsPerPhoto: number): Tournament {
    return new Tournament(id, name, date, pointsPerPhoto);
  }

  update(name: string, date: LocalDate, pointsPerPhoto: number): void {
    if (name.trim() === '') throw new InvalidValue('name', 'Indica el nombre del torneo.');
    if (!Number.isInteger(pointsPerPhoto) || pointsPerPhoto < 1 || pointsPerPhoto > 20) {
      throw new InvalidValue('points', 'Los puntos por foto van de 1 a 20.');
    }
    this.currentName = name.trim();
    this.currentDate = date;
    this.perPhoto = pointsPerPhoto;
  }

  /** Los puntos de la foto de un alumno. */
  photo(student: string, by: string | null): PointMovement {
    return PointMovement.tournamentPhoto(student, this.currentDate, this.perPhoto, this.id, by);
  }

  get name(): string {
    return this.currentName;
  }

  get date(): LocalDate {
    return this.currentDate;
  }

  get pointsPerPhoto(): number {
    return this.perPhoto;
  }
}
