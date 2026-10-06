import {
  HalfHour,
  weekdayCode,
  weekdayFromName,
  weekdayFromNumber,
  WeeklySlot,
} from '../../domain/classes/mod.ts';
import { EmailAddress, FullName, LocalDate, PhoneNumber } from '../../domain/common/mod.ts';
import {
  FederationLicence,
  Guardian,
  NationalId,
  Student,
  StudentDetails,
  StudentId,
} from '../../domain/students/mod.ts';
import type { ClassQuery, GroupSummary } from '../../application/classes/mod.ts';
import type {
  StudentDetail,
  StudentFilter,
  StudentGroup,
  StudentQuery,
  StudentRepository,
  StudentSummary,
} from '../../application/students/mod.ts';
import type { MemberNumbers } from '../../application/students/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Texto normalizado para búsquedas: minúsculas y sin tildes («López» → «lopez»). */
export function searchText(text: string): string {
  return text.trim().toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '');
}

function guardians(row: Row): { name: string; phone: string | null }[] {
  const value = row.json('guardians');
  return Array.isArray(value)
    ? (value as { name: string; phone?: string | null }[]).map((g) => ({
      name: g.name,
      phone: g.phone ?? null,
    }))
    : [];
}

function age(row: Row, on: LocalDate): number | null {
  const birth = row.nullableString('birth_date');
  return birth === null ? null : LocalDate.fromString(birth).ageOn(on);
}

/** Horario especial de una inscripción, completado con el del grupo; null si va a todo el grupo. */
function specialAttendance(
  row: Row,
  group: GroupSummary,
): { days: string[]; start: string; end: string } | null {
  const days = row.json('attendance_days');
  const start = row.nullableInt('attendance_start_minutes');
  const end = row.nullableInt('attendance_end_minutes');
  if (!Array.isArray(days) && start === null && end === null) return null;
  return {
    days: Array.isArray(days)
      ? (days as number[]).map((d) => weekdayCode(weekdayFromNumber(d)))
      : [...group.days],
    start: start === null ? group.start : HalfHour.fromMinutes(start).toString(),
    end: end === null ? group.end : HalfHour.fromMinutes(end).toString(),
  };
}

function toStudent(row: Row): Student {
  const nationalId = row.nullableString('national_id');
  const contactEmail = row.nullableString('contact_email');
  const ownPhone = row.nullableString('own_phone');
  const licence = row.nullableString('federation_licence');
  const withdrawnOn = row.nullableString('withdrawn_on');
  const birthDate = row.nullableString('birth_date');
  return Student.restore(
    StudentId.fromString(row.string('id')),
    new StudentDetails(
      FullName.fromString(row.string('full_name')),
      birthDate === null ? null : LocalDate.fromString(birthDate),
      nationalId === null ? null : NationalId.fromString(nationalId),
      contactEmail === null ? null : EmailAddress.fromString(contactEmail),
      guardians(row).map((g) =>
        new Guardian(
          FullName.fromString(g.name),
          g.phone === null ? null : PhoneNumber.fromString(g.phone),
        )
      ),
      ownPhone === null ? null : PhoneNumber.fromString(ownPhone),
      licence === null ? null : FederationLicence.fromString(licence),
      row.bool('image_consent'),
    ),
    LocalDate.fromString(row.string('joined_on')),
    withdrawnOn === null ? null : LocalDate.fromString(withdrawnOn),
    row.stringList('sibling_ids').map((id) => StudentId.fromString(id)),
  );
}

export class SqlStudentRepository implements StudentRepository {
  constructor(private readonly sql: Sql) {}

  async find(id: StudentId): Promise<Student | null> {
    const rows = await this.sql`SELECT * FROM students_student WHERE id = ${id.value}`;
    return rows[0] ? toStudent(new Row(rows[0])) : null;
  }

  async activeOn(day: LocalDate): Promise<Student[]> {
    const rows = await this.sql`SELECT * FROM students_student
      WHERE withdrawn_on IS NULL OR withdrawn_on > ${day.toString()} ORDER BY search_name`;
    return Row.all(rows).map(toStudent);
  }

