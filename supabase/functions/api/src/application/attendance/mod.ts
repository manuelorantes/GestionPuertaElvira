import {
  ActivityCheck,
  assertWithinWindow,
  ClassComment,
  OPENS_BEFORE_MINUTES,
  RollCall,
  RollCallClosed,
  type RollCallMarks,
  RollCallNotOpenYet,
} from '../../domain/attendance/mod.ts';
import {
  type Clock,
  generateUuidV7,
  InvalidValue,
  LocalDate,
  minutesOfDayInMadrid,
  Season,
  YearMonth,
} from '../../domain/common/mod.ts';

/** Clase (o turno) que da un profesor un día, según el horario y las sustituciones. */
export interface ClassOnDay {
  date: string;
  groupId: string | null;
  dutyId: string | null;
  label: string;
  start: string;
  end: string;
  minutes: number;
  /** La da sustituyendo a su titular. */
  substitution: boolean;
  /** Actividad del club: turno normal o la de los viernes (null en las clases). */
  activity: 'shift' | 'fridays' | null;
}

/**
 * Apunta en las horas, en el momento, la sesión de una clase o actividad que su profesor acaba de pasar o confirmar (la
 * tarea de la noche apunta el resto; si ya está apuntada, no hace nada).
 */
export interface SessionRecorder {
  record(item: ClassOnDay): Promise<void>;
}

/** Quién da cada clase cada día (la agenda de nómina). */
export interface ClassAssignments {
  agenda(teacherId: string, from: string, to: string): Promise<ClassOnDay[]>;
}

export interface RosterStudent {
  id: string;
  name: string;
}

/** Alumnos que van a una clase un día concreto (con su horario especial) y el aula de la clase. */
export interface ClassRoster {
  studentsOn(groupId: string, date: LocalDate): Promise<RosterStudent[]>;
  classroomOf(groupId: string): Promise<string | null>;
  /** Alumnos de alta en el club ese día (para la asistencia especial), por nombre. */
  clubStudentsOn(date: LocalDate): Promise<RosterStudent[]>;
  /** Nombres de unos alumnos (aunque ya no estén de alta). */
  namesOf(ids: readonly string[]): Promise<RosterStudent[]>;
}

/** Grupo de un profesor con sus alumnos y los días que viene cada uno. */
export interface TeacherGroupRoster {
  groupId: string;
  name: string;
  /** Días de la clase («mon», «tue»…). */
  days: string[];
  start: string;
  end: string;
  classroom: string;
  students: { id: string; name: string; days: string[] }[];
}

export interface TeacherRosterQuery {
  /** Grupos de los que es titular. */
  taughtGroupIds(teacherId: string): Promise<string[]>;
  /** Grupos en los que tiene alguna sustitución entre esas fechas (ambas incluidas). */
  substitutedGroupIds(teacherId: string, from: LocalDate, to: LocalDate): Promise<string[]>;
  /** Esos grupos con los alumnos inscritos ese día, por hora y nombre. */
  rostersOf(groupIds: readonly string[], on: LocalDate): Promise<TeacherGroupRoster[]>;
}

export interface RollCallRepository {
  find(group: string, date: LocalDate): Promise<RollCall | null>;
  save(rollCall: RollCall): Promise<void>;
}

/** La clase no es de ese profesor ese día (ni suya ni la sustituye). */
export class ClassNotGiven extends Error {
  constructor() {
    super('Esa clase no la das tú ese día.');
    this.name = 'ClassNotGiven';
  }
}

/**
 * Estado de la lista de una clase: pasada (o dada por buena), abierta (se puede pasar ya), aún no (faltan más de 15
 * minutos para que empiece) o sin pasar (acabó el plazo).
 */
export type RollCallStatus = 'taken' | 'open' | 'upcoming' | 'missed';

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function statusOf(item: ClassOnDay, done: boolean, now: Date): RollCallStatus {
  if (done) return 'taken';
  const date = LocalDate.fromString(item.date);
  const today = LocalDate.fromInstant(now);
  if (
    today.isBefore(date) ||
    (today.equals(date) &&
      minutesOfDayInMadrid(now) < minutesOf(item.start) - OPENS_BEFORE_MINUTES)
  ) {
    return 'upcoming';
  }
  return date.plusDays(1).isBefore(today) ? 'missed' : 'open';
}

/** Una clase de la agenda del profesor, con su aula, los alumnos que van ese día y el estado de su lista. */
export interface TeacherClassView extends ClassOnDay {
  classroom: string | null;
  students: number;
  /** Estado de su lista (o, en una actividad, de su confirmación); null si no tiene. */
  rollCall: RollCallStatus | null;
}

