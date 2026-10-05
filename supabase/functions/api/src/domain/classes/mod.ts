import { type HasErrorDetails, InvalidValue, type LocalDate, Uuid } from '../common/mod.ts';

export class ClassGroupId extends Uuid {}
export class EnrolmentId extends Uuid {}
/** Identificador del alumno inscrito (el alumno vive en el contexto de Alumnado). */
export class StudentReference extends Uuid {}
/** Identificador del profesor de un grupo (el profesor vive en el contexto de Profesorado). */
export class TeacherReference extends Uuid {}

export class Capacity {
  private constructor(readonly value: number) {}

  static of(value: number): Capacity {
    if (!Number.isInteger(value) || value < 1 || value > 30) {
      throw new InvalidValue('capacity', 'Las plazas deben estar entre 1 y 30.');
    }
    return new Capacity(value);
  }
}

/** Las tres aulas del club, con nombre de pieza. El orden es el de las columnas del horario. */
export type ClassroomCode = 'alfil' | 'caballo' | 'peon';
export const CLASSROOMS: readonly ClassroomCode[] = ['alfil', 'caballo', 'peon'];
const CLASSROOM_NAMES: Record<ClassroomCode, string> = {
  alfil: 'Alfil',
  caballo: 'Caballo',
  peon: 'Peón',
};

export class Classroom {
  private constructor(readonly code: ClassroomCode) {}

  static fromString(code: string): Classroom {
    if (!(CLASSROOMS as readonly string[]).includes(code)) {
      throw new InvalidValue('classroom', 'El club tiene las aulas Alfil, Caballo y Peón.');
    }
    return new Classroom(code as ClassroomCode);
  }

  /** «Alfil», «Caballo» o «Peón». */
  name(): string {
    return CLASSROOM_NAMES[this.code];
  }

  /** «Aula Alfil». */
  label(): string {
    return `Aula ${this.name()}`;
  }

  /** Posición en el horario (0, 1, 2). */
  position(): number {
    return CLASSROOMS.indexOf(this.code);
  }

  equals(other: Classroom): boolean {
    return this.code === other.code;
  }
}

export class GroupName {
  private constructor(readonly value: string) {}

  static fromString(name: string): GroupName {
    const normalised = name.replace(/\s+/gu, ' ').trim();
    const length = [...normalised].length;
    if (length < 2 || length > 60) {
      throw new InvalidValue('name', 'El nombre del grupo debe tener entre 2 y 60 caracteres.');
    }
    return new GroupName(normalised);
  }
}

/** Niveles de los grupos: iniciación, intermedio, avanzado (y competición) y clases particulares. */
export type Level = 'beginner' | 'intermediate' | 'advanced' | 'private_lesson';
const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced', 'private_lesson'];

export function levelFromName(name: string): Level {
  if (!(LEVELS as readonly string[]).includes(name)) {
    throw new InvalidValue('level', 'Nivel desconocido.');
  }
  return name as Level;
}

/** Hora en punto o y media dentro del horario del club (16:00–21:00). */
export class HalfHour {
  private static readonly OPENING = 16 * 60;
  private static readonly CLOSING = 21 * 60;

  private constructor(readonly minutes: number) {}

  static fromString(time: string): HalfHour {
    const match = /^(\d{2}):(00|30)$/.exec(time);
    if (!match) {
      throw new InvalidValue('time', 'La hora debe ser en punto o y media (p. ej. 17:30).');
    }
    return HalfHour.fromMinutes(Number(match[1]) * 60 + Number(match[2]));
  }

  static fromMinutes(minutes: number): HalfHour {
    if (minutes < HalfHour.OPENING || minutes > HalfHour.CLOSING || minutes % 30 !== 0) {
      throw new InvalidValue(
        'time',
        'Las clases son entre las 16:00 y las 21:00, en medias horas.',
      );
    }
    return new HalfHour(minutes);
  }

