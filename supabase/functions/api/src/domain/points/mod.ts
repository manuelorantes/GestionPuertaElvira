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

  /** @internal Lo crea una foto de torneo. */
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

/** Lo que vale cada foto con la equipación oficial en un torneo. */
export const PHOTO_POINTS = 1;

/** Formatos de imagen que se aceptan (el navegador las convierte a JPEG antes de subirlas). */
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** Como mucho 5 MB por foto. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Foto de un alumno con la equipación oficial en un torneo: da sus puntos en el mes de la fecha de la foto. La imagen
 * se guarda aparte (en el almacén de documentos) con una clave generada por la aplicación.
 */
export class TournamentPhoto {
  private constructor(
    readonly id: string,
    readonly student: string,
    readonly date: LocalDate,
    /** El torneo u otra nota (opcional). */
    readonly note: string | null,
    readonly documentKey: string,
    readonly mimeType: string,
  ) {}

  static take(
    student: string,
    date: LocalDate,
    note: string | null,
    mimeType: string,
    size: number,
    today: LocalDate,
  ): TournamentPhoto {
    const extension = PHOTO_TYPES[mimeType];
    if (extension === undefined) {
      throw new InvalidValue('file', 'La foto tiene que ser una imagen JPEG, PNG o WebP.');
    }
    if (size === 0 || size > MAX_PHOTO_BYTES) {
      throw new InvalidValue('file', 'La foto no puede pasar de 5 MB.');
    }
    if (today.isBefore(date)) {
      throw new InvalidValue('date', 'La foto no puede ser de un día que aún no ha llegado.');
    }
    const id = generateUuidV7();
    const clean = note?.trim() ? note.trim().slice(0, 120) : null;
    return new TournamentPhoto(
      id,
      student,
      date,
      clean,
      `photos/${id}/${generateUuidV7()}.${extension}`,
      mimeType,
    );
  }

  static restore(fields: {
    id: string;
    student: string;
    date: LocalDate;
    note: string | null;
    documentKey: string;
    mimeType: string;
  }): TournamentPhoto {
    return new TournamentPhoto(
      fields.id,
      fields.student,
      fields.date,
      fields.note,
      fields.documentKey,
      fields.mimeType,
    );
  }

  /** Los puntos de la foto (un movimiento de tipo torneo que apunta a la foto). */
  movement(by: string | null): PointMovement {
    return PointMovement.tournamentPhoto(this.student, this.date, PHOTO_POINTS, this.id, by);
  }
}