/** Las clases de un profesor en un periodo (hoy, la semana…) con aula y alumnos de cada día. */
export class TeacherClasses {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly roster: ClassRoster,
    private readonly rollCalls: RollCallRepository,
    private readonly clock: Clock,
    private readonly activities: ActivityProgress | null = null,
  ) {}

  async execute(teacherId: string, from: string, to: string): Promise<TeacherClassView[]> {
    const classes = await this.assignments.agenda(teacherId, from, to);
    const now = this.clock.now();
    const views: TeacherClassView[] = [];
    for (const item of classes) {
      if (item.groupId === null) {
        const done = item.dutyId !== null && this.activities !== null &&
          (await this.activities.isDone(item, teacherId));
        views.push({
          ...item,
          classroom: null,
          students: 0,
          rollCall: item.dutyId === null || this.activities === null
            ? null
            : statusOf(item, done, now),
        });
        continue;
      }
      const date = LocalDate.fromString(item.date);
      views.push({
        ...item,
        classroom: await this.roster.classroomOf(item.groupId),
        students: (await this.roster.studentsOn(item.groupId, date)).length,
        rollCall: statusOf(item, (await this.rollCalls.find(item.groupId, date)) !== null, now),
      });
    }
    return views;
  }
}

/**
 * La lista de una clase tal y como la ve el profesor: alumnos de ese día, sin marcar hasta que la pasa; los de fuera de
 * la clase que vinieron (asistencia especial) y los alumnos del club que se pueden añadir así. `period`: si la lista aún
 * no se puede pasar, está en plazo o es pasada (se cambia confirmándolo).
 */
export interface RollCallView extends TeacherClassView {
  groupId: string;
  students: number;
  period: 'upcoming' | 'open' | 'past';
  list: { id: string; name: string; present: boolean }[];
  guests: RosterStudent[];
  others: RosterStudent[];
}

/** La clase de ese grupo que da el profesor ese día, o ClassNotGiven. */
async function givenClass(
  assignments: ClassAssignments,
  teacherId: string,
  groupId: string,
  date: LocalDate,
): Promise<ClassOnDay & { groupId: string }> {
  const day = date.toString();
  const found = (await assignments.agenda(teacherId, day, day)).find((c) => c.groupId === groupId);
  if (!found || found.groupId === null) throw new ClassNotGiven();
  return { ...found, groupId: found.groupId };
}

/** En qué momento está el plazo de una lista: aún no, en plazo o pasada. */
function periodOf(item: ClassOnDay, now: Date): RollCallView['period'] {
  try {
    assertWithinWindow(LocalDate.fromString(item.date), minutesOf(item.start), now);
    return 'open';
  } catch (error) {
    if (error instanceof RollCallClosed) return 'past';
    return 'upcoming';
  }
}

export class OpenRollCall {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly roster: ClassRoster,
    private readonly rollCalls: RollCallRepository,
    private readonly clock: Clock,
  ) {}

  async execute(teacherId: string, groupId: string, date: string): Promise<RollCallView> {
    const day = LocalDate.fromString(date);
    const item = await givenClass(this.assignments, teacherId, groupId, day);
    const students = await this.roster.studentsOn(groupId, day);
    const roll = await this.rollCalls.find(groupId, day);
    // Sin pasar, nadie está marcado (el profesor marca a quien viene); pasada, se ve lo que se guardó.
    const absent = roll?.absent() ?? students.map((s) => s.id);
    // Quien ya es de la lista ese día no es asistencia especial (p. ej. si se le inscribió después con fecha anterior).
    const guestIds = (roll?.guests() ?? []).filter((id) => !students.some((s) => s.id === id));
    const now = this.clock.now();
    const inClass = new Set([...students.map((s) => s.id), ...guestIds]);
    return {
      ...item,
      classroom: await this.roster.classroomOf(groupId),
      students: students.length,
      rollCall: statusOf(item, roll !== null, now),
      period: periodOf(item, now),
      list: students.map((s) => ({ ...s, present: !absent.includes(s.id) })),
      guests: guestIds.length === 0 ? [] : await this.roster.namesOf(guestIds),
      others: (await this.roster.clubStudentsOn(day)).filter((s) => !inClass.has(s.id)),
    };
  }
}

/**
 * El profesor pasa (o corrige) la lista de una clase que da ese día, marcando a quien falta y a quien vino de otra
 * clase. Una lista pasada (fuera de plazo) solo se cambia con `past` (confirmado) y no apunta horas.
 */
