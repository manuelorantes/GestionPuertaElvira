import {
  type Clock,
  type HasErrorDetails,
  InvalidValue,
  LocalDate,
} from '../../domain/common/mod.ts';
import {
  Attendance,
  Capacity,
  ClassGroup,
  ClassGroupId,
  Classroom,
  ClassroomSchedule,
  type CurrentEnrolment,
  Enrolment,
  EnrolmentId,
  EnrolmentPolicy,
  GroupDetails,
  GroupName,
  HalfHour,
  levelFromName,
  occupancyByDay,
  resolveSchedule,
  StudentReference,
  TeacherReference,
  type Weekday,
  weekdayCode,
  weekdayFromName,
  weekdayShortLabel,
  WeeklySlot,
} from '../../domain/classes/mod.ts';
import type { TransactionRunner } from '../common/mod.ts';

export interface ClassGroupRepository {
  find(id: ClassGroupId): Promise<ClassGroup | null>;
  all(): Promise<ClassGroup[]>;
  save(group: ClassGroup): Promise<void>;
}

export interface EnrolmentRepository {
  save(enrolment: Enrolment): Promise<void>;
  activeForStudent(student: StudentReference, on: LocalDate): Promise<Enrolment[]>;
  activeForStudentInGroup(
    student: StudentReference,
    group: ClassGroupId,
    on: LocalDate,
  ): Promise<Enrolment | null>;
  /** Todas las inscripciones (pasadas y vigentes) de un alumno en un grupo. */
  ofStudentInGroup(student: StudentReference, group: ClassGroupId): Promise<Enrolment[]>;
  /** Inscripciones vigentes en el grupo ese día. */
  activeInGroup(group: ClassGroupId, on: LocalDate): Promise<Enrolment[]>;
}

/** Desde cuándo está de alta en el club un alumno (su alta en curso), según Alumnado. */
export interface StudentJoinDates {
  joinedOn(student: StudentReference): Promise<LocalDate | null>;
}

/** Un alumno no puede estar en un grupo en el futuro ni antes de su alta en el club. */
async function assertValidStart(
  joinDates: StudentJoinDates | null,
  student: StudentReference,
  from: LocalDate,
  today: LocalDate,
): Promise<void> {
  if (today.isBefore(from)) {
    throw new InvalidValue('from', 'La inscripción no puede empezar en el futuro.');
  }
  const joined = joinDates === null ? null : await joinDates.joinedOn(student);
  if (joined !== null && from.isBefore(joined)) {
    throw new InvalidValue('from', 'La inscripción no puede empezar antes de su alta en el club.');
  }
}

/** Si un profesor existe y está activo (lo responde el contexto de Profesorado). */
export interface TeacherDirectory {
  isActive(teacher: TeacherReference): Promise<boolean>;
}

/** Si un alumno sigue activo en el club (lo responde el contexto de Alumnado). */
export interface StudentStatus {
  isActive(student: StudentReference): Promise<boolean>;
}

export interface GroupSummary {
  id: string;
  name: string;
  /** false cuando es el nombre por defecto (día, hora, nivel y aula). */
  customName: boolean;
  level: string;
  teacherId: string;
  teacherName: string;
  days: string[];
  start: string;
  end: string;
  slotLabel: string;
  classroom: string;
  capacity: number;
  /** Plazas ocupadas el día más lleno. */
  occupied: number;
  /** Plazas ocupadas cada día (código del día → alumnos). */
  occupancyByDay: Record<string, number>;
  weeklyPlan: string;
}

export interface EnrolledStudent {
  id: string;
  fullName: string;
  age: number | null;
  /** «Lun · 18:30–19:00» si tiene horario especial; null si va a todo el grupo. */
  attendanceLabel: string | null;
}

export interface ClassQuery {
  /** Ordenados por primer día de la semana, hora de inicio y aula. */
  groups(on: LocalDate): Promise<GroupSummary[]>;
  group(id: string, on: LocalDate): Promise<GroupSummary | null>;
  enrolledStudents(groupId: string, on: LocalDate): Promise<EnrolledStudent[]>;
}

export class ClassGroupNotFound extends Error {
  constructor() {
    super('No existe ese grupo.');
    this.name = 'ClassGroupNotFound';
  }
}

export class ClassroomConflict extends Error implements HasErrorDetails {
  constructor(private readonly conflicting: ClassGroup) {
    const details = conflicting.details();
    super(
      `Coincide en el aula ${details.classroom.name()} con «${details.name.value}» (${details.slot.label()}).`,
    );
    this.name = 'ClassroomConflict';
  }

