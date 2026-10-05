import { InvalidValue, LocalDate, Money, Season, Uuid, YearMonth } from '../common/mod.ts';

export class TimesheetEntryId extends Uuid {}
export class TeacherRef extends Uuid {}
export class GroupRef extends Uuid {}

export class SettlementAlreadyPaid extends Error {
  constructor() {
    super('La liquidación de ese profesor y mes ya está pagada: sus horas no se pueden cambiar.');
    this.name = 'SettlementAlreadyPaid';
  }
}

/** Duración de una sesión: de media hora a 12 horas, en medias horas. */
export class SessionMinutes {
  private constructor(readonly minutes: number) {}

  static fromMinutes(minutes: number): SessionMinutes {
    if (!Number.isInteger(minutes) || minutes < 30 || minutes > 720 || minutes % 30 !== 0) {
      throw new InvalidValue('hours', 'Las horas van de 0,5 a 12, en medias horas.');
    }
    return new SessionMinutes(minutes);
  }

  static fromHours(hours: number): SessionMinutes {
    const minutes = hours * 60;
    if (!Number.isInteger(minutes)) {
      throw new InvalidValue('hours', 'Las horas van de 0,5 a 12, en medias horas.');
    }
    return SessionMinutes.fromMinutes(minutes);
  }

  hours(): number {
    return this.minutes / 60;
  }

  label(): string {
    return `${String(this.hours()).replace('.', ',')} h`;
  }
}

/** Grupo del horario: profesor, días ISO (1 = lunes) y duración de cada sesión. */
export class ScheduledGroup {
  constructor(
    readonly id: GroupRef,
    readonly name: string,
    readonly teacher: TeacherRef,
    readonly weekdays: readonly number[],
    readonly minutes: number,
  ) {}
}

export class PlannedSession {
  constructor(
    readonly group: ScheduledGroup,
    readonly date: LocalDate,
    readonly minutes: SessionMinutes,
  ) {}
}

/** Propone las sesiones de un mes a partir del horario: una por cada día de clase de cada grupo. */
export class SessionPlanner {
  /** Ordenadas por fecha. */
  plan(month: YearMonth, groups: readonly ScheduledGroup[]): PlannedSession[] {
    if (Season.teachingSeason(month) === null) return [];
    const sessions: PlannedSession[] = [];
    for (let day = 1; day <= month.days(); day++) {
      const date = LocalDate.fromString(`${month.toString()}-${String(day).padStart(2, '0')}`);
      const weekday = date.isoWeekday();
      for (const group of groups) {
        if (group.weekdays.includes(weekday)) {
          sessions.push(new PlannedSession(group, date, SessionMinutes.fromMinutes(group.minutes)));
        }
      }
    }
    return sessions;
  }
}

/** Sesión impartida (de un grupo u otra actividad) que se paga en la liquidación del mes. */
export class TimesheetEntry {
  private constructor(
    readonly id: TimesheetEntryId,
    private who: TeacherRef,
    readonly date: LocalDate,
    readonly group: GroupRef | null,
    readonly label: string,
    private duration: SessionMinutes,
    readonly fromSchedule: boolean,
  ) {}

  static record(
    id: TimesheetEntryId,
    teacher: TeacherRef,
    date: LocalDate,
    group: GroupRef | null,
    label: string,
    minutes: SessionMinutes,
    fromSchedule: boolean,
  ): TimesheetEntry {
    if (label.trim() === '') throw new InvalidValue('label', 'Indica la clase o la actividad.');
    return new TimesheetEntry(id, teacher, date, group, label.trim(), minutes, fromSchedule);
  }

  reassign(teacher: TeacherRef): void {
    this.who = teacher;
  }

  changeDuration(minutes: SessionMinutes): void {
    this.duration = minutes;
  }

  month(): YearMonth {
    return YearMonth.of(this.date);
  }

  teacher(): TeacherRef {
    return this.who;
  }

  minutes(): SessionMinutes {
    return this.duration;
  }
}

export class SettlementLine {
  constructor(
    readonly label: string,
    readonly minutes: number,
    readonly amount: Money,
  ) {}
}

/** Cálculo de una liquidación: las líneas suman exactamente el importe. */
export class Settlement {
  constructor(
    readonly minutes: number,
    readonly rate: Money,
    readonly amount: Money,
    readonly lines: readonly SettlementLine[],
  ) {}
}

/** Liquidación = horas × tarifa, redondeada a céntimos, con el detalle por grupo o actividad. */
export class SettlementCalculator {
  settle(entries: readonly TimesheetEntry[], rate: Money): Settlement {
    const byLabel = new Map<string, number>();
    for (const entry of entries) {
      byLabel.set(entry.label, (byLabel.get(entry.label) ?? 0) + entry.minutes().minutes);
    }
    const minutes = [...byLabel.values()].reduce((sum, m) => sum + m, 0);
    const amount = rate.times(minutes / 60);
    const lines: SettlementLine[] = [];
    let assigned = Money.zero();
    const labels = [...byLabel.entries()];
    labels.forEach(([label, labelMinutes], index) => {
      const lineAmount = index === labels.length - 1
        ? amount.minus(assigned)
        : rate.times(labelMinutes / 60);
      assigned = assigned.plus(lineAmount);
      lines.push(new SettlementLine(label, labelMinutes, lineAmount));
    });
    return new Settlement(minutes, rate, amount, lines);
  }
}

/** Liquidación pagada de un profesor y mes: congela horas, tarifa, importe y detalle. */
export class MonthlySettlement {
  constructor(
    readonly teacher: TeacherRef,
    readonly month: YearMonth,
    readonly settlement: Settlement,
    readonly paidOn: LocalDate,
  ) {}
}