export class TakeRollCall {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly roster: ClassRoster,
    private readonly rollCalls: RollCallRepository,
    private readonly clock: Clock,
    private readonly sessions: SessionRecorder | null = null,
  ) {}

  async execute(
    teacherId: string,
    groupId: string,
    date: string,
    marks: RollCallMarks,
    past = false,
  ): Promise<void> {
    const day = LocalDate.fromString(date);
    const item = await givenClass(this.assignments, teacherId, groupId, day);
    const roster = (await this.roster.studentsOn(groupId, day)).map((s) => s.id);
    const now = this.clock.now();
    const start = minutesOf(item.start);
    const existing = await this.rollCalls.find(groupId, day);
    // Asistencia especial: alumnos de alta ese día (o que ya estaban en la lista aunque luego se dieran de baja).
    const allowed = new Set([
      ...(await this.roster.clubStudentsOn(day)).map((s) => s.id),
      ...(existing?.guests() ?? []),
    ]);
    if ((marks.guests ?? []).some((id) => !allowed.has(id))) {
      throw new InvalidValue('guests', 'Elige alumnos de alta en el club ese día.');
    }
    const roll = existing ??
      RollCall.take(groupId, day, start, teacherId, roster, marks, now, past);
    if (existing) existing.correct(start, teacherId, roster, marks, now, past);
    await this.rollCalls.save(roll);
    // Pasar lista en plazo apunta ya las horas de la clase (una lista pasada no: administración ya decidió sobre ellas).
    if (periodOf(item, now) === 'open') await this.sessions?.record(item);
  }
}

/**
 * Clase o actividad apuntada en las horas sin confirmar y con el plazo acabado: una clase sin lista, un turno sin
 * «Turno hecho» o unos viernes en los que el encargado no marcó a nadie.
 */
export interface MissedRollCall {
  /** Sesión de horas de esa clase, para quitarla si no se dio. */
  sessionId: string;
  /** La clase (o, en una actividad del club, null). */
  groupId: string | null;
  /** La actividad del club (o, en una clase, null). */
  dutyId: string | null;
  date: string;
  label: string;
  teacherName: string;
  /** Su liquidación ya está pagada: la sesión no se puede quitar. */
  locked: boolean;
}

export interface MissedRollCallQuery {
  /** Primer día que cuenta (el día en que se activó la asistencia). */
  since(): Promise<LocalDate>;
  /** Sesiones de grupo entre esas fechas sin lista ni confirmación, de la más antigua a la más reciente. */
  missed(from: LocalDate, until: LocalDate): Promise<MissedRollCall[]>;
}

/** Último día cuyo plazo ya acabó: anteayer (el de ayer se puede pasar hasta el final de hoy). */
const lastClosedDay = (now: Date) => LocalDate.fromInstant(now).plusDays(-2);

/** Listas sin pasar: clases apuntadas cuyo plazo acabó sin lista (para quitarlas o darlas por buenas). */
export class MissedRollCalls {
  constructor(
    private readonly query: MissedRollCallQuery,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<MissedRollCall[]> {
    const until = lastClosedDay(this.clock.now());
    const since = await this.query.since();
    return until.isBefore(since) ? [] : await this.query.missed(since, until);
  }
}

/** Aún se puede pasar la lista: no se puede dar por buena todavía. */
export class RollCallStillOpen extends Error {
  constructor() {
    super(
      'El profesor todavía puede pasar esta lista (hasta el final del día siguiente a la clase).',
    );
    this.name = 'RollCallStillOpen';
  }
}

/** Administración da por buena una clase sin lista (se dio y cuenta): deja de salir en el aviso. */
export class ConfirmWithoutRollCall {
  constructor(
    private readonly rollCalls: RollCallRepository,
    private readonly clock: Clock,
  ) {}