  details(): Record<string, string> {
    return {
      groupId: this.conflicting.id.value,
      groupName: this.conflicting.details().name.value,
      slotLabel: this.conflicting.details().slot.label(),
    };
  }
}

export class LastEnrolment extends Error {
  constructor() {
    super('Es su único grupo: para dejarlo, da de baja al alumno o muévelo a otro grupo.');
    this.name = 'LastEnrolment';
  }
}

export class NotEnrolled extends Error {
  constructor() {
    super('El alumno no está inscrito en ese grupo.');
    this.name = 'NotEnrolled';
  }
}

export class TeacherNotAvailable extends Error {
  constructor() {
    super('El profesor elegido no existe o no está activo.');
    this.name = 'TeacherNotAvailable';
  }
}

/** Datos de un grupo tal y como llegan del exterior; `toDetails()` los valida. */
export interface GroupInput {
  /** Opcional: vacío o null es «nombre por defecto». */
  name: string | null;
  level: string;
  teacherId: string;
  days: string[];
  start: string;
  end: string;
  classroom: string;
  capacity: number;
}

export function groupDetails(input: GroupInput): GroupDetails {
  return new GroupDetails(
    GroupName.optional(input.name),
    levelFromName(input.level),
    TeacherReference.fromString(input.teacherId),
    WeeklySlot.of(
      input.days.map(weekdayFromName),
      HalfHour.fromString(input.start),
      HalfHour.fromString(input.end),
    ),
    Classroom.fromString(input.classroom),
    Capacity.of(input.capacity),
  );
}

/** Reglas comunes al crear y editar un grupo: profesor activo y aula libre. */
class GroupDetailsGuard {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly teachers: TeacherDirectory,
  ) {}

  async assertAcceptable(id: ClassGroupId, details: GroupDetails): Promise<void> {
    if (!(await this.teachers.isActive(details.teacher))) throw new TeacherNotAvailable();
    const conflicts = new ClassroomSchedule().conflictsFor(id, details, await this.groups.all());
    if (conflicts[0]) throw new ClassroomConflict(conflicts[0]);
  }
}

export class CreateClassGroup {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly teachers: TeacherDirectory,
  ) {}

  async execute(input: GroupInput): Promise<string> {
    const id = ClassGroupId.generate();
    const details = groupDetails(input);
    await new GroupDetailsGuard(this.groups, this.teachers).assertAcceptable(id, details);
    await this.groups.save(ClassGroup.create(id, details));
    return id.value;
  }
}

export class UpdateClassGroup {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly teachers: TeacherDirectory,
  ) {}

  async execute(id: string, input: GroupInput): Promise<void> {
    const group = await this.groups.find(ClassGroupId.fromString(id));
    if (group === null) throw new ClassGroupNotFound();
    const details = groupDetails(input);
    await new GroupDetailsGuard(this.groups, this.teachers).assertAcceptable(group.id, details);
    group.update(details);
    await this.groups.save(group);
  }
}

/** Horario especial tal como llega del exterior; null o todo vacío es «todo el grupo». */
export interface AttendanceInput {
  days: string[] | null;
  start: string | null;
  end: string | null;
}

export function attendanceFrom(group: GroupDetails, input: AttendanceInput | null): Attendance {
  if (input === null) return Attendance.full();
  return Attendance.within(
    group,
    input.days === null ? null : input.days.map(weekdayFromName),
    input.start === null ? null : HalfHour.fromString(input.start),
    input.end === null ? null : HalfHour.fromString(input.end),
  );
}

