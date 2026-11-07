import { InvalidValue, LocalDate, Money, Season, Uuid, YearMonth } from '../common/mod.ts';

/** Cómo se pagó una liquidación o un anticipo (las mismas formas de pago que en Contabilidad). */
export type PayMethod = 'cash' | 'transfer' | 'card';

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

/** Cómo se paga una clase con tarifa propia: por hora o por sesión. */
export type PayUnit = 'hour' | 'session';

/**
 * Tarifa propia de una clase para quien la dé (su profesor o un sustituto), en lugar de su tarifa por hora: tanto por
 * hora o tanto por sesión. Una sesión que solo cuenta en parte (se pisa con otra) cobra esa parte.
 */
export class GroupPay {
  private constructor(
    readonly unit: PayUnit,
    readonly amount: Money,
  ) {}

  static of(unit: string, amount: Money): GroupPay {
    if (unit !== 'hour' && unit !== 'session') {
      throw new InvalidValue(
        'unit',
        'La tarifa de la clase es por hora (hour) o por sesión (session).',
      );
    }
    if (amount.isNegative()) throw new InvalidValue('amount', 'La tarifa no puede ser negativa.');
    return new GroupPay(unit, amount);
  }

  /** Céntimos (sin redondear) de `counted` minutos que cuentan de una sesión de `minutes`. */
  exactCents(counted: number, minutes: number): number {
    if (this.unit === 'hour') return (this.amount.cents * counted) / 60;
    return minutes === 0 ? 0 : (this.amount.cents * counted) / minutes;
  }
}

/** Céntimos (sin redondear) de lo que cuenta de una sesión: con la tarifa de su clase, si tiene, o con la del profesor. */
function sessionCents(
  rate: Money,
  pay: GroupPay | undefined,
  counted: number,
  minutes: number,
): number {
  return pay ? pay.exactCents(counted, minutes) : (rate.cents * counted) / 60;
}

/** Grupo del horario: profesor, días ISO (1 = lunes), duración y hora de inicio (minutos desde las 00:00). */
export class ScheduledGroup {
  constructor(
    readonly id: GroupRef,
    readonly name: string,
    readonly teacher: TeacherRef,
    readonly weekdays: readonly number[],
    readonly minutes: number,
    readonly start: number,
    /** Tarifa propia de la clase para quien la dé; null, la tarifa por hora de cada profesor. */
    readonly pay: GroupPay | null = null,
  ) {}
}

/** Turno fijo semanal (p. ej. «Encargado del club» los viernes de 17:00 a 20:00) que cuenta como horas. */
/**
 * Tipo de actividad del club: un turno normal (el encargado confirma «Turno hecho») o la de los viernes, cuya asistencia
 * es la de los viernes de los puntos (el encargado marca quién viene).
 */
export type DutyKind = 'shift' | 'fridays';

export function dutyKindFromName(name: string): DutyKind {
  if (name !== 'shift' && name !== 'fridays') {
    throw new InvalidValue('kind', 'Tipo de actividad desconocido: usa shift o fridays.');
  }
  return name;
}