  toString(): string {
    return `${String(Math.floor(this.minutes / 60)).padStart(2, '0')}:${
      String(this.minutes % 60).padStart(2, '0')
    }`;
  }

  isBefore(other: HalfHour): boolean {
    return this.minutes < other.minutes;
  }
}

/** Día lectivo, 1 (lunes) a 5 (viernes). */
export type Weekday = 1 | 2 | 3 | 4 | 5;
const WEEKDAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'] as const;

export function weekdayFromName(name: string): Weekday {
  const index = (WEEKDAY_CODES as readonly string[]).indexOf(name);
  if (index < 0) throw new InvalidValue('days', 'Día no válido: usa mon, tue, wed, thu o fri.');
  return (index + 1) as Weekday;
}

export function weekdayFromNumber(value: number): Weekday {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new InvalidValue('days', 'Día no válido.');
  }
  return value as Weekday;
}

export function weekdayCode(day: Weekday): string {
  return WEEKDAY_CODES[day - 1] ?? 'mon';
}

export function weekdayShortLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day - 1] ?? 'Lun';
}

/** Franja semanal de un grupo: unos días de lunes a viernes, de una hora a otra. */
export class WeeklySlot {
  private constructor(
    readonly days: readonly Weekday[],
    readonly start: HalfHour,
    readonly end: HalfHour,
  ) {}

  static of(days: readonly Weekday[], start: HalfHour, end: HalfHour): WeeklySlot {
    const unique = [...new Set(days)].sort((a, b) => a - b);
    if (unique.length === 0) throw new InvalidValue('days', 'Elige al menos un día.');
    if (!start.isBefore(end)) {
      throw new InvalidValue('end', 'La hora de fin debe ser posterior a la de inicio.');
    }
    return new WeeklySlot(unique, start, end);
  }

  overlaps(other: WeeklySlot): boolean {
    const sharesDay = this.days.some((day) => other.days.includes(day));
    return sharesDay && this.start.isBefore(other.end) && other.start.isBefore(this.end);
  }

  weeklyHours(): number {
    return ((this.end.minutes - this.start.minutes) / 60) * this.days.length;
  }

  label(): string {
    const labels = this.days.map(weekdayShortLabel);
    const last = labels.pop() ?? '';
    const days = labels.length === 0 ? last : `${labels.join(', ')} y ${last}`;
    return `${days} · ${this.start.toString()}–${this.end.toString()}`;
  }
}

/** Modalidad de un grupo según sus horas semanales; determina la cuota (especificación de Cobros). */
export type WeeklyPlan =
  | 'one_hour'
  | 'hour_and_half'
  | 'two_hours'
  | 'three_hours'
  | 'private_lesson';

export function weeklyPlanFor(level: Level, slot: WeeklySlot): WeeklyPlan {
  if (level === 'private_lesson') return 'private_lesson';
  const hours = slot.weeklyHours();
  if (hours >= 3) return 'three_hours';
  if (hours >= 2) return 'two_hours';
  if (hours >= 1.5) return 'hour_and_half';
  return 'one_hour';
}

/** Datos editables de un grupo; cada parte ya viene validada por su value object. */
export class GroupDetails {
  constructor(
    readonly name: GroupName,
    readonly level: Level,
    readonly teacher: TeacherReference,
    readonly slot: WeeklySlot,
    readonly classroom: Classroom,
    readonly capacity: Capacity,
  ) {}

  weeklyPlan(): WeeklyPlan {
    return weeklyPlanFor(this.level, this.slot);
  }

  clashesWith(other: GroupDetails): boolean {
    return this.classroom.equals(other.classroom) && this.slot.overlaps(other.slot);
  }
}

/** Grupo de clase: nivel, profesor, franja semanal, aula y plazas. */
export class ClassGroup {
  private constructor(
    readonly id: ClassGroupId,
    private current: GroupDetails,
  ) {}

  static create(id: ClassGroupId, details: GroupDetails): ClassGroup {
    return new ClassGroup(id, details);
  }