/** Inscribe a un alumno aplicando EnrolmentPolicy; compartido por EnrolStudent, MoveStudent y ChangeAttendance. */
class Enrolling {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly enrolments: EnrolmentRepository,
  ) {}

  /** Comprueba las reglas y devuelve el horario validado; `ignoring` deja fuera un grupo del alumno. */
  async check(
    student: StudentReference,
    target: ClassGroup,
    on: LocalDate,
    overCapacityConfirmed: boolean,
    input: AttendanceInput | null,
    ignoring?: ClassGroupId,
  ): Promise<Attendance> {
    const attendance = attendanceFrom(target.details(), input);
    const current: CurrentEnrolment[] = [];
    for (const enrolment of await this.enrolments.activeForStudent(student, on)) {
      if (ignoring && enrolment.group.equals(ignoring)) continue;
      const group = await this.groups.find(enrolment.group);
      if (group !== null) current.push({ group, attendance: enrolment.attendance() });
    }
    const others = (await this.enrolments.activeInGroup(target.id, on)).filter((e) =>
      !e.student.equals(student)
    );
    new EnrolmentPolicy().assertCanEnrol(
      target,
      current,
      occupancyByDay(target.details(), others),
      attendance,
      overCapacityConfirmed,
    );
    return attendance;
  }

  async enrol(
    student: StudentReference,
    groupId: ClassGroupId,
    on: LocalDate,
    overCapacityConfirmed: boolean,
    input: AttendanceInput | null = null,
    ignoring?: ClassGroupId,
  ): Promise<void> {
    const target = await this.groups.find(groupId);
    if (target === null) throw new ClassGroupNotFound();
    const attendance = await this.check(
      student,
      target,
      on,
      overCapacityConfirmed,
      input,
      ignoring,
    );
    await this.enrolments.save(
      Enrolment.start(EnrolmentId.generate(), student, groupId, on, attendance),
    );
  }
}

/** Cambia el horario especial de un alumno en un grupo en el que ya está (o lo quita). */
export class ChangeAttendance {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly enrolments: EnrolmentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    studentId: string,
    groupId: string,
    input: AttendanceInput | null,
    confirmOverCapacity: boolean,
  ): Promise<void> {
    const student = StudentReference.fromString(studentId);
    const group = ClassGroupId.fromString(groupId);
    const today = LocalDate.fromInstant(this.clock.now());
    const enrolment = await this.enrolments.activeForStudentInGroup(student, group, today);
    if (enrolment === null) throw new NotEnrolled();
    const target = await this.groups.find(group);
    if (target === null) throw new ClassGroupNotFound();
    const attendance = await new Enrolling(this.groups, this.enrolments).check(
      student,
      target,
      today,
      confirmOverCapacity,
      input,
      group,
    );
    enrolment.changeAttendance(attendance);
    await this.enrolments.save(enrolment);
  }
}

export class EnrolStudent {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly enrolments: EnrolmentRepository,
    private readonly clock: Clock,
    private readonly joinDates: StudentJoinDates | null = null,
  ) {}

  /**
   * @param from inicio de la inscripción; por defecto hoy
   * @param attendance horario especial dentro del grupo; por defecto todo el grupo
   */
  async execute(
    studentId: string,
    groupId: string,
    confirmOverCapacity: boolean,
    from?: LocalDate,
    attendance: AttendanceInput | null = null,
  ): Promise<void> {
    const student = StudentReference.fromString(studentId);
    const today = LocalDate.fromInstant(this.clock.now());
    if (from !== undefined) await assertValidStart(this.joinDates, student, from, today);
    await new Enrolling(this.groups, this.enrolments).enrol(
      student,
      ClassGroupId.fromString(groupId),
      from ?? today,
      confirmOverCapacity,
      attendance,
    );
  }
}

/**
 * Corrige desde cuándo está un alumno en uno de sus grupos (p. ej. venía antes de que se le inscribiera): nunca en el
 * futuro, antes de su alta en el club ni pisando otra inscripción suya en ese grupo.
 */
export class ChangeEnrolmentStart {
  constructor(
    private readonly enrolments: EnrolmentRepository,
    private readonly joinDates: StudentJoinDates,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string, groupId: string, from: string): Promise<void> {
    const student = StudentReference.fromString(studentId);
    const group = ClassGroupId.fromString(groupId);
    const today = LocalDate.fromInstant(this.clock.now());
    const enrolment = await this.enrolments.activeForStudentInGroup(student, group, today);
    if (enrolment === null) throw new NotEnrolled();
    const start = LocalDate.fromString(from);
    await assertValidStart(this.joinDates, student, start, today);
    const clash = (await this.enrolments.ofStudentInGroup(student, group)).some((other) =>
      !other.id.equals(enrolment.id) && other.enrolledOn.isBefore(enrolment.enrolledOn) &&
      (other.endsOn() === null || start.isBefore(other.endsOn() as LocalDate))
    );
    if (clash) {
      throw new InvalidValue('from', 'Esa fecha pisa otra inscripción suya en este grupo.');
    }
    enrolment.startOn(start);
    await this.enrolments.save(enrolment);
  }
}

