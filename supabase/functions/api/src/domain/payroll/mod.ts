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

export class DutyRef extends Uuid {}

/** Grupo del horario: profesor, días ISO (1 = lunes), duración y hora de inicio (minutos desde las 00:00). */
export class ScheduledGroup {
  constructor(
    readonly id: GroupRef,
    readonly name: string,
    readonly teacher: TeacherRef,
    readonly weekdays: readonly number[],
    readonly minutes: number,
    readonly start: number,
  ) {}
}

/** Turno fijo semanal (p. ej. «Encargado del club» los viernes de 17:00 a 20:00) que cuenta como horas. */
export class ClubDuty {
  constructor(
    readonly id: DutyRef,
    readonly teacher: TeacherRef,
    readonly weekday: number,
    readonly start: number,
    readonly end: number,
    readonly label: string,
  ) {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new InvalidValue('weekday', 'Día de la semana no válido.');
    }
    if (end <= start || start < 0 || end > 24 * 60 || start % 30 !== 0 || end % 30 !== 0) {
      throw new InvalidValue(
        'end',
        'La franja va en medias horas y debe acabar después de empezar.',
      );
    }
    if (label.trim() === '') throw new InvalidValue('label', 'Indica la actividad.');
  }

  minutes(): number {
    return this.end - this.start;
  }
}

/** Sustitución planificada: ese día la clase del grupo la da otro profesor. */
export class Substitution {
  /** Clase o turno sustituido: el mismo origen que su sesión automática («group:<id>» o «duty:<id>»). */
  readonly source: string;

  constructor(
    readonly target: GroupRef | DutyRef,
    readonly date: LocalDate,
    readonly teacher: TeacherRef,
    readonly reason: string | null,
  ) {
    this.source = target instanceof DutyRef ? `duty:${target.value}` : `group:${target.value}`;
  }

  get group(): GroupRef | null {
    return this.target instanceof GroupRef ? this.target : null;
  }

  get duty(): DutyRef | null {
    return this.target instanceof DutyRef ? this.target : null;
  }
}

/** Sesión que se apunta sola al acabar una clase o un turno. */
export class PlannedSession {
  constructor(
    readonly teacher: TeacherRef,
    readonly group: GroupRef | null,
    readonly date: LocalDate,
    readonly label: string,
    readonly start: number,
    readonly minutes: SessionMinutes,
    /** «group:<id>» o «duty:<id>»: una sola sesión automática por origen y día. */
    readonly source: string,
  ) {}
}

/**
 * Sesiones de un día a partir del horario: cada clase (o quien la sustituya) y cada turno fijo, solo cuando ya han
 * acabado (`nowMinutes`, o null si el día ya terminó). Los festivos los descarta quien la llama.
 */
export class DailyPlanner {
  /** Ordenadas por hora de inicio. */
  plan(
    date: LocalDate,
    groups: readonly ScheduledGroup[],
    duties: readonly ClubDuty[],
    substitutions: readonly Substitution[],
    nowMinutes: number | null,
  ): PlannedSession[] {
    if (Season.teachingSeason(YearMonth.of(date)) === null) return [];
    const weekday = date.isoWeekday();
    const over = (end: number) => nowMinutes === null || end <= nowMinutes;
    const sessions: PlannedSession[] = [];
    for (const group of groups) {
      if (!group.weekdays.includes(weekday) || !over(group.start + group.minutes)) continue;
      const substitution = substitutions.find((s) =>
        s.source === `group:${group.id.value}` && s.date.equals(date)
      );
      sessions.push(
        new PlannedSession(
          substitution?.teacher ?? group.teacher,
          group.id,
          date,
          substitution ? `${group.name} (sustitución)` : group.name,
          group.start,
          SessionMinutes.fromMinutes(group.minutes),
          `group:${group.id.value}`,
        ),
      );
    }
    for (const duty of duties) {
      if (duty.weekday !== weekday || !over(duty.end)) continue;
      const substitution = substitutions.find((s) =>
        s.source === `duty:${duty.id.value}` && s.date.equals(date)
      );
      sessions.push(
        new PlannedSession(
          substitution?.teacher ?? duty.teacher,
          null,
          date,
          substitution ? `${duty.label} (sustitución)` : duty.label,
          duty.start,
          SessionMinutes.fromMinutes(duty.minutes()),
          `duty:${duty.id.value}`,
        ),
      );
    }
    return sessions.sort((a, b) => a.start - b.start);
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
    /** Hora de inicio en minutos desde las 00:00 (para no contar dos veces horas que se solapan), o null. */
    readonly start: number | null,
    /** Origen de una sesión automática («group:<id>», «duty:<id>»), o null si se apuntó a mano. */
    readonly source: string | null,
  ) {}

