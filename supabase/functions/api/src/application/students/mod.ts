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
  type MissingDatum,
  NationalId,
  Student,
  StudentDetails,
  StudentId,
} from '../../domain/students/mod.ts';
import type { TransactionRunner } from '../common/mod.ts';

export interface StudentRepository {
  find(id: StudentId): Promise<Student | null>;
  save(student: Student): Promise<void>; /** Alumnos con alta vigente ese día, por nombre. */
  activeOn(day: LocalDate): Promise<Student[]>;
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

/** `no_classes`: socios activos sin ningún grupo (pagan la cuota de socio, se podrán inscribir más adelante). */
export type StudentFilter = 'all' | 'active' | 'withdrawn' | 'siblings' | 'no_classes';

export function studentFilterFrom(value: string): StudentFilter {
  if (!['all', 'active', 'withdrawn', 'siblings', 'no_classes'].includes(value)) {
    throw new InvalidValue('filter', 'Filtro desconocido.');
  }
  return value as StudentFilter;
}

export interface StudentGroup {
  id: string;
  name: string;
  slotLabel: string;
  teacherName: string;
  classroom: string;
  /** Horario especial del alumno en el grupo, o null si va a todo el grupo. */
  attendance: { days: string[]; start: string; end: string } | null;
  /** «Lun · 18:30–19:00», o null si va a todo el grupo. */
  attendanceLabel: string | null;
}

export interface StudentSummary {
  id: string;
  fullName: string;
  /** null si no consta la fecha de nacimiento. */
  age: number | null;
  status: string;
  groups: { id: string; name: string; slotLabel: string }[];
  hasSiblings: boolean;
}

export interface StudentDetail {
  id: string;
  fullName: string;
  birthDate: string | null;
  age: number | null;
  nationalId: string | null;
  contactEmail: string | null;
  guardians: { name: string; phone: string | null }[];
  /** Datos esperados que faltan (ver Datos pendientes). */
  missingData: MissingDatum[];
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
  /** Opcional: null si no se sabe. */
  birthDate: string | null;
  nationalId: string | null;
  contactEmail: string | null;
  guardians: { name: string; phone: string | null }[];
  ownPhone: string | null;
  federationLicence: string | null;
  imageConsent: boolean;
}

export function studentDetails(input: StudentInput): StudentDetails {
  let birthDate: LocalDate | null = null;
  if (input.birthDate !== null && input.birthDate.trim() !== '') {
    try {
      birthDate = LocalDate.fromString(input.birthDate);
    } catch (error) {
      if (error instanceof InvalidValue) {
        throw new InvalidValue('birthDate', 'La fecha de nacimiento no es válida.');
      }
      throw error;
    }
  }
  return new StudentDetails(
    FullName.fromString(input.fullName),
    birthDate,
    input.nationalId === null ? null : NationalId.fromString(input.nationalId),
    input.contactEmail === null ? null : EmailAddress.fromString(input.contactEmail),
    input.guardians.map((g) =>
      new Guardian(
        FullName.fromString(g.name),
        g.phone === null || g.phone.trim() === '' ? null : PhoneNumber.fromString(g.phone),
      )
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

/** Cobros da de alta como socio a quien entra en el club sin clases: se le pedirá la cuota de socio. */
export interface Membership {
  makeMember(student: StudentId): Promise<void>;
}

export class RegisterStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly enrolments: Enrolments,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    private readonly membership: Membership | null = null,
  ) {}

  /**
   * Alta del alumno, inscripción en sus grupos y vínculo con sus hermanos, todo o nada.
   * Sin grupos, el alumno es un socio sin clases y queda marcado como socio.
   * @param joinedOn fecha de alta; por defecto hoy (una importación puede traer altas anteriores)
   */
  async execute(
    input: StudentInput,
    groupIds: string[],
    siblingIds: string[],
    confirmOverCapacity: boolean,
    joinedOn?: string | null,
  ): Promise<string> {
    const today = LocalDate.fromInstant(this.clock.now());
    const joined = joinedOn ? LocalDate.fromString(joinedOn) : today;
    if (today.isBefore(joined)) {
      throw new InvalidValue('joinedOn', 'La fecha de alta no puede ser futura.');
    }
    const student = Student.register(StudentId.generate(), studentDetails(input), today, joined);
    return await this.transactions.run(async () => {
      await this.students.save(student);
      if (groupIds.length > 0) {
        await this.enrolments.enrol(student.id, groupIds, confirmOverCapacity, joined);
      } else if (this.membership !== null) {
        await this.membership.makeMember(student.id);
      }
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

export interface PendingStudent {
  id: string;
  fullName: string;
  missing: MissingDatum[];
}

/** Alumnos activos a los que les falta algún dato esperado, con qué falta. */
export class ListPendingData {
  constructor(
    private readonly students: StudentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PendingStudent[]> {
    const today = LocalDate.fromInstant(this.clock.now());
    const pending: PendingStudent[] = [];
    for (const student of await this.students.activeOn(today)) {
      const missing = student.details().missingData(today);
      if (missing.length > 0) {
        pending.push({ id: student.id.value, fullName: student.details().fullName.value, missing });
      }
    }
    return pending;
  }
}
