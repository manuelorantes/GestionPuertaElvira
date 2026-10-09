import { InvalidValue, LocalDate, minutesOfDayInMadrid } from '../common/mod.ts';

/** Minutos antes de que empiece la clase en que ya se puede pasar lista (para ir marcando a quien llega). */
export const OPENS_BEFORE_MINUTES = 15;

/** La lista aún no se puede pasar: faltan más de 15 minutos para la clase. */
export class RollCallNotOpenYet extends Error {
  constructor() {
    super('La lista se puede pasar desde 15 minutos antes de que empiece la clase.');
    this.name = 'RollCallNotOpenYet';
  }
}

/**
 * El plazo para pasar (o corregir) la lista acabó al final del día siguiente a la clase: a partir de ahí solo se cambia
 * confirmando que es una lista pasada.
 */
export class RollCallClosed extends Error {
  constructor() {
    super(
      'El plazo para pasar esta lista acabó al final del día siguiente a la clase: confirma que quieres cambiar una lista pasada.',
    );
    this.name = 'RollCallClosed';
  }
}

/** Quién vino: ausentes de la lista de ese día y alumnos de fuera de la clase que vinieron (asistencia especial). */
export interface RollCallMarks {
  absent: readonly string[];
  guests?: readonly string[];
}

export type RollCallKind = 'taken' | 'confirmed';

/**
 * El plazo de una lista (o de confirmar una actividad): desde 15 minutos antes de que empiece hasta el final del día
 * siguiente.
 * @throws RollCallNotOpenYet | RollCallClosed
 */
export function assertWithinWindow(date: LocalDate, start: number, now: Date): void {
  const today = LocalDate.fromInstant(now);
  if (
    today.isBefore(date) ||
    (today.equals(date) && minutesOfDayInMadrid(now) < start - OPENS_BEFORE_MINUTES)
  ) {
    throw new RollCallNotOpenYet();
  }
  if (date.plusDays(1).isBefore(today)) throw new RollCallClosed();
}

/**
 * Lista de una clase un día (identidad: grupo + fecha). La pasa quien da la clase ese día, desde 15 minutos antes de que
 * empiece hasta el final del día siguiente, marcando ausentes a alumnos de la lista de ese día y, como asistencia
 * especial, a alumnos de fuera de la clase que vinieron (a recuperar, por ejemplo); después del plazo la puede cambiar
 * confirmando que es una lista pasada. O administración la da por buena sin lista cuando el plazo acabó sin pasarla.
 */
export class RollCall {
  private constructor(
    readonly group: string,
    readonly date: LocalDate,
    private currentKind: RollCallKind,
    private absentStudents: string[],
    private guestStudents: string[],
    private by: { teacher: string | null; user: string | null },
    private at: Date,
  ) {}

  /** `past`: después del plazo, quien la pasa ha confirmado que cambia una lista pasada. */
  static take(
    group: string,
    date: LocalDate,
    start: number,
    teacher: string,
    roster: readonly string[],
    marks: RollCallMarks,
    now: Date,
    past = false,
  ): RollCall {
    const roll = new RollCall(group, date, 'taken', [], [], { teacher, user: null }, now);
    roll.correct(start, teacher, roster, marks, now, past);
    return roll;
  }

  static confirm(group: string, date: LocalDate, user: string, now: Date): RollCall {
    return new RollCall(group, date, 'confirmed', [], [], { teacher: null, user }, now);
  }

  static restore(fields: {
    group: string;
    date: LocalDate;
    kind: RollCallKind;
    absent: string[];
    guests: string[];
    teacher: string | null;
    user: string | null;
    at: Date;
  }): RollCall {
    return new RollCall(
      fields.group,
      fields.date,
      fields.kind,
      [...fields.absent],
      [...fields.guests],
      { teacher: fields.teacher, user: fields.user },
      fields.at,
    );
  }

  /**
   * Pasa (o corrige) la lista: dentro del plazo, o después si `past` (confirmado). Los ausentes tienen que estar en la
   * lista de ese día y los de asistencia especial, no.
   */
  correct(
    start: number,
    teacher: string,
    roster: readonly string[],
    marks: RollCallMarks,
    now: Date,
    past = false,
  ): void {
    try {
      assertWithinWindow(this.date, start, now);
    } catch (error) {
      if (!(past && error instanceof RollCallClosed)) throw error;
    }
    if (marks.absent.some((id) => !roster.includes(id))) {
      throw new InvalidValue(
        'absent',
        'Solo se pueden marcar ausentes alumnos de la lista de ese día.',
      );
    }
    const guests = marks.guests ?? [];
    if (guests.some((id) => roster.includes(id))) {
      throw new InvalidValue(
        'guests',
        'Ese alumno ya está en la lista de ese día: no es una asistencia especial.',
      );
    }
    this.currentKind = 'taken';
    this.absentStudents = [...new Set(marks.absent)];
    this.guestStudents = [...new Set(guests)];
    this.by = { teacher, user: null };
    this.at = now;
  }

