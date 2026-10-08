import { InvalidValue, LocalDate, minutesOfDayInMadrid } from '../common/mod.ts';

/** La lista aún no se puede pasar: la clase no ha empezado. */
export class RollCallNotOpenYet extends Error {
  constructor() {
    super('La lista se puede pasar cuando empieza la clase.');
    this.name = 'RollCallNotOpenYet';
  }
}

/** El plazo para pasar (o corregir) la lista acabó al final del día siguiente a la clase. */
export class RollCallClosed extends Error {
  constructor() {
    super('El plazo para pasar esta lista acabó al final del día siguiente a la clase.');
    this.name = 'RollCallClosed';
  }
}

export type RollCallKind = 'taken' | 'confirmed';

/**
 * Lista de una clase un día (identidad: grupo + fecha). La pasa quien da la clase ese día, desde que empieza hasta el
 * final del día siguiente, marcando ausentes a alumnos de la lista de ese día; o administración la da por buena sin
 * lista cuando el plazo acabó sin pasarla.
 */
export class RollCall {
  private constructor(
    readonly group: string,
    readonly date: LocalDate,
    private currentKind: RollCallKind,
    private absentStudents: string[],
    private by: { teacher: string | null; user: string | null },
    private at: Date,
  ) {}

  static take(
    group: string,
    date: LocalDate,
    start: number,
    teacher: string,
    roster: readonly string[],
    absent: readonly string[],
    now: Date,
  ): RollCall {
    const roll = new RollCall(group, date, 'taken', [], { teacher, user: null }, now);
    roll.correct(start, teacher, roster, absent, now);
    return roll;
  }

  static confirm(group: string, date: LocalDate, user: string, now: Date): RollCall {
    return new RollCall(group, date, 'confirmed', [], { teacher: null, user }, now);
  }

  static restore(fields: {
    group: string;
    date: LocalDate;
    kind: RollCallKind;
    absent: string[];
    teacher: string | null;
    user: string | null;
    at: Date;
  }): RollCall {
    return new RollCall(
      fields.group,
      fields.date,
      fields.kind,
      [...fields.absent],
      { teacher: fields.teacher, user: fields.user },
      fields.at,
    );
  }

  /** Pasa (o corrige) la lista dentro del plazo: los ausentes tienen que estar en la lista de ese día. */
  correct(
    start: number,
    teacher: string,
    roster: readonly string[],
    absent: readonly string[],
    now: Date,
  ): void {
    const today = LocalDate.fromInstant(now);
    if (
      today.isBefore(this.date) || (today.equals(this.date) && minutesOfDayInMadrid(now) < start)
    ) {
      throw new RollCallNotOpenYet();
    }
    if (this.date.plusDays(1).isBefore(today)) throw new RollCallClosed();
    const unknown = absent.filter((id) => !roster.includes(id));
    if (unknown.length > 0) {
      throw new InvalidValue(
        'absent',
        'Solo se pueden marcar ausentes alumnos de la lista de ese día.',
      );
    }
    this.currentKind = 'taken';
    this.absentStudents = [...new Set(absent)];
    this.by = { teacher, user: null };
    this.at = now;
  }

  kind(): RollCallKind {
    return this.currentKind;
  }

  absent(): string[] {
    return [...this.absentStudents];
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
