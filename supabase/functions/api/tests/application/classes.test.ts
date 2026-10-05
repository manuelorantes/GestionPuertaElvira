import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  type ClassGroup,
  ClassGroupId,
  GroupFull,
  StudentReference,
  StudentScheduleOverlap,
  TeacherReference,
  type Weekday,
} from '../../src/domain/classes/mod.ts';
import {
  ClassGroupNotFound,
  ClassroomConflict,
  CreateClassGroup,
  EndStudentEnrolments,
  EnrolStudent,
  type GroupInput,
  LastEnrolment,
  MoveStudent,
  NotEnrolled,
  TeacherNotAvailable,
  UnenrolStudent,
  UpdateClassGroup,
} from '../../src/application/classes/mod.ts';
import {
  FakeTeacherDirectory,
  GroupFactory,
  ImmediateTransactionRunner,
  InMemoryClassGroupRepository,
  InMemoryEnrolmentRepository,
} from '../support/classes.ts';
import { FrozenClock } from '../support/identity.ts';

function management() {
  const groups = new InMemoryClassGroupRepository();
  const teachers = new FakeTeacherDirectory();
  const teacherId = TeacherReference.generate().value;
  teachers.active.set(teacherId, true);
  const input = (overrides: Partial<GroupInput> = {}): GroupInput => ({
    name: 'Iniciación A',
    level: 'beginner',
    teacherId,
    days: ['mon', 'wed'],
    start: '17:00',
    end: '18:00',
    classroom: 1,
    capacity: 12,
    ...overrides,
  });
  const create = (i: GroupInput) => new CreateClassGroup(groups, teachers).execute(i);
  return { groups, teachers, teacherId, input, create };
}

Deno.test('CreateClassGroup should create a group from raw input', async () => {
  const { groups, input, create } = management();
  const id = await create(input());
  const group = await groups.find(ClassGroupId.fromString(id));
  assertEquals(group?.details().name.value, 'Iniciación A');
  assertEquals(group?.details().weeklyPlan(), 'two_hours');
});

Deno.test('CreateClassGroup should reject a classroom clash naming the other group, but allow the other classroom', async () => {
  const { groups, input, create } = management();
  await create(input({ name: 'Intermedio A', start: '17:30', end: '19:00' }));
  const conflict = await assertRejects(() => create(input()), ClassroomConflict);
  assertEquals(conflict.details().groupName, 'Intermedio A');
  assertEquals(conflict.details().slotLabel, 'Lun y Mié · 17:30–19:00');
  await create(input({ classroom: 2 }));
  assertEquals((await groups.all()).length, 2);
});

Deno.test('CreateClassGroup should require an active teacher and report the invalid field', async () => {
  const { teachers, teacherId, input, create } = management();
  teachers.active.set(teacherId, false);
  await assertRejects(() => create(input()), TeacherNotAvailable);
  teachers.active.set(teacherId, true);
  const invalid = await assertRejects(() => create(input({ end: '16:30' })), InvalidValue);
  assertEquals(invalid.field, 'end');
});

Deno.test('UpdateClassGroup should update without clashing with itself and fail clearly for unknown groups', async () => {
  const { groups, teachers, input, create } = management();
  const id = await create(input());
  await new UpdateClassGroup(groups, teachers).execute(
    id,
    input({ name: 'Iniciación A (tarde)', end: '18:30' }),
  );
  assertEquals(
    (await groups.find(ClassGroupId.fromString(id)))?.details().name.value,
    'Iniciación A (tarde)',
  );
  await assertRejects(
    () => new UpdateClassGroup(groups, teachers).execute(ClassGroupId.generate().value, input()),
    ClassGroupNotFound,
  );
});

