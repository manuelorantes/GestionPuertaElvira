import { type Clock, type HasErrorDetails, LocalDate } from '../../domain/common/mod.ts';
import {
  Capacity,
  ClassGroup,
  ClassGroupId,
  Classroom,
  ClassroomSchedule,
  Enrolment,
  EnrolmentId,
  EnrolmentPolicy,
  GroupDetails,
  GroupName,
  HalfHour,
  levelFromName,
  StudentReference,
  TeacherReference,
  weekdayFromName,
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
  activeCount(group: ClassGroupId, on: LocalDate): Promise<number>;
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
  occupied: number;
  weeklyPlan: string;
}

export interface EnrolledStudent {
  id: string;
  fullName: string;
  age: number;
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

/** Inscribe a un alumno aplicando EnrolmentPolicy; compartido por EnrolStudent y MoveStudent. */
class Enrolling {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly enrolments: EnrolmentRepository,
  ) {}

  async enrol(
    student: StudentReference,
    groupId: ClassGroupId,
    on: LocalDate,
    overCapacityConfirmed: boolean,
    ignoring?: ClassGroupId,
  ): Promise<void> {
    const target = await this.groups.find(groupId);
    if (target === null) throw new ClassGroupNotFound();
    const studentGroups: ClassGroup[] = [];
    for (const enrolment of await this.enrolments.activeForStudent(student, on)) {
      const group = await this.groups.find(enrolment.group);
      if (group !== null && !(ignoring && group.id.equals(ignoring))) studentGroups.push(group);
    }
    const occupied = await this.enrolments.activeCount(groupId, on);
    new EnrolmentPolicy().assertCanEnrol(target, studentGroups, occupied, overCapacityConfirmed);
    await this.enrolments.save(Enrolment.start(EnrolmentId.generate(), student, groupId, on));
  }
}

export class EnrolStudent {
  constructor(
    private readonly groups: ClassGroupRepository,
    private readonly enrolments: EnrolmentRepository,
    private readonly clock: Clock,
  ) {}

  /** @param from inicio de la inscripción; por defecto hoy */
  async execute(
    studentId: string,
    groupId: string,
    confirmOverCapacity: boolean,
    from?: LocalDate,
  ): Promise<void> {
    await new Enrolling(this.groups, this.enrolments).enrol(
      StudentReference.fromString(studentId),
      ClassGroupId.fromString(groupId),
      from ?? LocalDate.fromInstant(this.clock.now()),
      confirmOverCapacity,
    );
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