  kind(): RollCallKind {
    return this.currentKind;
  }

  absent(): string[] {
    return [...this.absentStudents];
  }

  /** Alumnos de fuera de la clase que vinieron ese día (asistencia especial). */
  guests(): string[] {
    return [...this.guestStudents];
  }

  /** Los alumnos de la lista que vinieron. */
  present(roster: readonly string[]): string[] {
    return roster.filter((id) => !this.absentStudents.includes(id));
  }

  takenBy(): { teacher: string | null; user: string | null } {
    return { ...this.by };
  }

  takenAt(): Date {
    return this.at;
  }
}

export type ActivityCheckKind = 'done' | 'confirmed';

/**
 * Confirmación de una actividad del club un día (identidad: actividad + fecha): su encargado pulsa «Turno hecho» en el
 * plazo de las listas, o administración la da por buena («Se dio») cuando el plazo acabó sin confirmarla.
 */
export class ActivityCheck {
  private constructor(
    readonly duty: string,
    readonly date: LocalDate,
    readonly kind: ActivityCheckKind,
    readonly by: { teacher: string | null; user: string | null },
    readonly at: Date,
  ) {}

  static done(
    duty: string,
    date: LocalDate,
    start: number,
    teacher: string,
    now: Date,
  ): ActivityCheck {
    assertWithinWindow(date, start, now);
    return new ActivityCheck(duty, date, 'done', { teacher, user: null }, now);
  }

  static confirm(duty: string, date: LocalDate, user: string, now: Date): ActivityCheck {
    return new ActivityCheck(duty, date, 'confirmed', { teacher: null, user }, now);
  }

  static restore(fields: {
    duty: string;
    date: LocalDate;
    kind: ActivityCheckKind;
    teacher: string | null;
    user: string | null;
    at: Date;
  }): ActivityCheck {
    return new ActivityCheck(
      fields.duty,
      fields.date,
      fields.kind,
      { teacher: fields.teacher, user: fields.user },
      fields.at,
    );
  }
}

/** Quién escribió un comentario: el profesor que da la clase (desde su espacio) y la cuenta con la que lo hizo. */
export interface CommentAuthor {
  /** El profesor, o null si lo escribió administración. */
  teacher: string | null;
  user: string | null;
}

const COMMENT_MAX_LENGTH = 1000;

function commentText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') throw new InvalidValue('text', 'Escribe el comentario.');
  if ([...trimmed].length > COMMENT_MAX_LENGTH) {
    throw new InvalidValue(
      'text',
      `El comentario puede tener como mucho ${COMMENT_MAX_LENGTH} caracteres.`,
    );
  }
  return trimmed;
}

/**
 * Comentario sobre una clase un día: de la clase en sí («hoy hemos dado mates de torres») o de un alumno de esa clase
 * («ha llegado a mitad de clase»). Lo escribe quien da la clase o administración.
 */
export class ClassComment {
  private constructor(
    readonly id: string,
    readonly group: string,
    readonly date: LocalDate,
    /** El alumno del que trata, o null si es de la clase. */
    readonly student: string | null,
    private body: string,
    readonly author: CommentAuthor,
    readonly writtenAt: Date,
    private updated: Date,
  ) {}

  static write(
    id: string,
    group: string,
    date: LocalDate,
    student: string | null,
    text: string,
    author: CommentAuthor,
    now: Date,
  ): ClassComment {
    return new ClassComment(id, group, date, student, commentText(text), author, now, now);
  }

  static restore(fields: {
    id: string;
    group: string;
    date: LocalDate;
    student: string | null;
    text: string;
    author: CommentAuthor;
    writtenAt: Date;
    updatedAt: Date;
  }): ClassComment {
    return new ClassComment(
      fields.id,
      fields.group,
      fields.date,
      fields.student,
      fields.text,
      fields.author,
      fields.writtenAt,
      fields.updatedAt,
    );
  }

  rewrite(text: string, now: Date): void {
    this.body = commentText(text);
    this.updated = now;
  }

  isWrittenByTeacher(teacher: string): boolean {
    return this.author.teacher === teacher;
  }

  text(): string {
    return this.body;
  }

  updatedAt(): Date {
    return this.updated;
  }
}
