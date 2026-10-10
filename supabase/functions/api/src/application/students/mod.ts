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
  MemberRenumbering,
  type MissingDatum,
  NationalId,
  shareNameAndFirstSurname,
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
/** Inscripción pedida al dar de alta: el grupo y, si lo hay, el horario especial dentro de él. */
export interface EnrolmentRequest {
  groupId: string;
  attendance: { days: string[] | null; start: string | null; end: string | null } | null;
}

export interface Enrolments {
  enrol(
    student: StudentId,
    requests: EnrolmentRequest[],
    confirmOverCapacity: boolean,
    from?: LocalDate,
  ): Promise<void>;
  endAll(student: StudentId, on: LocalDate): Promise<void>;
  /** Inicio de sus inscripciones que seguían vigentes ese día o empezaron después. */
  currentStarts(student: StudentId, since: LocalDate): Promise<LocalDate[]>;
  /** Las inscripciones que empezaban un día pasan a empezar otro (al corregir su alta). */
  moveStarts(student: StudentId, from: LocalDate, to: LocalDate): Promise<void>;
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
  /** Desde cuándo está en el grupo. */
  since: string;
}

export interface StudentSummary {
  id: string;
  /** Número de socio: único, en orden de alta y nunca reutilizado. */
  memberNumber: number;
  fullName: string;
  /** null si no consta la fecha de nacimiento. */
  age: number | null;
  status: string;
  /** Su última baja (pasada o futura), o null si no tiene. */
  withdrawnOn: string | null;
  groups: { id: string; name: string; slotLabel: string }[];
  hasSiblings: boolean;
}

export interface StudentDetail {
  id: string;
  memberNumber: number;
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
  /** Su última alta y su última baja (el periodo actual). */
  joinedOn: string;
  withdrawnOn: string | null;
  status: string;
  /** Todos sus periodos de alta, del más antiguo al actual. */
  membership: { joinedOn: string; withdrawnOn: string | null }[];
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

/** Cobros da de alta como socio a toda persona que entra en el club: se le pedirá la cuota de socio. */
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
   * Toda persona que se da de alta es socia (con grupos o, sin ellos, como socio sin clases).
   * @param joinedOn fecha de alta; por defecto hoy (una importación puede traer altas anteriores)
   */
  async execute(
    input: StudentInput,
    enrolments: EnrolmentRequest[],
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
      if (enrolments.length > 0) {
        await this.enrolments.enrol(student.id, enrolments, confirmOverCapacity, joined);
      }
      await this.membership?.makeMember(student.id);
      for (const siblingId of siblingIds) {
        await Siblings.link(this.students, student.id.value, siblingId);
      }
      return student.id.value;
    });
  }
}

/** Números de socio (los asigna la persistencia al dar de alta, sin reutilizar nunca uno). */
export interface MemberNumbers {
  /** Número actual de cada alumno indicado que exista. */
  of(studentIds: string[]): Promise<Map<string, number>>;
  /** Aplica los cambios a la vez (los intercambios no chocan entre sí). */
  assign(changes: Map<string, number>): Promise<void>;
}

/** Reparte de otra forma los números de socio que ya tienen unos alumnos (p. ej. para cuadrar con el listado del club). */
export class RenumberMembers {
  constructor(private readonly numbers: MemberNumbers) {}

  async execute(assignments: { studentId: string; memberNumber: number }[]): Promise<void> {
    const wanted = new Map<string, number>();
    for (const a of assignments) {
      if (wanted.has(a.studentId)) {
        throw new InvalidValue('assignments', 'Hay un alumno repetido.');
      }
      wanted.set(a.studentId, a.memberNumber);
    }
    const current = await this.numbers.of([...wanted.keys()]);
    const renumbering = MemberRenumbering.of(current, wanted);
    await this.numbers.assign(renumbering.changes());
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

/**
 * Vuelve a dar de alta a un alumno de baja, desde un día (hasta hoy): conserva su número de socio, su familia y su
 * historial, y entra en los grupos indicados desde ese día o, sin grupos, como socio sin clases. Siempre queda como socio.
 */
export class RejoinStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly enrolments: Enrolments,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    private readonly membership: Membership | null = null,
  ) {}

  async execute(
    id: string,
    date: string,
    requests: EnrolmentRequest[],
    confirmOverCapacity: boolean,
  ): Promise<void> {
    const student = await lookUp(this.students, id);
    const on = LocalDate.fromString(date);
    student.rejoin(on, LocalDate.fromInstant(this.clock.now()));
    await this.transactions.run(async () => {
      await this.students.save(student);
      if (requests.length > 0) {
        await this.enrolments.enrol(student.id, requests, confirmOverCapacity, on);
      }
      await this.membership?.makeMember(student.id);
    });
  }
}

/**
 * Corrige su última alta. Los grupos que empezaban ese mismo día se mueven con ella; ninguno de sus grupos actuales puede
 * empezar antes (hay que cambiar antes su «En el grupo desde»).
 */
export class ChangeJoinDate {
  constructor(
    private readonly students: StudentRepository,
    private readonly enrolments: Enrolments,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, date: string): Promise<void> {
    const student = await lookUp(this.students, id);
    const previous = student.joinedOn;
    const on = LocalDate.fromString(date);
    const others = (await this.enrolments.currentStarts(student.id, previous)).filter((d) =>
      !d.equals(previous)
    );
    if (others.some((start) => start.isBefore(on))) {
      throw new InvalidValue(
        'joinedOn',
        'Tiene un grupo desde antes de esa fecha: cambia antes desde cuándo está en él.',
      );
    }
    student.changeJoinedOn(on, LocalDate.fromInstant(this.clock.now()));
    await this.students.save(student);
    await this.enrolments.moveStarts(student.id, previous, on);
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

/**
 * Alumnos que pueden ser el mismo que se va a dar de alta (mismo nombre y primer apellido): primero los de baja, para
 * darles de alta de nuevo en vez de duplicarlos, y luego los de alta.
 */
export class SimilarStudents {
  constructor(
    private readonly query: StudentQuery,
    private readonly clock: Clock,
  ) {}

  async execute(fullName: string): Promise<StudentSummary[]> {
    const firstWord = fullName.trim().split(/\s+/)[0] ?? '';
    if (firstWord === '' || !fullName.trim().includes(' ')) return [];
    const candidates = await this.query.list(
      'all',
      firstWord,
      LocalDate.fromInstant(this.clock.now()),
    );
    return candidates
      .filter((s) => shareNameAndFirstSurname(s.fullName, fullName))
      .sort((a, b) => Number(a.status !== 'withdrawn') - Number(b.status !== 'withdrawn'));
  }
}
