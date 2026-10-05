import { EmailAddress, FullName, LocalDate, PhoneNumber } from '../../src/domain/common/mod.ts';
import {
  FederationLicence,
  Guardian,
  type Student,
  StudentDetails,
  type StudentId,
} from '../../src/domain/students/mod.ts';
import type { Teacher, TeacherId } from '../../src/domain/teachers/mod.ts';
import type { Enrolments, StudentRepository } from '../../src/application/students/mod.ts';
import type { TeacherRepository } from '../../src/application/teachers/mod.ts';

export const StudentFactory = {
  details(options: {
    name?: string;
    birthDate?: string;
    guardians?: Guardian[];
    ownPhone?: string;
    licence?: string;
    imageConsent?: boolean;
  } = {}): StudentDetails {
    return new StudentDetails(
      FullName.fromString(options.name ?? 'Martina López Herrera'),
      LocalDate.fromString(options.birthDate ?? '2014-03-12'),
      null,
      EmailAddress.fromString('familia@ejemplo.com'),
      options.guardians ??
        [new Guardian(FullName.fromString('Rocío Herrera'), PhoneNumber.fromString('612481930'))],
      options.ownPhone ? PhoneNumber.fromString(options.ownPhone) : null,
      options.licence ? FederationLicence.fromString(options.licence) : null,
      options.imageConsent ?? true,
    );
  },
};

export class InMemoryStudentRepository implements StudentRepository {
  students = new Map<string, Student>();

  find(id: StudentId): Promise<Student | null> {
    return Promise.resolve(this.students.get(id.value) ?? null);
  }

  save(student: Student): Promise<void> {
    this.students.set(student.id.value, student);
    return Promise.resolve();
  }
}

export class SpyEnrolments implements Enrolments {
  enrolled: { student: string; groups: string[]; confirmed: boolean }[] = [];
  ended: { student: string; on: string }[] = [];
  failWith: Error | null = null;

  enrol(student: StudentId, groupIds: string[], confirmOverCapacity: boolean): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.enrolled.push({
      student: student.value,
      groups: groupIds,
      confirmed: confirmOverCapacity,
    });
    return Promise.resolve();
  }

  endAll(student: StudentId, on: LocalDate): Promise<void> {
    this.ended.push({ student: student.value, on: on.toString() });
    return Promise.resolve();
  }
}

export class InMemoryTeacherRepository implements TeacherRepository {
  teachers = new Map<string, Teacher>();

  find(id: TeacherId): Promise<Teacher | null> {
    return Promise.resolve(this.teachers.get(id.value) ?? null);
  }

  save(teacher: Teacher): Promise<void> {
    this.teachers.set(teacher.id.value, teacher);
    return Promise.resolve();
  }
}