  async execute(groupId: string, date: string, userId: string): Promise<void> {
    const day = LocalDate.fromString(date);
    const now = this.clock.now();
    if (lastClosedDay(now).isBefore(day)) throw new RollCallStillOpen();
    if ((await this.rollCalls.find(groupId, day)) !== null) return;
    await this.rollCalls.save(RollCall.confirm(groupId, day, userId, now));
  }
}

/**
 * Asistencia de un alumno en un periodo: clases con lista pasada en las que estaba, las que faltó y las clases de otros
 * grupos a las que vino (asistencia especial; no cuentan en el porcentaje).
 */
export interface StudentAttendanceSummary {
  classes: number;
  absences: { date: string; label: string }[];
  specials: { date: string; label: string }[];
}

export interface StudentAttendanceQuery {
  summary(studentId: string, from: LocalDate, to: LocalDate): Promise<StudentAttendanceSummary>;
}

export interface StudentAttendanceView extends StudentAttendanceSummary {
  /** Año en que empieza la temporada. */
  season: number;
  attended: number;
}

/** La asistencia de un alumno en la temporada en curso (para la ficha del alumno). */
export class StudentAttendance {
  constructor(
    private readonly query: StudentAttendanceQuery,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string): Promise<StudentAttendanceView> {
    const today = LocalDate.fromInstant(this.clock.now());
    const season = Season.containing(YearMonth.of(today));
    const summary = await this.query.summary(studentId, season.firstMonth().firstDay(), today);
    return {
      season: season.firstMonth().year,
      ...summary,
      attended: summary.classes - summary.absences.length,
    };
  }
}

// ---- Actividades del club --------------------------------------------------------------------

/** Confirmaciones de las actividades (tabla de «Turno hecho» y «Se dio»). */
export interface ActivityCheckRepository {
  find(duty: string, date: LocalDate): Promise<ActivityCheck | null>;
  save(check: ActivityCheck): Promise<void>;
}

/** La asistencia de los viernes de los puntos, vista desde la actividad de los viernes. */
export interface FridayAttendance {
  /** Cuántas asistencias de ese viernes marcó el propio profesor (desde su cuenta). */
  markedByTeacher(teacherId: string, date: LocalDate): Promise<number>;
  /** Los que vinieron algún viernes de ese mes o del anterior, y los que ya están marcados ese día. */
  proposed(date: LocalDate): Promise<RosterStudent[]>;
  /** Quiénes están marcados ese viernes (por quien sea). */
  presentOn(date: LocalDate): Promise<string[]>;
  /** Todos los alumnos de alta ese día, para el buscador. */
  everyone(date: LocalDate): Promise<RosterStudent[]>;
  /** Marca o desmarca la asistencia (y su punto) firmada por la cuenta que lo hace. */
  mark(student: string, date: LocalDate, present: boolean, user: string | null): Promise<void>;
}

/** Si una actividad de la agenda ya está hecha ese día: con «Turno hecho» o, la de los viernes, con alguna marca suya. */
export class ActivityProgress {
  constructor(
    private readonly checks: ActivityCheckRepository,
    private readonly fridays: FridayAttendance,
  ) {}

  async isDone(item: ClassOnDay, teacherId: string): Promise<boolean> {
    if (item.dutyId === null) return false;
    const date = LocalDate.fromString(item.date);
    if ((await this.checks.find(item.dutyId, date)) !== null) return true;
    return item.activity === 'fridays' && (await this.fridays.markedByTeacher(teacherId, date)) > 0;
  }
}

/** La actividad de esa agenda que da el profesor ese día, del tipo pedido, o ClassNotGiven. */
async function givenActivity(
  assignments: ClassAssignments,
  teacherId: string,
  dutyId: string,
  date: LocalDate,
  kind: 'shift' | 'fridays',
): Promise<ClassOnDay> {
  const day = date.toString();
  const found = (await assignments.agenda(teacherId, day, day)).find((c) =>
    c.dutyId === dutyId && c.activity === kind
  );
  if (!found) throw new ClassNotGiven();
  return found;
}

/** El encargado de un turno normal confirma que lo hizo («Turno hecho»), en el plazo de las listas. */
export class MarkShiftDone {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly checks: ActivityCheckRepository,
    private readonly clock: Clock,
    private readonly sessions: SessionRecorder | null = null,
  ) {}

  async execute(teacherId: string, dutyId: string, date: string): Promise<void> {
    const day = LocalDate.fromString(date);
    const item = await givenActivity(this.assignments, teacherId, dutyId, day, 'shift');
    if ((await this.checks.find(dutyId, day)) !== null) return;
    await this.checks.save(
      ActivityCheck.done(dutyId, day, minutesOf(item.start), teacherId, this.clock.now()),
    );
    await this.sessions?.record(item);
  }
}

/** La lista de los viernes del encargado: los propuestos (sin marcar si no vinieron) y todos para el buscador. */
export interface FridayListView extends ClassOnDay {
  rollCall: RollCallStatus;
  list: { id: string; name: string; present: boolean }[];
  everyone: RosterStudent[];
}

export class OpenFridayList {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly fridays: FridayAttendance,
    private readonly progress: ActivityProgress,
    private readonly clock: Clock,
  ) {}

  async execute(teacherId: string, dutyId: string, date: string): Promise<FridayListView> {
    const day = LocalDate.fromString(date);
    const item = await givenActivity(this.assignments, teacherId, dutyId, day, 'fridays');
    const present = new Set(await this.fridays.presentOn(day));
    const proposed = await this.fridays.proposed(day);
    return {
      ...item,
      rollCall: statusOf(item, await this.progress.isDone(item, teacherId), this.clock.now()),
      list: proposed.map((s) => ({ ...s, present: present.has(s.id) })),
      everyone: await this.fridays.everyone(day),
    };
  }
}

