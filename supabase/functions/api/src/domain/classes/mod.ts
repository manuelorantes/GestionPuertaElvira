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
    if (length < 2 || length > 80) {
      throw new InvalidValue('name', 'El nombre del grupo debe tener entre 2 y 80 caracteres.');
    }
    return new GroupName(normalised);
  }

  /** El nombre es opcional: vacío (o solo espacios) significa «el nombre por defecto». */
  static optional(name: string | null | undefined): GroupName | null {
    return name === null || name === undefined || name.trim() === ''
      ? null
      : GroupName.fromString(name);
  }
}

/** Niveles de los grupos: iniciación, intermedio, avanzado (y competición) y clases particulares. */
export type Level = 'beginner' | 'intermediate' | 'advanced' | 'private_lesson';
const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced', 'private_lesson'];
const LEVEL_LABELS: Record<Level, string> = {
  beginner: 'Iniciación',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
  private_lesson: 'Particular',
};

export function levelLabel(level: Level): string {
  return LEVEL_LABELS[level];
}

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
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'] as const;

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

  /** «Lunes», «Lunes y miércoles», «Lunes, miércoles y viernes». */
  daysLabel(): string {
    const names = this.days.map((day) => WEEKDAY_NAMES[day - 1] ?? 'lunes');
    const joined = names.length === 1
      ? names[0] ?? ''
      : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    return joined.charAt(0).toUpperCase() + joined.slice(1);
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

/**
 * Datos editables de un grupo; cada parte ya viene validada por su value object.
 * El nombre es opcional: sin él, el grupo se llama por su día, hora, nivel y aula
 * («Lunes 17:00 · Iniciación · Peón»), y ese nombre sigue a esos datos cuando cambian.
 */
export class GroupDetails {
  readonly name: GroupName;
  /** true si el nombre lo puso administración; false si es el nombre por defecto. */
  readonly customName: boolean;

  constructor(
    name: GroupName | null,
    readonly level: Level,
    readonly teacher: TeacherReference,
    readonly slot: WeeklySlot,
    readonly classroom: Classroom,
    readonly capacity: Capacity,
  ) {
    this.customName = name !== null;
    this.name = name ?? GroupName.fromString(GroupDetails.defaultName(level, slot, classroom));
  }

  static defaultName(level: Level, slot: WeeklySlot, classroom: Classroom): string {
    return `${slot.daysLabel()} ${slot.start.toString()} · ${
      levelLabel(level)
    } · ${classroom.name()}`;
  }

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

/**
 * Horario propio de una inscripción dentro de su grupo: qué días viene y de qué hora a qué hora.
 * Por defecto, todo el horario del grupo. Permite a un alumno ir solo los lunes a un grupo de lunes y
 * miércoles, o media hora de un grupo y la hora entera del siguiente, ocupando plaza en ambos.
 */
export class Attendance {
  private constructor(
    /** Días del grupo a los que viene, o null si a todos. */
    readonly days: readonly Weekday[] | null,
    /** Hora de inicio propia, o null si la del grupo. */
    readonly start: HalfHour | null,
    /** Hora de fin propia, o null si la del grupo. */
    readonly end: HalfHour | null,
  ) {}

  /** Todo el horario del grupo. */
  static full(): Attendance {
    return new Attendance(null, null, null);
  }

  /** Un recorte del horario del grupo; lo que coincide con el grupo se guarda como «todo». */
  static within(
    group: GroupDetails,
    days: readonly Weekday[] | null,
    start: HalfHour | null,
    end: HalfHour | null,
  ): Attendance {
    const slot = group.slot;
    let chosenDays: readonly Weekday[] | null = null;
    if (days !== null) {
      const unique = [...new Set(days)].sort((a, b) => a - b);
      if (unique.length === 0) throw new InvalidValue('days', 'Elige al menos un día del grupo.');
      if (unique.some((day) => !slot.days.includes(day))) {
        throw new InvalidValue('days', 'Los días tienen que ser de los del grupo.');
      }
      chosenDays = unique.length === slot.days.length ? null : unique;
    }
    const from = start ?? slot.start;
    const to = end ?? slot.end;
    if (from.isBefore(slot.start) || slot.end.isBefore(to)) {
      throw new InvalidValue('time', 'El horario tiene que estar dentro del horario del grupo.');
    }
    if (!from.isBefore(to)) {
      throw new InvalidValue('end', 'La hora de fin debe ser posterior a la de inicio.');
    }
    return new Attendance(
      chosenDays,
      from.minutes === slot.start.minutes ? null : from,
      to.minutes === slot.end.minutes ? null : to,
    );
  }

  /** Tal como se guardó, sin volver a validar. */
  static restore(
    days: readonly Weekday[] | null,
    start: HalfHour | null,
    end: HalfHour | null,
  ): Attendance {
    return new Attendance(days, start, end);
  }

  isFull(): boolean {
    return this.days === null && this.start === null && this.end === null;
  }

  /** Días en los que ocupa plaza. */
  daysIn(group: GroupDetails): readonly Weekday[] {
    return this.days ?? group.slot.days;
  }

  /** Franja real del alumno en el grupo. */
  slotIn(group: GroupDetails): WeeklySlot {
    return WeeklySlot.of(
      this.daysIn(group),
      this.start ?? group.slot.start,
      this.end ?? group.slot.end,
    );
  }

  /** «Lun · 18:30–19:00», o null si va a todo el grupo. */
  labelIn(group: GroupDetails): string | null {
    return this.isFull() ? null : this.slotIn(group).label();
  }
}

/** Plazas ocupadas cada día del grupo: quien viene solo algunos días solo cuenta esos días. */
export function occupancyByDay(
  group: GroupDetails,
  enrolments: readonly Enrolment[],
): Map<Weekday, number> {
  const counts = new Map<Weekday, number>(group.slot.days.map((day) => [day, 0]));
  for (const enrolment of enrolments) {
    for (const day of enrolment.attendance().daysIn(group)) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  return counts;
}

/** Inscripción de un alumno en un grupo, desde una fecha y, opcionalmente, hasta otra (no incluida). */
export class Enrolment {
  private constructor(
    readonly id: EnrolmentId,
    readonly student: StudentReference,
    readonly group: ClassGroupId,
    readonly enrolledOn: LocalDate,
    private ends: LocalDate | null,
    private attending: Attendance,
  ) {}

  static start(
    id: EnrolmentId,
    student: StudentReference,
    group: ClassGroupId,
    on: LocalDate,
    attendance: Attendance = Attendance.full(),
  ): Enrolment {
    return new Enrolment(id, student, group, on, null, attendance);
  }

  static restore(
    id: EnrolmentId,
    student: StudentReference,
    group: ClassGroupId,
    enrolledOn: LocalDate,
    endsOn: LocalDate | null,
    attendance: Attendance = Attendance.full(),
  ): Enrolment {
    return new Enrolment(id, student, group, enrolledOn, endsOn, attendance);
  }

  attendance(): Attendance {
    return this.attending;
  }

  changeAttendance(attendance: Attendance): void {
    this.attending = attendance;
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

/** Un grupo del alumno con el horario que hace en él. */
export interface CurrentEnrolment {
  group: ClassGroup;
  attendance: Attendance;
}

/** Reglas para inscribir a un alumno en un grupo (o cambiar su horario en él). */
export class EnrolmentPolicy {
  /**
   * @param current grupos en los que el alumno ya está, con su horario real
   * @param occupied plazas ocupadas cada día del grupo destino (sin contar al propio alumno)
   * @param attendance horario con el que se inscribe
   */
  assertCanEnrol(
    target: ClassGroup,
    current: readonly CurrentEnrolment[],
    occupied: ReadonlyMap<Weekday, number>,
    attendance: Attendance,
    overCapacityConfirmed: boolean,
  ): void {
    const mine = attendance.slotIn(target.details());
    for (const { group, attendance: theirs } of current) {
      if (group.id.equals(target.id)) throw new AlreadyEnrolled();
      if (theirs.slotIn(group.details()).overlaps(mine)) throw new StudentScheduleOverlap(group);
    }
    const capacity = target.details().capacity.value;
    const busiest = Math.max(
      0,
      ...attendance.daysIn(target.details()).map((day) => occupied.get(day) ?? 0),
    );
    if (busiest >= capacity && !overCapacityConfirmed) throw new GroupFull(busiest, capacity);
  }
}

/** Un tramo del horario que hará un alumno: un día, de una hora a otra, y si se sabe, en qué aula. */
export interface ScheduleBlock {
  day: Weekday;
  start: HalfHour;
  end: HalfHour;
  classroom: Classroom | null;
}

export interface ResolvedEnrolment {
  group: ClassGroup;
  attendance: Attendance;
}

interface Slice {
  day: Weekday;
  start: HalfHour;
  end: HalfHour;
}

/** Un tramo en el que hay varios grupos posibles (distintas aulas): hay que elegir. */
export interface ScheduleChoice extends Slice {
  groups: ClassGroup[];
}

export interface ScheduleResolution {
  enrolments: ResolvedEnrolment[];
  /** Tramos sin ninguna clase a esa hora. */
  uncovered: Slice[];
  choices: ScheduleChoice[];
  /** Tramos que no se pueden representar (el mismo grupo con horas distintas según el día). */
  problems: string[];
}

function sliceLabel(slice: Slice): string {
  return `${weekdayShortLabel(slice.day)} · ${slice.start.toString()}–${slice.end.toString()}`;
}

/**
 * Traduce las horas que va a venir un alumno a inscripciones: en cada tramo, el grupo que da clase
 * a esa hora ese día; si solo cubre parte del grupo (o solo algunos de sus días), con horario
 * especial. Cuando dos grupos coinciden en el tramo (distintas aulas) hay que elegir el aula.
 */
export function resolveSchedule(
  blocks: readonly ScheduleBlock[],
  groups: readonly ClassGroup[],
): ScheduleResolution {
  const uncovered: Slice[] = [];
  const choices: ScheduleChoice[] = [];
  const problems: string[] = [];
  /** grupo → día → [inicio, fin] en minutos */
  const windows = new Map<string, Map<Weekday, [number, number]>>();

  for (const block of blocks) {
    if (!block.start.isBefore(block.end)) continue;
    const candidates = groups.filter((g) => {
      const d = g.details();
      return d.slot.days.includes(block.day) &&
        (block.classroom === null || d.classroom.equals(block.classroom)) &&
        d.slot.start.isBefore(block.end) && block.start.isBefore(d.slot.end);
    });
    const marks = new Set<number>([block.start.minutes, block.end.minutes]);
    for (const g of candidates) {
      for (const m of [g.details().slot.start.minutes, g.details().slot.end.minutes]) {
        if (m > block.start.minutes && m < block.end.minutes) marks.add(m);
      }
    }
    const sorted = [...marks].sort((a, b) => a - b);
    let pendingChoice: ScheduleChoice | null = null;
    let pendingGap: Slice | null = null;
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i]!;
      const to = sorted[i + 1]!;
      const covering = candidates.filter((g) =>
        g.details().slot.start.minutes <= from && g.details().slot.end.minutes >= to
      );
      const slice: Slice = {
        day: block.day,
        start: HalfHour.fromMinutes(from),
        end: HalfHour.fromMinutes(to),
      };
      if (covering.length === 1) {
        const group = covering[0]!;
        const byDay = windows.get(group.id.value) ?? new Map<Weekday, [number, number]>();
        const current = byDay.get(block.day);
        byDay.set(
          block.day,
          current ? [Math.min(current[0], from), Math.max(current[1], to)] : [from, to],
        );
        windows.set(group.id.value, byDay);
        pendingChoice = null;
        pendingGap = null;
      } else if (covering.length === 0) {
        if (pendingGap) pendingGap.end = slice.end;
        else uncovered.push(pendingGap = { ...slice });
        pendingChoice = null;
      } else {
        const sameSet = pendingChoice &&
          pendingChoice.groups.length === covering.length &&
          pendingChoice.groups.every((g) => covering.some((c) => c.id.equals(g.id)));
        if (sameSet && pendingChoice) pendingChoice.end = slice.end;
        else choices.push(pendingChoice = { ...slice, groups: covering });
        pendingGap = null;
      }
    }
  }

  const enrolments: ResolvedEnrolment[] = [];
  for (const [groupId, byDay] of windows) {
    const group = groups.find((g) => g.id.value === groupId)!;
    const d = group.details();
    const spans = [...byDay.values()];
    const [start, end] = spans[0]!;
    if (!spans.every(([s, e]) => s === start && e === end)) {
      problems.push(
        `En «${d.name.value}» el horario tiene que ser el mismo todos los días (${
          [...byDay.entries()].map(([day, [s, e]]) =>
            sliceLabel({ day, start: HalfHour.fromMinutes(s), end: HalfHour.fromMinutes(e) })
          ).join('; ')
        }).`,
      );
      continue;
    }
    const days = [...byDay.keys()].sort((a, b) => a - b);
    enrolments.push({
      group,
      attendance: Attendance.within(
        d,
        days.length === d.slot.days.length ? null : days,
        HalfHour.fromMinutes(start),
        HalfHour.fromMinutes(end),
      ),
    });
  }
  return { enrolments, uncovered, choices, problems };
}