  async save(student: Student): Promise<void> {
    const d = student.details();
    const record = {
      id: student.id.value,
      full_name: d.fullName.value,
      search_name: searchText(d.fullName.value),
      birth_date: d.birthDate?.toString() ?? null,
      national_id: d.nationalId?.value ?? null,
      contact_email: d.contactEmail?.value ?? null,
      // Columnas json: postgres.js serializa arrays y objetos (una cadena quedaría codificada dos veces).
      guardians: d.guardians.map((g) => ({ name: g.name.value, phone: g.phone?.value ?? null })),
      own_phone: d.ownPhone?.value ?? null,
      federation_licence: d.federationLicence?.value ?? null,
      image_consent: d.imageConsent,
      joined_on: student.joinedOn.toString(),
      withdrawn_on: student.withdrawnOn()?.toString() ?? null,
      sibling_ids: student.siblings().map((s) => s.value),
    };
    // Primero UPDATE: un INSERT … ON CONFLICT evaluaría el DEFAULT del número de socio y gastaría uno.
    const updated = await this.sql`UPDATE students_student SET ${
      this.sql(
        record,
        'full_name',
        'search_name',
        'birth_date',
        'national_id',
        'contact_email',
        'guardians',
        'own_phone',
        'federation_licence',
        'image_consent',
        'withdrawn_on',
        'sibling_ids',
      )
    } WHERE id = ${record.id}`;
    if (updated.count === 0) await this.sql`INSERT INTO students_student ${this.sql(record)}`;
  }
}

/** Números de socio: la secuencia de la base de datos los da en orden y nunca reutiliza uno. */
export class SqlMemberNumbers implements MemberNumbers {
  constructor(private readonly sql: Sql) {}

  async of(studentIds: string[]): Promise<Map<string, number>> {
    if (studentIds.length === 0) return new Map();
    const rows = await this.sql`SELECT id, member_number FROM students_student
      WHERE id::text IN ${this.sql(studentIds)}`;
    return new Map(Row.all(rows).map((r) => [r.string('id'), r.int('member_number')]));
  }

  async assign(changes: Map<string, number>): Promise<void> {
    if (changes.size === 0) return;
    // La unicidad se comprueba al confirmar la transacción: los intercambios no chocan a mitad.
    await this.sql`SET CONSTRAINTS students_student_member_number_key DEFERRED`;
    for (const [id, number] of changes) {
      await this.sql`UPDATE students_student SET member_number = ${number} WHERE id = ${id}`;
    }
  }
}

/** Lecturas de Alumnado: lista con filtros y búsqueda sin tildes, y ficha con grupos y hermanos. */
export class SqlStudentQuery implements StudentQuery {
  constructor(
    private readonly sql: Sql,
    private readonly classes: ClassQuery,
  ) {}