/** El encargado de los viernes marca (o desmarca) que un alumno vino: la misma asistencia y punto que en Puntos. */
export class MarkFridayAsManager {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly fridays: FridayAttendance,
    private readonly clock: Clock,
    private readonly sessions: SessionRecorder | null = null,
  ) {}

  async execute(
    teacherId: string,
    userId: string | null,
    dutyId: string,
    date: string,
    student: string,
    present: boolean,
  ): Promise<void> {
    const day = LocalDate.fromString(date);
    const item = await givenActivity(this.assignments, teacherId, dutyId, day, 'fridays');
    assertWithinWindow(day, minutesOf(item.start), this.clock.now());
    await this.fridays.mark(student, day, present, userId);
    // La primera vez que el encargado marca a alguien se apuntan ya sus horas de la actividad.
    if (present) await this.sessions?.record(item);
  }
}

/** Administración da por buena una actividad que su encargado no confirmó: deja de salir en el aviso. */
export class ConfirmActivity {
  constructor(
    private readonly checks: ActivityCheckRepository,
    private readonly clock: Clock,
  ) {}

  async execute(dutyId: string, date: string, userId: string): Promise<void> {
    const day = LocalDate.fromString(date);
    const now = this.clock.now();
    if (lastClosedDay(now).isBefore(day)) throw new RollCallStillOpen();
    if ((await this.checks.find(dutyId, day)) !== null) return;
    await this.checks.save(ActivityCheck.confirm(dutyId, day, userId, now));
  }
}

// ---- Asistencia de un grupo ------------------------------------------------------------------

/** Primer día de la temporada en curso (en julio y agosto, la que acaba de terminar). */
function seasonStart(today: LocalDate): LocalDate {
  const first = Season.containing(YearMonth.of(today)).firstMonth().firstDay();
  return today.isBefore(first) ? Season.startingIn(first.year - 1).firstMonth().firstDay() : first;
}

/** Lo que guarda el club de un grupo en un periodo: horario, festivos, listas, inscripciones y faltas. */
export interface GroupAttendanceData {
  name: string;
  /** Días de clase (1 = lunes … 7 = domingo). */
  weekdays: number[];
  holidays: Set<string>;
  rollCalls: { date: string; kind: 'taken' | 'confirmed' }[];
  /** Inscripciones que tocan el periodo: desde, hasta (exclusivo) y días que viene (null = todos los del grupo). */
  enrolments: {
    studentId: string;
    name: string;
    from: string;
    until: string | null;
    days: number[] | null;
  }[];
  absences: { date: string; studentId: string }[];
  /** Alumnos de fuera del grupo que vinieron (asistencia especial). */
  guests: { date: string; studentId: string; name: string }[];
}

export interface GroupAttendanceQuery {
  /** null si el grupo no existe. */
  between(groupId: string, from: LocalDate, to: LocalDate): Promise<GroupAttendanceData | null>;
}

export class AttendanceGroupNotFound extends Error {
  constructor() {
    super('Ese grupo no existe.');
    this.name = 'AttendanceGroupNotFound';
  }
}

/** Estado de un día de clase: lista pasada, dada por buena sin lista, sin lista (aún) o festivo. */
export type GroupDayStatus = 'taken' | 'confirmed' | 'pending' | 'holiday';
/**
 * Un alumno un día: vino, faltó, sin saber (no hay lista), vino sin tocarle (asistencia especial) o null si ese día no
 * le tocaba.
 */
export type AttendanceMark = 'present' | 'absent' | 'unknown' | 'special' | null;

export interface GroupAttendanceView {
  groupId: string;
  name: string;
  month: string;
  days: { date: string; status: GroupDayStatus }[];
  /**
   * `marks` va en el orden de `days`; `classes` = días con lista en que le tocaba venir (la asistencia especial no
   * cuenta); `member`: estuvo inscrito algún día del mes (si no, solo vino en asistencia especial).
   */
  students: {
    id: string;
    name: string;
    marks: AttendanceMark[];
    attended: number;
    classes: number;
    member: boolean;
  }[];
}

/**
 * La asistencia de un grupo en un mes, día a día: los días de clase hasta hoy y, por cada alumno que estuvo inscrito,
 * si vino a cada uno de los suyos; más los alumnos de fuera que vinieron algún día (asistencia especial).
 */
export class GroupAttendance {
  constructor(
    private readonly query: GroupAttendanceQuery,
    private readonly clock: Clock,
  ) {}

  execute(groupId: string, month: string): Promise<GroupAttendanceView> {
    const ym = YearMonth.fromString(month);
    const today = LocalDate.fromInstant(this.clock.now());
    const to = ym.lastDay().isBefore(today) ? ym.lastDay() : today;
    return this.between(groupId, ym.firstDay(), to, ym.toString());
  }