  static record(
    id: TimesheetEntryId,
    teacher: TeacherRef,
    date: LocalDate,
    group: GroupRef | null,
    label: string,
    minutes: SessionMinutes,
    fromSchedule: boolean,
    start: number | null = null,
    source: string | null = null,
  ): TimesheetEntry {
    if (label.trim() === '') throw new InvalidValue('label', 'Indica la clase o la actividad.');
    return new TimesheetEntry(
      id,
      teacher,
      date,
      group,
      label.trim(),
      minutes,
      fromSchedule,
      start,
      source,
    );
  }

  static planned(id: TimesheetEntryId, session: PlannedSession): TimesheetEntry {
    return TimesheetEntry.record(
      id,
      session.teacher,
      session.date,
      session.group,
      session.label,
      session.minutes,
      true,
      session.start,
      session.source,
    );
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

/**
 * Liquidación = horas × tarifa, redondeada a céntimos, con el detalle por grupo o actividad. Las horas que se
 * solapan el mismo día (encargado del club mientras da una clase, dos clases a la vez por una sustitución) cuentan
 * una sola vez: cada sesión aporta solo los minutos que no cubre otra anterior (las más largas primero).
 */
export class SettlementCalculator {
  settle(entries: readonly TimesheetEntry[], rate: Money): Settlement {
    const byLabel = new Map<string, number>();
    const spans = effectiveMinutes(entries, (e) => ({
      day: e.date.toString(),
      start: e.start,
      minutes: e.minutes().minutes,
    }));
    for (const [entry, minutes] of spans) {
      byLabel.set(entry.label, (byLabel.get(entry.label) ?? 0) + minutes);
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

/**
 * Anticipo: dinero pagado a un profesor a cuenta de la liquidación de un mes (o pagado de más, que se descuenta de un
 * mes posterior). Se descuenta de lo que hay que pagarle ese mes.
 */
export class Advance {
  constructor(
    readonly id: string,
    readonly teacher: TeacherRef,
    readonly month: YearMonth,
    readonly amount: Money,
    readonly paidOn: LocalDate,
    readonly note: string | null,
  ) {
    if (amount.cents <= 0) throw new InvalidValue('amount', 'El anticipo debe ser mayor que 0 €.');
    if (note !== null && note.length > 200) {
      throw new InvalidValue('note', 'La nota no puede pasar de 200 caracteres.');
    }
  }
}

/** Tramo de una sesión para contar solapes: día, minuto de inicio (null si no se sabe) y duración. */
interface Span {
  day: string;
  start: number | null;
  minutes: number;
}

/** Minutos que aporta cada sesión sin contar dos veces lo que se solapa el mismo día. */
function effectiveMinutes<T>(items: readonly T[], span: (item: T) => Span): [T, number][] {
  const result: [T, number][] = [];
  const timed = new Map<string, { item: T; span: Span }[]>();
  for (const item of items) {
    const s = span(item);
    if (s.start === null) {
      result.push([item, s.minutes]);
      continue;
    }
    timed.set(s.day, [...(timed.get(s.day) ?? []), { item, span: s }]);
  }
  for (const day of timed.values()) {
    const ordered = [...day].sort((a, b) =>
      b.span.minutes - a.span.minutes || (a.span.start ?? 0) - (b.span.start ?? 0)
    );
    // Tramos ya contados, fusionados (sin solapes entre sí).
    let taken: [number, number][] = [];
    for (const { item, span: s } of ordered) {
      const from = s.start ?? 0;
      const to = from + s.minutes;
      let free = to - from;
      for (const [a, b] of taken) free -= Math.max(0, Math.min(to, b) - Math.max(from, a));
      result.push([item, Math.max(0, free)]);
      taken = merge([...taken, [from, to]]);
    }
  }
  return result;
}

/**
 * Horas esperadas de cada profesor en un mes según el horario: todas sus clases y turnos de los días del mes salvo
 * festivos, sin sustituciones y sin contar dos veces lo que se solapa. Claves: id de profesor.
 */
export class ExpectedHours {
  ofMonth(
    month: YearMonth,
    groups: readonly ScheduledGroup[],
    duties: readonly ClubDuty[],
    holidays: ReadonlySet<string>,
  ): Map<string, number> {
    const planner = new DailyPlanner();
    const sessions: PlannedSession[] = [];
    for (let day = month.firstDay(); !month.lastDay().isBefore(day); day = day.plusDays(1)) {
      if (holidays.has(day.toString())) continue;
      sessions.push(...planner.plan(day, groups, duties, [], null));
    }
    const byTeacher = new Map<string, PlannedSession[]>();
    for (const s of sessions) {
      byTeacher.set(s.teacher.value, [...(byTeacher.get(s.teacher.value) ?? []), s]);
    }
    const minutes = new Map<string, number>();
    for (const [teacher, own] of byTeacher) {
      const total = effectiveMinutes(own, (s) => ({
        day: s.date.toString(),
        start: s.start,
        minutes: s.minutes.minutes,
      })).reduce((sum, [, m]) => sum + m, 0);
      minutes.set(teacher, total);
    }
    return minutes;
  }
}

function merge(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}