  async list(
    filter: StudentFilter,
    search: string | null,
    on: LocalDate,
  ): Promise<StudentSummary[]> {
    const day = on.toString();
    const byFilter = {
      all: this.sql``,
      active: this.sql`AND (s.withdrawn_on IS NULL OR s.withdrawn_on > ${day})`,
      withdrawn: this.sql`AND s.withdrawn_on IS NOT NULL AND s.withdrawn_on <= ${day}`,
      siblings: this.sql`AND s.sibling_ids::jsonb <> '[]'::jsonb`,
      no_classes: this.sql`AND (s.withdrawn_on IS NULL OR s.withdrawn_on > ${day})
        AND NOT EXISTS (SELECT 1 FROM classes_enrolment e WHERE e.student_id = s.id
          AND e.enrolled_on <= ${day} AND (e.ends_on IS NULL OR e.ends_on > ${day}))`,
    }[filter];
    const term = search?.trim() ?? '';
    // Un número busca también por número de socio («12» o «#12»).
    const asNumber = /^#?\d{1,9}$/.test(term) ? Number(term.replace('#', '')) : null;
    const bySearch = term === ''
      ? this.sql``
      : asNumber !== null
      ? this.sql`AND (s.member_number = ${asNumber} OR s.search_name LIKE ${`%${
        searchText(term)
      }%`})`
      : this.sql`AND s.search_name LIKE ${`%${searchText(term)}%`}`;
    const rows = await this.sql`
      SELECT s.id, s.member_number, s.full_name, s.birth_date, s.withdrawn_on, s.sibling_ids
        FROM students_student s WHERE 1 = 1 ${byFilter} ${bySearch} ORDER BY s.search_name`;
    const groupsByStudent = await this.activeGroupsByStudent(on);
    return Row.all(rows).map((row) => ({
      id: row.string('id'),
      memberNumber: row.int('member_number'),
      fullName: row.string('full_name'),
      age: age(row, on),
      status: status(row.nullableString('withdrawn_on'), on),
      groups: (groupsByStudent.get(row.string('id')) ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        slotLabel: g.slotLabel,
      })),
      hasSiblings: row.stringList('sibling_ids').length > 0,
    }));
  }

  async total(): Promise<number> {
    const rows = await this.sql`SELECT COUNT(*) AS total FROM students_student`;
    return rows[0] ? new Row(rows[0]).int('total') : 0;
  }

  async detail(id: string, on: LocalDate): Promise<StudentDetail | null> {
    const rows = await this.sql`SELECT * FROM students_student WHERE id = ${id}`;
    if (!rows[0]) return null;
    const row = new Row(rows[0]);
    const siblingIds = row.stringList('sibling_ids');
    const siblings = siblingIds.length === 0 ? [] : Row.all(
      await this.sql`SELECT id, full_name FROM students_student WHERE id IN ${
        this.sql(siblingIds)
      } ORDER BY search_name`,
    );
    return {
      id,
      memberNumber: row.int('member_number'),
      fullName: row.string('full_name'),
      birthDate: row.nullableString('birth_date'),
      age: age(row, on),
      nationalId: row.nullableString('national_id'),
      contactEmail: row.nullableString('contact_email'),
      guardians: guardians(row),
      missingData: toStudent(row).details().missingData(on),
      ownPhone: row.nullableString('own_phone'),
      federationLicence: row.nullableString('federation_licence'),
      imageConsent: row.bool('image_consent'),
      joinedOn: row.string('joined_on'),
      withdrawnOn: row.nullableString('withdrawn_on'),
      status: status(row.nullableString('withdrawn_on'), on),
      groups: (await this.activeGroupsByStudent(on, id)).get(id) ?? [],
      siblings: siblings.map((s) => ({ id: s.string('id'), fullName: s.string('full_name') })),
    };
  }

  private async activeGroupsByStudent(
    on: LocalDate,
    studentId?: string,
  ): Promise<Map<string, StudentGroup[]>> {
    const groups = new Map((await this.classes.groups(on)).map((g) => [g.id, g]));
    const day = on.toString();
    const forStudent = studentId ? this.sql`AND student_id = ${studentId}` : this.sql``;
    // Orden estable: primero el grupo en el que se inscribió antes (el id es UUIDv7, ordenado por tiempo).
    const rows = await this.sql`SELECT student_id, class_group_id,
             attendance_days, attendance_start_minutes, attendance_end_minutes
        FROM classes_enrolment
      WHERE enrolled_on <= ${day} AND (ends_on IS NULL OR ends_on > ${day}) ${forStudent}
      ORDER BY enrolled_on, id`;
    const byStudent = new Map<string, StudentGroup[]>();
    for (const row of Row.all(rows)) {
      const group = groups.get(row.string('class_group_id'));
      if (!group) continue;
      const list = byStudent.get(row.string('student_id')) ?? [];
      const attendance = specialAttendance(row, group);
      list.push({
        id: group.id,
        name: group.name,
        slotLabel: group.slotLabel,
        teacherName: group.teacherName,
        classroom: group.classroom,
        attendance,
        attendanceLabel: attendance === null ? null : WeeklySlot.of(
          attendance.days.map(weekdayFromName),
          HalfHour.fromString(attendance.start),
          HalfHour.fromString(attendance.end),
        ).label(),
      });
      byStudent.set(row.string('student_id'), list);
    }
    return byStudent;
  }
}

function status(withdrawnOn: string | null, on: LocalDate): string {
  return withdrawnOn !== null && !on.isBefore(LocalDate.fromString(withdrawnOn))
    ? 'withdrawn'
    : 'active';
}
