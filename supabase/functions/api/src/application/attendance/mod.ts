import { RollCall } from '../../domain/attendance/mod.ts';
import { type Clock, LocalDate, minutesOfDayInMadrid } from '../../domain/common/mod.ts';

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
 * Estado de la lista de una clase: pasada (o dada por buena), abierta (se puede pasar ya), aún no (no ha empezado)
 * o sin pasar (acabó el plazo).
 */
export type RollCallStatus = 'taken' | 'open' | 'upcoming' | 'missed';

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function statusOf(item: ClassOnDay, roll: RollCall | null, now: Date): RollCallStatus {
  if (roll !== null) return 'taken';
  const date = LocalDate.fromString(item.date);
  const today = LocalDate.fromInstant(now);
  if (
    today.isBefore(date) ||
    (today.equals(date) && minutesOfDayInMadrid(now) < minutesOf(item.start))
  ) {
    return 'upcoming';
  }
  return date.plusDays(1).isBefore(today) ? 'missed' : 'open';
}

/** Una clase de la agenda del profesor, con su aula, los alumnos que van ese día y el estado de su lista. */
export interface TeacherClassView extends ClassOnDay {
  classroom: string | null;
  students: number;
  /** null en los turnos, que no tienen lista. */
  rollCall: RollCallStatus | null;
}

/** Las clases de un profesor en un periodo (hoy, la semana…) con aula y alumnos de cada día. */
export class TeacherClasses {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly roster: ClassRoster,
    private readonly rollCalls: RollCallRepository,
    private readonly clock: Clock,
  ) {}

  async execute(teacherId: string, from: string, to: string): Promise<TeacherClassView[]> {
    const classes = await this.assignments.agenda(teacherId, from, to);
    const now = this.clock.now();
    const views: TeacherClassView[] = [];
    for (const item of classes) {
      if (item.groupId === null) {
        views.push({ ...item, classroom: null, students: 0, rollCall: null });
        continue;
      }
      const date = LocalDate.fromString(item.date);
      views.push({
        ...item,
        classroom: await this.roster.classroomOf(item.groupId),
        students: (await this.roster.studentsOn(item.groupId, date)).length,
        rollCall: statusOf(item, await this.rollCalls.find(item.groupId, date), now),
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

/** La lista de una clase tal y como la ve el profesor: alumnos de ese día, marcados como presentes por defecto. */
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
    const absent = roll?.absent() ?? [];
    return {
      ...item,
      classroom: await this.roster.classroomOf(groupId),
      students: students.length,
      rollCall: statusOf(item, roll, this.clock.now()),
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

/** Clase apuntada en las horas (sesión de un grupo) sin lista y con el plazo acabado. */
export interface MissedRollCall {
  /** Sesión de horas de esa clase, para quitarla si no se dio. */
  sessionId: string;
  groupId: string;
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
