import {
  ActivityCheck,
  assertWithinWindow,
  OPENS_BEFORE_MINUTES,
  RollCall,
} from '../../domain/attendance/mod.ts';
import {
  type Clock,
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
  /** Grupos de los que es titular, con los alumnos inscritos ese día. */
  groupsOf(teacherId: string, on: LocalDate): Promise<TeacherGroupRoster[]>;
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

/** Los alumnos de las clases de un profesor (sin datos de contacto), a día de hoy. */
export class TeacherStudents {
  constructor(
    private readonly query: TeacherRosterQuery,
    private readonly clock: Clock,
  ) {}

  execute(teacherId: string): Promise<TeacherGroupRoster[]> {
    return this.query.groupsOf(teacherId, LocalDate.fromInstant(this.clock.now()));
  }
}

/** La lista de una clase tal y como la ve el profesor: alumnos de ese día, sin marcar hasta que la pasa. */
export interface RollCallView extends TeacherClassView {
  groupId: string;
  students: number;
  list: { id: string; name: string; present: boolean }[];
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
    return {
      ...item,
      classroom: await this.roster.classroomOf(groupId),
      students: students.length,
      rollCall: statusOf(item, roll !== null, this.clock.now()),
      list: students.map((s) => ({ ...s, present: !absent.includes(s.id) })),
    };
  }
}

/** El profesor pasa (o corrige) la lista de una clase que da ese día, marcando a quien falta. */
export class TakeRollCall {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly roster: ClassRoster,
    private readonly rollCalls: RollCallRepository,
    private readonly clock: Clock,
  ) {}

  async execute(teacherId: string, groupId: string, date: string, absent: string[]): Promise<void> {
    const day = LocalDate.fromString(date);
    const item = await givenClass(this.assignments, teacherId, groupId, day);
    const roster = (await this.roster.studentsOn(groupId, day)).map((s) => s.id);
    const now = this.clock.now();
    const start = minutesOf(item.start);
    const existing = await this.rollCalls.find(groupId, day);
    const roll = existing ?? RollCall.take(groupId, day, start, teacherId, roster, absent, now);
    if (existing) existing.correct(start, teacherId, roster, absent, now);
    await this.rollCalls.save(roll);
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

/** Asistencia de un alumno en un periodo: clases con lista pasada en las que estaba y las que faltó. */
export interface StudentAttendanceSummary {
  classes: number;
  absences: { date: string; label: string }[];
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
  ) {}

  async execute(teacherId: string, dutyId: string, date: string): Promise<void> {
    const day = LocalDate.fromString(date);
    const item = await givenActivity(this.assignments, teacherId, dutyId, day, 'shift');
    if ((await this.checks.find(dutyId, day)) !== null) return;
    await this.checks.save(
      ActivityCheck.done(dutyId, day, minutesOf(item.start), teacherId, this.clock.now()),
    );
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