  /** Desde el principio de la temporada hasta hoy (`month` es el mes en curso). */
  season(groupId: string): Promise<GroupAttendanceView> {
    const today = LocalDate.fromInstant(this.clock.now());
    return this.between(groupId, seasonStart(today), today, YearMonth.of(today).toString());
  }

  private async between(
    groupId: string,
    from: LocalDate,
    to: LocalDate,
    month: string,
  ): Promise<GroupAttendanceView> {
    const data = await this.query.between(groupId, from, to);
    if (data === null) throw new AttendanceGroupNotFound();
    const rollCalls = new Map(data.rollCalls.map((r) => [r.date, r.kind]));
    const absent = new Set(data.absences.map((a) => `${a.date}|${a.studentId}`));
    const days: { date: string; status: GroupDayStatus; weekday: number }[] = [];
    for (let d = from; !to.isBefore(d); d = d.plusDays(1)) {
      if (!data.weekdays.includes(d.isoWeekday())) continue;
      const date = d.toString();
      days.push({
        date,
        weekday: d.isoWeekday(),
        status: data.holidays.has(date) ? 'holiday' : rollCalls.get(date) ?? 'pending',
      });
    }
    const byStudent = new Map<string, GroupAttendanceView['students'][number]>();
    const row = (id: string, name: string): GroupAttendanceView['students'][number] => {
      const found: GroupAttendanceView['students'][number] = byStudent.get(id) ??
        { id, name, marks: days.map(() => null), attended: 0, classes: 0, member: false };
      byStudent.set(id, found);
      return found;
    };
    for (const e of data.enrolments) {
      const student = row(e.studentId, e.name);
      days.forEach((day, i) => {
        const enrolled = e.from <= day.date && (e.until === null || day.date < e.until) &&
          (e.days === null || e.days.includes(day.weekday));
        if (!enrolled || day.status === 'holiday') return;
        student.member = true;
        if (day.status !== 'taken') {
          student.marks[i] = 'unknown';
          return;
        }
        const mark = absent.has(`${day.date}|${e.studentId}`) ? 'absent' : 'present';
        student.marks[i] = mark;
        student.classes++;
        if (mark === 'present') student.attended++;
      });
    }
    // Asistencia especial de quien no era del grupo ese día (si ya lo era, cuenta como su asistencia normal).
    for (const g of data.guests) {
      const i = days.findIndex((d) => d.date === g.date);
      const student = row(g.studentId, g.name);
      if (i >= 0 && student.marks[i] === null) student.marks[i] = 'special';
    }
    return {
      groupId,
      name: data.name,
      month,
      days: days.map(({ date, status }) => ({ date, status })),
      students: [...byStudent.values()]
        .filter((s) => s.marks.some((m) => m !== null))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    };
  }
}

// ---- Comentarios de las clases ----------------------------------------------------------------

export interface ClassCommentRepository {
  find(id: string): Promise<ClassComment | null>;
  save(comment: ClassComment): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Un comentario nuevo: de un alumno de la clase o, con `studentId` null, de la clase en sí. */
export interface NewClassComment {
  studentId: string | null;
  text: string;
}

export class ClassCommentNotFound extends Error {
  constructor() {
    super('Ese comentario no existe.');
    this.name = 'ClassCommentNotFound';
  }
}

export class NotYourComment extends Error {
  constructor() {
    super('Solo puedes cambiar los comentarios que has escrito tú.');
    this.name = 'NotYourComment';
  }
}

/**
 * Comentar una clase de un día: quien la da (desde que se puede pasar su lista, también si ya es pasada: no cambia la
 * asistencia) o administración (una clase que ya se dio). Los de un alumno, solo de los de la lista de ese día o los que
 * vinieron de otra clase (asistencia especial).
 */
export class CommentClass {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly roster: ClassRoster,
    private readonly rollCalls: RollCallRepository,
    private readonly comments: ClassCommentRepository,
    private readonly clock: Clock,
  ) {}

  async asTeacher(
    teacherId: string,
    userId: string | null,
    groupId: string,
    date: string,
    input: NewClassComment,
  ): Promise<string> {
    const day = LocalDate.fromString(date);
    const item = await givenClass(this.assignments, teacherId, groupId, day);
    if (periodOf(item, this.clock.now()) === 'upcoming') throw new RollCallNotOpenYet();
    return await this.write(groupId, day, input, { teacher: teacherId, user: userId });
  }

  async asStaff(
    userId: string,
    groupId: string,
    date: string,
    input: NewClassComment,
  ): Promise<string> {
    const day = LocalDate.fromString(date);
    if ((await this.roster.classroomOf(groupId)) === null) throw new AttendanceGroupNotFound();
    if (LocalDate.fromInstant(this.clock.now()).isBefore(day)) {
      throw new InvalidValue('date', 'No se puede comentar una clase que aún no se ha dado.');
    }
    return await this.write(groupId, day, input, { teacher: null, user: userId });
  }