function enrolling() {
  const groups = new InMemoryClassGroupRepository();
  const enrolments = new InMemoryEnrolmentRepository();
  const clock = new FrozenClock('2026-10-02T10:00:00+02:00');
  const transactions = new ImmediateTransactionRunner();
  const student = StudentReference.generate().value;
  const today = LocalDate.fromString('2026-10-02');
  const group = async (
    name: string,
    days: Weekday[],
    start: string,
    end: string,
    classroom = 1,
    capacity = 12,
  ): Promise<ClassGroup> => {
    const g = GroupFactory.group({ days, start, end, classroom, name, capacity });
    await groups.save(g);
    return g;
  };
  const enrol = new EnrolStudent(groups, enrolments, clock);
  const unenrol = (active = true) =>
    new UnenrolStudent(enrolments, { isActive: () => Promise.resolve(active) }, clock);
  return { groups, enrolments, clock, transactions, student, today, group, enrol, unenrol };
}

Deno.test('EnrolStudent should enrol today and refuse overlapping groups', async () => {
  const { enrolments, student, today, group, enrol } = enrolling();
  const first = await group('Iniciación A', [1], '17:00', '18:00');
  const second = await group('Particular', [1], '17:30', '18:30', 2);
  await enrol.execute(student, first.id.value, false);
  assertEquals(await enrolments.activeCount(first.id, today), 1);
  await assertRejects(() => enrol.execute(student, second.id.value, false), StudentScheduleOverlap);
});

Deno.test('EnrolStudent should ask for confirmation when full and accept it when confirmed', async () => {
  const { enrolments, student, today, group, enrol } = enrolling();
  const tiny = await group('Particular', [5], '17:30', '19:00', 1, 1);
  await enrol.execute(StudentReference.generate().value, tiny.id.value, false);
  await assertRejects(() => enrol.execute(student, tiny.id.value, false), GroupFull);
  await enrol.execute(student, tiny.id.value, true);
  assertEquals(await enrolments.activeCount(tiny.id, today), 2);
});

Deno.test('UnenrolStudent should leave one group when another remains, keep the last one and fail when not enrolled', async () => {
  const { enrolments, student, today, group, enrol, unenrol } = enrolling();
  const a = await group('Iniciación A', [1], '17:00', '18:00');
  const b = await group('Particular', [5], '17:30', '19:00');
  await assertRejects(() => unenrol().execute(student, a.id.value), NotEnrolled);
  await enrol.execute(student, a.id.value, false);
  await enrol.execute(student, b.id.value, false);
  await unenrol().execute(student, a.id.value);
  assertEquals(await enrolments.activeCount(a.id, today), 0);
  assertEquals(await enrolments.activeCount(b.id, today), 1);
  await assertRejects(() => unenrol().execute(student, b.id.value), LastEnrolment);
  await unenrol(false).execute(student, b.id.value);
  assertEquals(await enrolments.activeCount(b.id, today), 0);
});

Deno.test('MoveStudent should move atomically ignoring the group being left for overlaps', async () => {
  const { groups, enrolments, clock, transactions, student, today, group, enrol } = enrolling();
  const from = await group('Iniciación A', [1], '17:00', '18:00');
  const to = await group('Iniciación C', [1], '17:00', '18:00', 2);
  await enrol.execute(student, from.id.value, false);
  await new MoveStudent(groups, enrolments, clock, transactions).execute(
    student,
    from.id.value,
    to.id.value,
    false,
  );
  assertEquals(await enrolments.activeCount(from.id, today), 0);
  assertEquals(await enrolments.activeCount(to.id, today), 1);
  assertEquals(transactions.runs, 1);
});

Deno.test('EndStudentEnrolments should end every enrolment on the withdrawal date', async () => {
  const { enrolments, student, group, enrol } = enrolling();
  const a = await group('Iniciación A', [1], '17:00', '18:00');
  const b = await group('Particular', [5], '17:30', '19:00');
  await enrol.execute(student, a.id.value, false);
  await enrol.execute(student, b.id.value, false);
  await new EndStudentEnrolments(enrolments).execute(student, LocalDate.fromString('2026-10-31'));
  assertEquals(await enrolments.activeCount(a.id, LocalDate.fromString('2026-10-30')), 1);
  assertEquals(await enrolments.activeCount(a.id, LocalDate.fromString('2026-10-31')), 0);
  assertEquals(await enrolments.activeCount(b.id, LocalDate.fromString('2026-11-02')), 0);
});