export class UnenrolStudent {
  constructor(
    private readonly enrolments: EnrolmentRepository,
    private readonly students: StudentStatus,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string, groupId: string): Promise<void> {
    const student = StudentReference.fromString(studentId);
    const today = LocalDate.fromInstant(this.clock.now());
    const enrolment = await this.enrolments.activeForStudentInGroup(
      student,
      ClassGroupId.fromString(groupId),
      today,
    );
    if (enrolment === null) throw new NotEnrolled();
    const isLastGroup = (await this.enrolments.activeForStudent(student, today)).length === 1;
    if (isLastGroup && (await this.students.isActive(student))) throw new LastEnrolment();
    enrolment.endOn(today);
    await this.enrolments.save(enrolment);
  }
}

export class MoveStudent {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly enrolments: EnrolmentRepository,
    private readonly clock: Clock,
    private readonly transactions: TransactionRunner,
  ) {}

  async execute(
    studentId: string,
    fromGroupId: string,
    toGroupId: string,
    confirmOverCapacity: boolean,
    attendance: AttendanceInput | null = null,
  ): Promise<void> {
    const student = StudentReference.fromString(studentId);
    const from = ClassGroupId.fromString(fromGroupId);
    const today = LocalDate.fromInstant(this.clock.now());
    await this.transactions.run(async () => {
      const current = await this.enrolments.activeForStudentInGroup(student, from, today);
      if (current === null) throw new NotEnrolled();
      await new Enrolling(this.groups, this.enrolments).enrol(
        student,
        ClassGroupId.fromString(toGroupId),
        today,
        confirmOverCapacity,
        attendance,
        from,
      );
      current.endOn(today);
      await this.enrolments.save(current);
    });
  }
}

/** Al dar de baja a un alumno, sus inscripciones terminan en la fecha de baja. */
export class EndStudentEnrolments {
  constructor(private readonly enrolments: EnrolmentRepository) {}

  async execute(studentId: string, on: LocalDate): Promise<void> {
    for (
      const enrolment of await this.enrolments.activeForStudent(
        StudentReference.fromString(studentId),
        on,
      )
    ) {
      enrolment.endOn(on);
      await this.enrolments.save(enrolment);
    }
  }
}

/** Tramo del horario tal como llega del exterior. */
export interface ScheduleBlockInput {
  day: string;
  start: string;
  end: string;
  classroom: string | null;
}

export interface ResolvedEnrolmentView {
  groupId: string;
  groupName: string;
  slotLabel: string;
  attendance: { days: string[]; start: string; end: string } | null;
  attendanceLabel: string | null;
}

export interface ScheduleResolutionView {
  enrolments: ResolvedEnrolmentView[];
  uncovered: { day: string; start: string; end: string; label: string }[];
  choices: {
    day: string;
    start: string;
    end: string;
    label: string;
    groups: { id: string; name: string; classroom: string }[];
  }[];
  problems: string[];
}

/** Traduce el horario que hará un alumno a grupos (completos o con horario especial), sin guardar nada. */
export class ResolveSchedule {
  constructor(private readonly groups: ClassGroupRepository) {}

  async execute(blocks: ScheduleBlockInput[]): Promise<ScheduleResolutionView> {
    const parsed = blocks.map((b) => ({
      day: weekdayFromName(b.day),
      start: HalfHour.fromString(b.start),
      end: HalfHour.fromString(b.end),
      classroom: b.classroom === null ? null : Classroom.fromString(b.classroom),
    }));
    const result = resolveSchedule(parsed, await this.groups.all());
    const label = (s: { day: Weekday; start: HalfHour; end: HalfHour }) =>
      `${weekdayShortLabel(s.day)} · ${s.start.toString()}–${s.end.toString()}`;
    return {
      enrolments: result.enrolments.map(({ group, attendance }) => {
        const d = group.details();
        const slot = attendance.slotIn(d);
        return {
          groupId: group.id.value,
          groupName: d.name.value,
          slotLabel: d.slot.label(),
          attendance: attendance.isFull() ? null : {
            days: slot.days.map(weekdayCode),
            start: slot.start.toString(),
            end: slot.end.toString(),
          },
          attendanceLabel: attendance.labelIn(d),
        };
      }),
      uncovered: result.uncovered.map((s) => ({
        day: weekdayCode(s.day),
        start: s.start.toString(),
        end: s.end.toString(),
        label: label(s),
      })),
      choices: result.choices.map((c) => ({
        day: weekdayCode(c.day),
        start: c.start.toString(),
        end: c.end.toString(),
        label: label(c),
        groups: c.groups.map((g) => ({
          id: g.id.value,
          name: g.details().name.value,
          classroom: g.details().classroom.code,
        })),
      })),
      problems: result.problems,
    };
  }
}
