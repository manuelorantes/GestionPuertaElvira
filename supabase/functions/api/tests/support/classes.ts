import type { LocalDate } from '../../src/domain/common/mod.ts';
import {
  Capacity,
  ClassGroup,
  ClassGroupId,
  Classroom,
  type Enrolment,
  GroupDetails,
  GroupName,
  HalfHour,
  type Level,
  type StudentReference,
  TeacherReference,
  type Weekday,
  WeeklySlot,
} from '../../src/domain/classes/mod.ts';
import type {
  ClassGroupRepository,
  EnrolmentRepository,
  TeacherDirectory,
} from '../../src/application/classes/mod.ts';
import type { TransactionRunner } from '../../src/application/common/mod.ts';

export class ImmediateTransactionRunner implements TransactionRunner {
  runs = 0;

  run<T>(work: () => Promise<T>): Promise<T> {
    this.runs++;
    return work();
  }
}

export interface GroupOptions {
  name?: string;
  days?: Weekday[];
  start?: string;
  end?: string;
  classroom?: number;
  capacity?: number;
  level?: Level;
  teacher?: TeacherReference;
}

export const GroupFactory = {
  details(options: GroupOptions = {}): GroupDetails {
    return new GroupDetails(
      GroupName.fromString(options.name ?? 'Iniciación A'),
      options.level ?? 'beginner',
      options.teacher ?? TeacherReference.generate(),
      WeeklySlot.of(
        options.days ?? [1, 3],
        HalfHour.fromString(options.start ?? '17:00'),
        HalfHour.fromString(options.end ?? '18:00'),
      ),
      Classroom.of(options.classroom ?? 1),
      Capacity.of(options.capacity ?? 12),
    );
  },
  group(options: GroupOptions = {}): ClassGroup {
    return ClassGroup.create(ClassGroupId.generate(), GroupFactory.details(options));
  },
};

export class InMemoryClassGroupRepository implements ClassGroupRepository {
  groups = new Map<string, ClassGroup>();

  find(id: ClassGroupId): Promise<ClassGroup | null> {
    return Promise.resolve(this.groups.get(id.value) ?? null);
  }

  all(): Promise<ClassGroup[]> {
    return Promise.resolve([...this.groups.values()]);
  }

  save(group: ClassGroup): Promise<void> {
    this.groups.set(group.id.value, group);
    return Promise.resolve();
  }
}

export class InMemoryEnrolmentRepository implements EnrolmentRepository {
  enrolments = new Map<string, Enrolment>();

  save(enrolment: Enrolment): Promise<void> {
    this.enrolments.set(enrolment.id.value, enrolment);
    return Promise.resolve();
  }

  activeForStudent(student: StudentReference, on: LocalDate): Promise<Enrolment[]> {
    return Promise.resolve(
      [...this.enrolments.values()].filter((e) => e.student.equals(student) && e.isActiveOn(on)),
    );
  }

  async activeForStudentInGroup(
    student: StudentReference,
    group: ClassGroupId,
    on: LocalDate,
  ): Promise<Enrolment | null> {
    return (await this.activeForStudent(student, on)).find((e) => e.group.equals(group)) ?? null;
  }

  activeCount(group: ClassGroupId, on: LocalDate): Promise<number> {
    return Promise.resolve(
      [...this.enrolments.values()].filter((e) => e.group.equals(group) && e.isActiveOn(on)).length,
    );
  }
}

export class FakeTeacherDirectory implements TeacherDirectory {
  active = new Map<string, boolean>();

  isActive(teacher: TeacherReference): Promise<boolean> {
    return Promise.resolve(this.active.get(teacher.value) ?? false);
  }
}
