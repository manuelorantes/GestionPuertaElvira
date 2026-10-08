import { type Clock, LocalDate } from '../../domain/common/mod.ts';

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

/** Una clase de la agenda del profesor, con su aula y los alumnos que van ese día. */
export interface TeacherClassView extends ClassOnDay {
  classroom: string | null;
  students: number;
}

/** Las clases de un profesor en un periodo (hoy, la semana…) con aula y alumnos de cada día. */
export class TeacherClasses {
  constructor(
    private readonly assignments: ClassAssignments,
    private readonly roster: ClassRoster,
  ) {}

  async execute(teacherId: string, from: string, to: string): Promise<TeacherClassView[]> {
    const classes = await this.assignments.agenda(teacherId, from, to);
    const views: TeacherClassView[] = [];
    for (const item of classes) {
      if (item.groupId === null) {
        views.push({ ...item, classroom: null, students: 0 });
        continue;
      }
      views.push({
        ...item,
        classroom: await this.roster.classroomOf(item.groupId),
        students: (await this.roster.studentsOn(item.groupId, LocalDate.fromString(item.date)))
          .length,
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
