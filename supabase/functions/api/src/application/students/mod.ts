import {
  type Clock,
  EmailAddress,
  FullName,
  InvalidValue,
  LocalDate,
  PhoneNumber,
} from '../../domain/common/mod.ts';
import {
  FederationLicence,
  Guardian,
  NationalId,
  Student,
  StudentDetails,
  StudentId,
} from '../../domain/students/mod.ts';
import type { TransactionRunner } from '../common/mod.ts';

export interface StudentRepository {
  find(id: StudentId): Promise<Student | null>;
  save(student: Student): Promise<void>;
}

/** Inscripciones del alumno en grupos (las gestiona el contexto de Clases). */
export interface Enrolments {
  enrol(
    student: StudentId,
    groupIds: string[],
    confirmOverCapacity: boolean,
    from?: LocalDate,
  ): Promise<void>;
  endAll(student: StudentId, on: LocalDate): Promise<void>;
}

export type StudentFilter = 'all' | 'active' | 'withdrawn' | 'siblings';

export function studentFilterFrom(value: string): StudentFilter {
  if (!['all', 'active', 'withdrawn', 'siblings'].includes(value)) {
    throw new InvalidValue('filter', 'Filtro desconocido.');
  }
  return value as StudentFilter;
}

export interface StudentGroup {
  id: string;
  name: string;
  slotLabel: string;
  teacherName: string;
  classroom: number;
}

export interface StudentSummary {
  id: string;
  fullName: string;
  age: number;
  status: string;
  groups: { id: string; name: string; slotLabel: string }[];
  hasSiblings: boolean;
}

export interface StudentDetail {
  id: string;
  fullName: string;
  birthDate: string;
  age: number;
  nationalId: string | null;
  contactEmail: string | null;
  guardians: { name: string; phone: string }[];
  ownPhone: string | null;
  federationLicence: string | null;
  imageConsent: boolean;
  joinedOn: string;
  withdrawnOn: string | null;
  status: string;
  groups: StudentGroup[];
  siblings: { id: string; fullName: string }[];
}

export interface StudentQuery {
  /** Ordenados por nombre. */
  list(filter: StudentFilter, search: string | null, on: LocalDate): Promise<StudentSummary[]>;
  total(): Promise<number>;
  detail(id: string, on: LocalDate): Promise<StudentDetail | null>;
}

export class StudentNotFound extends Error {
  constructor() {
    super('No existe ese alumno.');
    this.name = 'StudentNotFound';
  }
}

/** Datos personales de un alumno tal y como llegan del exterior; `studentDetails()` los valida. */
export interface StudentInput {
  fullName: string;
  birthDate: string;
  nationalId: string | null;
  contactEmail: string | null;
  guardians: { name: string; phone: string }[];
  ownPhone: string | null;
  federationLicence: string | null;
  imageConsent: boolean;
}

export function studentDetails(input: StudentInput): StudentDetails {
  let birthDate: LocalDate;
  try {
    birthDate = LocalDate.fromString(input.birthDate);
  } catch (error) {
    if (error instanceof InvalidValue) {
      throw new InvalidValue('birthDate', 'La fecha de nacimiento no es válida.');
    }
    throw error;
  }
  return new StudentDetails(
    FullName.fromString(input.fullName),
    birthDate,
    input.nationalId === null ? null : NationalId.fromString(input.nationalId),
    input.contactEmail === null ? null : EmailAddress.fromString(input.contactEmail),
    input.guardians.map((g) =>
      new Guardian(FullName.fromString(g.name), PhoneNumber.fromString(g.phone))
    ),
    input.ownPhone === null ? null : PhoneNumber.fromString(input.ownPhone),
    input.federationLicence === null ? null : FederationLicence.fromString(input.federationLicence),
    input.imageConsent,
  );
}

async function lookUp(students: StudentRepository, id: string): Promise<Student> {
  const student = await students.find(StudentId.fromString(id));
  if (student === null) throw new StudentNotFound();
  return student;
}

/** La relación de hermanos es mutua: se actualizan siempre los dos alumnos. */
export const Siblings = {
  async link(students: StudentRepository, a: string, b: string): Promise<void> {
    const first = await lookUp(students, a);
    const second = await lookUp(students, b);
    first.addSibling(second.id);
    second.addSibling(first.id);
    await students.save(first);
    await students.save(second);
  },
  async unlink(students: StudentRepository, a: string, b: string): Promise<void> {
    const first = await lookUp(students, a);
    const second = await lookUp(students, b);
    first.removeSibling(second.id);
    second.removeSibling(first.id);
    await students.save(first);
    await students.save(second);
  },
};

export class RegisterStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly enrolments: Enrolments,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /**
   * Alta del alumno, inscripción en sus grupos y vínculo con sus hermanos, todo o nada.
   * @param joinedOn fecha de alta; por defecto hoy (una importación puede traer altas anteriores)
   */
  async execute(
    input: StudentInput,
    groupIds: string[],
    siblingIds: string[],
    confirmOverCapacity: boolean,
    joinedOn?: string | null,
  ): Promise<string> {
    if (groupIds.length === 0) throw new InvalidValue('groupIds', 'Elige al menos un grupo.');
    const today = LocalDate.fromInstant(this.clock.now());
    const joined = joinedOn ? LocalDate.fromString(joinedOn) : today;
    if (today.isBefore(joined)) {
      throw new InvalidValue('joinedOn', 'La fecha de alta no puede ser futura.');
    }
    const student = Student.register(StudentId.generate(), studentDetails(input), today, joined);
    return await this.transactions.run(async () => {
      await this.students.save(student);
      await this.enrolments.enrol(student.id, groupIds, confirmOverCapacity, joined);
      for (const siblingId of siblingIds) {
        await Siblings.link(this.students, student.id.value, siblingId);
      }
      return student.id.value;
    });
  }
}

export class UpdateStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, input: StudentInput): Promise<void> {
    const student = await lookUp(this.students, id);
    student.updateDetails(studentDetails(input), LocalDate.fromInstant(this.clock.now()));
    await this.students.save(student);
  }
}

export class WithdrawStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly enrolments: Enrolments,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /** Baja en una fecha (hoy o futura): desde ese día deja de ocupar plaza en todos sus grupos. */
  async execute(id: string, date: string): Promise<void> {
    const student = await lookUp(this.students, id);
    const on = LocalDate.fromString(date);
    student.withdraw(on, LocalDate.fromInstant(this.clock.now()));
    await this.transactions.run(async () => {
      await this.students.save(student);
      await this.enrolments.endAll(student.id, on);
    });
  }
}

export class LinkSiblings {
  constructor(
    private readonly students: StudentRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  execute(studentId: string, siblingId: string): Promise<void> {
    return this.transactions.run(() => Siblings.link(this.students, studentId, siblingId));
  }
}

export class UnlinkSiblings {
  constructor(
    private readonly students: StudentRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  execute(studentId: string, siblingId: string): Promise<void> {
    return this.transactions.run(() => Siblings.unlink(this.students, studentId, siblingId));
  }
}