/** Actividad del club con un encargado fijo semanal (p. ej. «Viernes», de 17:00 a 20:00): cuenta como horas. */
export class ClubDuty {
  constructor(
    readonly id: DutyRef,
    readonly teacher: TeacherRef,
    readonly weekday: number,
    readonly start: number,
    readonly end: number,
    readonly label: string,
    readonly kind: DutyKind = 'shift',
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
/** Lo que se añade al nombre de una clase o actividad que se da sustituyendo a otro. */
export const SUBSTITUTION_SUFFIX = ' (sustitución)';

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
          substitution ? `${group.name}${SUBSTITUTION_SUFFIX}` : group.name,
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
          substitution ? `${duty.label}${SUBSTITUTION_SUFFIX}` : duty.label,
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
 * Liquidación = horas × tarifa, redondeada a céntimos, con el detalle por grupo o actividad; las clases con tarifa propia
 * (por hora o por sesión) se pagan con ella. Las horas que se solapan el mismo día (una actividad del club mientras da
 * una clase, dos clases a la vez por una sustitución) cuentan una sola vez y van a la sesión más corta: esta cuenta
 * entera y las más largas aportan solo lo que les sobra.
 */
export class SettlementCalculator {
  settle(
    entries: readonly TimesheetEntry[],
    rate: Money,
    pays: ReadonlyMap<string, GroupPay> = new Map(),
  ): Settlement {
    const byLabel = new Map<string, { minutes: number; cents: number }>();
    const spans = effectiveMinutes(entries, (e) => ({
      day: e.date.toString(),
      start: e.start,
      minutes: e.minutes().minutes,
      substitution: e.label.endsWith(SUBSTITUTION_SUFFIX),
    }));
    for (const [entry, minutes] of spans) {
      const line = byLabel.get(entry.label) ?? { minutes: 0, cents: 0 };
      const pay = entry.group ? pays.get(entry.group.value) : undefined;
      byLabel.set(entry.label, {
        minutes: line.minutes + minutes,
        cents: line.cents + sessionCents(rate, pay, minutes, entry.minutes().minutes),
      });
    }
    const totals = [...byLabel.values()];
    const minutes = totals.reduce((sum, l) => sum + l.minutes, 0);
    const amount = Money.cents(1).times(totals.reduce((sum, l) => sum + l.cents, 0));
    const lines: SettlementLine[] = [];
    let assigned = Money.zero();
    const labels = [...byLabel.entries()];
    labels.forEach(([label, line], index) => {
      const lineAmount = index === labels.length - 1
        ? amount.minus(assigned)
        : Money.cents(1).times(line.cents);
      assigned = assigned.plus(lineAmount);
      lines.push(new SettlementLine(label, line.minutes, lineAmount));
    });
    return new Settlement(minutes, rate, amount, lines);
  }
}

/** Liquidación pagada de un profesor y mes: congela horas, tarifa, importe y detalle, y cómo se pagó. */
export class MonthlySettlement {
  constructor(
    readonly teacher: TeacherRef,
    readonly month: YearMonth,
    readonly settlement: Settlement,
    readonly paidOn: LocalDate,
    readonly method: PayMethod = 'transfer',
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
    readonly method: PayMethod = 'transfer',
  ) {
    if (amount.cents <= 0) {
      throw new InvalidValue('amount', 'El anticipo debe ser mayor que 0,00 €.');
    }
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
  /** La da sustituyendo a otro: si empata con una suya, cuenta la suya. */
  substitution?: boolean;
}

/** Lo que cuenta una sesión y las sesiones del mismo día que se quedan con parte de sus minutos. */
export interface OverlapShare<T> {
  item: T;
  minutes: number;
  overlappedBy: T[];
}

/**
 * Minutos que aporta cada sesión sin contar dos veces lo que se solapa el mismo día. La más corta cuenta entera y las
 * más largas se quedan con lo que les sobra; si duran lo mismo, primero la suya (no la sustitución) y después la que
 * va antes. Devuelve las sesiones en ese orden por día.
 */
export function overlapShares<T>(items: readonly T[], span: (item: T) => Span): OverlapShare<T>[] {
  const result: OverlapShare<T>[] = [];
  const timed = new Map<string, { item: T; span: Span; index: number }[]>();
  items.forEach((item, index) => {
    const s = span(item);
    if (s.start === null) {
      result.push({ item, minutes: s.minutes, overlappedBy: [] });
      return;
    }
    timed.set(s.day, [...(timed.get(s.day) ?? []), { item, span: s, index }]);
  });
  for (const day of timed.values()) {
    const ordered = [...day].sort((a, b) =>
      a.span.minutes - b.span.minutes ||
      Number(a.span.substitution ?? false) - Number(b.span.substitution ?? false) ||
      (a.span.start ?? 0) - (b.span.start ?? 0) ||
      a.index - b.index
    );
    // Tramos ya contados, fusionados (sin solapes entre sí).
    let taken: [number, number][] = [];
    const counted: { item: T; from: number; to: number }[] = [];
    for (const { item, span: s } of ordered) {
      const from = s.start ?? 0;
      const to = from + s.minutes;
      let free = to - from;
      for (const [a, b] of taken) free -= Math.max(0, Math.min(to, b) - Math.max(from, a));
      result.push({
        item,
        minutes: Math.max(0, free),
        overlappedBy: counted.filter((c) => c.from < to && from < c.to).map((c) => c.item),
      });
      taken = merge([...taken, [from, to]]);
      counted.push({ item, from, to });
    }
  }
  return result;
}

function effectiveMinutes<T>(items: readonly T[], span: (item: T) => Span): [T, number][] {
  return overlapShares(items, span).map((s) => [s.item, s.minutes]);
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
    return new Map(
      [...this.costsOfMonth(month, groups, duties, holidays, new Map())].map((
        [teacher, cost],
      ) => [teacher, cost.minutes]),
    );
  }

  /**
   * Horas y coste esperados de cada profesor: cada sesión a la tarifa propia de su clase o, si no tiene, a la del
   * profesor (`rates`, por id; sin tarifa conocida, 0).
   */
  costsOfMonth(
    month: YearMonth,
    groups: readonly ScheduledGroup[],
    duties: readonly ClubDuty[],
    holidays: ReadonlySet<string>,
    rates: ReadonlyMap<string, Money>,
  ): Map<string, { minutes: number; cents: number }> {
    const planner = new DailyPlanner();
    const pays = new Map(
      groups.flatMap((g) => g.pay ? [[g.id.value, g.pay] as const] : []),
    );
    const sessions: PlannedSession[] = [];
    for (let day = month.firstDay(); !month.lastDay().isBefore(day); day = day.plusDays(1)) {
      if (holidays.has(day.toString())) continue;
      sessions.push(...planner.plan(day, groups, duties, [], null));
    }
    const byTeacher = new Map<string, PlannedSession[]>();
    for (const s of sessions) {
      byTeacher.set(s.teacher.value, [...(byTeacher.get(s.teacher.value) ?? []), s]);
    }
    const costs = new Map<string, { minutes: number; cents: number }>();
    for (const [teacher, own] of byTeacher) {
      const rate = rates.get(teacher) ?? Money.zero();
      let minutes = 0;
      let cents = 0;
      for (
        const [session, counted] of effectiveMinutes(own, (s) => ({
          day: s.date.toString(),
          start: s.start,
          minutes: s.minutes.minutes,
        }))
      ) {
        minutes += counted;
        const pay = session.group ? pays.get(session.group.value) : undefined;
        cents += sessionCents(rate, pay, counted, session.minutes.minutes);
      }
      costs.set(teacher, { minutes, cents: Money.cents(1).times(cents).cents });
    }
    return costs;
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