  private async write(
    groupId: string,
    day: LocalDate,
    input: NewClassComment,
    author: { teacher: string | null; user: string | null },
  ): Promise<string> {
    if (input.studentId !== null && !(await this.inClass(groupId, day, input.studentId))) {
      throw new InvalidValue('studentId', 'Elige uno de los alumnos de esa clase ese día.');
    }
    const comment = ClassComment.write(
      generateUuidV7(),
      groupId,
      day,
      input.studentId,
      input.text,
      author,
      this.clock.now(),
    );
    await this.comments.save(comment);
    return comment.id;
  }

  private async inClass(groupId: string, day: LocalDate, studentId: string): Promise<boolean> {
    const students = (await this.roster.studentsOn(groupId, day)).map((s) => s.id);
    const guests = (await this.rollCalls.find(groupId, day))?.guests() ?? [];
    return [...students, ...guests].includes(studentId);
  }
}

/** Quien cambia un comentario: un profesor (solo los suyos) o administración (cualquiera). */
export type CommentEditor = { teacher: string } | 'staff';

export class EditClassComment {
  constructor(
    private readonly comments: ClassCommentRepository,
    private readonly clock: Clock,
  ) {}

  async rewrite(id: string, text: string, editor: CommentEditor): Promise<void> {
    const comment = await this.editable(id, editor);
    comment.rewrite(text, this.clock.now());
    await this.comments.save(comment);
  }

  async remove(id: string, editor: CommentEditor): Promise<void> {
    await this.editable(id, editor);
    await this.comments.remove(id);
  }

  private async editable(id: string, editor: CommentEditor): Promise<ClassComment> {
    const comment = await this.comments.find(id);
    if (comment === null) throw new ClassCommentNotFound();
    if (editor !== 'staff' && !comment.isWrittenByTeacher(editor.teacher)) {
      throw new NotYourComment();
    }
    return comment;
  }
}

/** Un comentario tal y como se lee: con la clase, el alumno (o null si es de la clase) y quien lo escribió. */
export interface ClassCommentView {
  id: string;
  groupId: string;
  groupName: string;
  date: string;
  studentId: string | null;
  studentName: string | null;
  text: string;
  /** Nombre del profesor que lo escribió o, si fue administración, de su cuenta. */
  author: string;
  authorTeacherId: string | null;
  writtenAt: string;
}

export interface ClassCommentQuery {
  /** Los de una clase un día, en el orden en que se escribieron. */
  ofClass(groupId: string, date: LocalDate): Promise<ClassCommentView[]>;
  /** Los de un grupo entre dos fechas, por día y en el orden en que se escribieron. */
  ofGroup(groupId: string, from: LocalDate, to: LocalDate): Promise<ClassCommentView[]>;
  /** Los de un alumno, del más reciente al más antiguo. */
  ofStudent(studentId: string): Promise<ClassCommentView[]>;
}

/** Los comentarios de la clase que da el profesor ese día, marcando los que puede cambiar (los suyos). */
export class RollCallComments {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly comments: ClassCommentQuery,
  ) {}

  async execute(
    teacherId: string,
    groupId: string,
    date: string,
  ): Promise<(ClassCommentView & { editable: boolean })[]> {
    const day = LocalDate.fromString(date);
    await givenClass(this.assignments, teacherId, groupId, day);
    return (await this.comments.ofClass(groupId, day)).map((c) => ({
      ...c,
      editable: c.authorTeacherId === teacherId,
    }));
  }
}

/** Los comentarios de un grupo en un mes (para su asistencia). */
export class GroupClassComments {
  constructor(private readonly comments: ClassCommentQuery) {}

  execute(groupId: string, month: string): Promise<ClassCommentView[]> {
    const ym = YearMonth.fromString(month);
    return this.comments.ofGroup(groupId, ym.firstDay(), ym.lastDay());
  }
}

/** Los comentarios sobre un alumno en sus clases (para su ficha). */
export class StudentClassComments {
  constructor(private readonly comments: ClassCommentQuery) {}

  execute(studentId: string): Promise<ClassCommentView[]> {
    return this.comments.ofStudent(studentId);
  }
}

// ---- Mis grupos ----------------------------------------------------------------------------------

/** El grupo no es de ese profesor (ni lo sustituye esa semana): no se dice si existe. */
export class GroupNotYours extends Error {
  constructor() {
    super('Ese grupo no es tuyo.');
    this.name = 'GroupNotYours';
  }
}

/** Días antes y después de una sustitución en que quien sustituye ve el grupo. */
const SUBSTITUTION_REACH_DAYS = 7;