  static restore(id: ClassGroupId, details: GroupDetails): ClassGroup {
    return new ClassGroup(id, details);
  }

  update(details: GroupDetails): void {
    this.current = details;
  }

  details(): GroupDetails {
    return this.current;
  }
}

/** Evita dos grupos en la misma aula a la misma hora. */
export class ClassroomSchedule {
  /** Grupos (distintos del propuesto) que coinciden en aula, día y hora. */
  conflictsFor(
    proposedId: ClassGroupId,
    proposed: GroupDetails,
    existing: readonly ClassGroup[],
  ): ClassGroup[] {
    return existing.filter((group) =>
      !group.id.equals(proposedId) && proposed.clashesWith(group.details())
    );
  }
}

/** Inscripción de un alumno en un grupo, desde una fecha y, opcionalmente, hasta otra (no incluida). */
export class Enrolment {
  private constructor(
    readonly id: EnrolmentId,
    readonly student: StudentReference,
    readonly group: ClassGroupId,
    readonly enrolledOn: LocalDate,
    private ends: LocalDate | null,
  ) {}

  static start(
    id: EnrolmentId,
    student: StudentReference,
    group: ClassGroupId,
    on: LocalDate,
  ): Enrolment {
    return new Enrolment(id, student, group, on, null);
  }

  static restore(
    id: EnrolmentId,
    student: StudentReference,
    group: ClassGroupId,
    enrolledOn: LocalDate,
    endsOn: LocalDate | null,
  ): Enrolment {
    return new Enrolment(id, student, group, enrolledOn, endsOn);
  }

  endOn(day: LocalDate): void {
    if (day.isBefore(this.enrolledOn)) {
      throw new InvalidValue('date', 'La inscripción no puede terminar antes de empezar.');
    }
    this.ends = day;
  }

  isActiveOn(day: LocalDate): boolean {
    const hasStarted = day.isAfterOrEqual(this.enrolledOn);
    const hasEnded = this.ends !== null && day.isAfterOrEqual(this.ends);
    return hasStarted && !hasEnded;
  }

  endsOn(): LocalDate | null {
    return this.ends;
  }
}

export class AlreadyEnrolled extends Error {
  constructor() {
    super('El alumno ya está inscrito en ese grupo.');
    this.name = 'AlreadyEnrolled';
  }
}

export class GroupFull extends Error implements HasErrorDetails {
  constructor(
    private readonly occupied: number,
    private readonly capacity: number,
  ) {
    super(`El grupo está completo (${occupied}/${capacity}).`);
    this.name = 'GroupFull';
  }

  details(): Record<string, number> {
    return { occupied: this.occupied, capacity: this.capacity };
  }
}

export class StudentScheduleOverlap extends Error implements HasErrorDetails {
  constructor(private readonly conflicting: ClassGroup) {
    super(
      `Coincide en horario con «${conflicting.details().name.value}» (${conflicting.details().slot.label()}), en el que ya está inscrito.`,
    );
    this.name = 'StudentScheduleOverlap';
  }

  details(): Record<string, string> {
    return {
      groupId: this.conflicting.id.value,
      groupName: this.conflicting.details().name.value,
      slotLabel: this.conflicting.details().slot.label(),
    };
  }
}

/** Reglas para inscribir a un alumno en un grupo. */
export class EnrolmentPolicy {
  /** @param studentGroups grupos en los que el alumno ya está inscrito */
  assertCanEnrol(
    target: ClassGroup,
    studentGroups: readonly ClassGroup[],
    occupied: number,
    overCapacityConfirmed: boolean,
  ): void {
    for (const group of studentGroups) {
      if (group.id.equals(target.id)) throw new AlreadyEnrolled();
      if (group.details().slot.overlaps(target.details().slot)) {
        throw new StudentScheduleOverlap(group);
      }
    }
    const capacity = target.details().capacity.value;
    if (occupied >= capacity && !overCapacityConfirmed) throw new GroupFull(occupied, capacity);
  }
}