/**
 * Qué grupos ve un profesor en «Mis grupos»: los suyos y aquellos en los que tiene una sustitución a 7 días o menos
 * (marcados como sustitución).
 */
export class TeacherGroupAccess {
  constructor(
    private readonly query: TeacherRosterQuery,
    private readonly clock: Clock,
  ) {}

  /** Grupo → si lo ve por una sustitución (false si es titular), en orden: los suyos y luego los sustituidos. */
  async visible(teacherId: string): Promise<Map<string, boolean>> {
    const today = LocalDate.fromInstant(this.clock.now());
    const visible = new Map<string, boolean>();
    for (const id of await this.query.taughtGroupIds(teacherId)) visible.set(id, false);
    const substituted = await this.query.substitutedGroupIds(
      teacherId,
      today.plusDays(-SUBSTITUTION_REACH_DAYS),
      today.plusDays(SUBSTITUTION_REACH_DAYS),
    );
    for (const id of substituted) if (!visible.has(id)) visible.set(id, true);
    return visible;
  }

  async assert(teacherId: string, groupId: string): Promise<void> {
    if (!(await this.visible(teacherId)).has(groupId)) throw new GroupNotYours();
  }
}

/** Un grupo en «Mis grupos»: horario, aula, alumnos de hoy y su asistencia de la temporada en ese grupo. */
export interface TeacherGroupSummary extends Omit<TeacherGroupRoster, 'students'> {
  substitution: boolean;
  students: { id: string; name: string; days: string[]; attended: number; classes: number }[];
}

export class TeacherGroups {
  constructor(
    private readonly access: TeacherGroupAccess,
    private readonly query: TeacherRosterQuery,
    private readonly attendance: GroupAttendance,
    private readonly clock: Clock,
  ) {}

  async execute(teacherId: string): Promise<TeacherGroupSummary[]> {
    const visible = await this.access.visible(teacherId);
    const today = LocalDate.fromInstant(this.clock.now());
    const rosters = await this.query.rostersOf([...visible.keys()], today);
    const ordered = [...rosters].sort((a, b) =>
      Number(visible.get(a.groupId)) - Number(visible.get(b.groupId))
    );
    const summaries: TeacherGroupSummary[] = [];
    for (const roster of ordered) {
      const season = new Map(
        (await this.attendance.season(roster.groupId)).students.map((s) => [s.id, s]),
      );
      summaries.push({
        ...roster,
        substitution: visible.get(roster.groupId) ?? false,
        students: roster.students.map((s) => ({
          ...s,
          attended: season.get(s.id)?.attended ?? 0,
          classes: season.get(s.id)?.classes ?? 0,
        })),
      });
    }
    return summaries;
  }
}

/** La asistencia de un mes de uno de los grupos que ve el profesor (solo lectura). */
export class TeacherGroupAttendance {
  constructor(
    private readonly access: TeacherGroupAccess,
    private readonly attendance: GroupAttendance,
  ) {}

  async execute(teacherId: string, groupId: string, month: string): Promise<GroupAttendanceView> {
    await this.access.assert(teacherId, groupId);
    return await this.attendance.execute(groupId, month);
  }
}

/** Días de comentarios que se ven cada vez (las últimas 4 semanas y, con «Ver más», las 4 anteriores). */
const COMMENT_WINDOW_DAYS = 28;

export interface TeacherGroupCommentsView {
  /** Del más reciente al más antiguo. */
  items: ClassCommentView[];
  /** Día desde el que pedir los anteriores, o null si ya se llegó al principio de la temporada. */
  nextBefore: string | null;
}

/** Los comentarios de las clases de uno de sus grupos, de 4 en 4 semanas hacia atrás hasta el inicio de la temporada. */
export class TeacherGroupComments {
  constructor(
    private readonly access: TeacherGroupAccess,
    private readonly comments: ClassCommentQuery,
    private readonly clock: Clock,
  ) {}

  async execute(
    teacherId: string,
    groupId: string,
    before: string | null,
  ): Promise<TeacherGroupCommentsView> {
    await this.access.assert(teacherId, groupId);
    const today = LocalDate.fromInstant(this.clock.now());
    const asked = before === null ? today : LocalDate.fromString(before);
    const to = today.isBefore(asked) ? today : asked;
    const first = seasonStart(today);
    const windowStart = to.plusDays(1 - COMMENT_WINDOW_DAYS);
    const from = windowStart.isBefore(first) ? first : windowStart;
    const items = to.isBefore(from) ? [] : await this.comments.ofGroup(groupId, from, to);
    return {
      items: [...items].sort((a, b) =>
        b.date.localeCompare(a.date) || b.writtenAt.localeCompare(a.writtenAt)
      ),
      nextBefore: first.isBefore(from) ? from.plusDays(-1).toString() : null,
    };
  }
}
