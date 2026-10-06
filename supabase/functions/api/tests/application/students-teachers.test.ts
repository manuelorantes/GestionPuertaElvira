import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import { GroupFull } from '../../src/domain/classes/mod.ts';
import { StudentId } from '../../src/domain/students/mod.ts';
import { TeacherId } from '../../src/domain/teachers/mod.ts';
import {
  LinkSiblings,
  ListPendingData,
  RegisterStudent,
  type StudentInput,
  StudentNotFound,
  UnlinkSiblings,
  UpdateStudent,
  WithdrawStudent,
} from '../../src/application/students/mod.ts';
import {
  ActivateTeacher,
  ChangeTeacherRate,
  DeactivateTeacher,
  RegisterTeacher,
  RenameTeacher,
  TeacherHasGroups,
  TeacherNotFound,
} from '../../src/application/teachers/mod.ts';
import { ImmediateTransactionRunner } from '../support/classes.ts';
import { FrozenClock } from '../support/identity.ts';
import {
  InMemoryStudentRepository,
  InMemoryTeacherRepository,
  SpyEnrolments,
  SpyMembership,
} from '../support/students.ts';

function students() {
  const repo = new InMemoryStudentRepository();
  const enrolments = new SpyEnrolments();
  const transactions = new ImmediateTransactionRunner();
  const clock = new FrozenClock('2026-10-02T10:00:00+02:00');
  const membership = new SpyMembership();
  const input = (overrides: Partial<StudentInput> = {}): StudentInput => ({
    fullName: 'Martina López Herrera',
    birthDate: '2014-03-12',
    nationalId: '12345678Z',
    contactEmail: 'familia@ejemplo.com',
    guardians: [{ name: 'Rocío Herrera', phone: '612481930' }],
    ownPhone: null,
    federationLicence: null,
    imageConsent: true,
    ...overrides,
  });
  const register = (groupIds: string[], siblingIds: string[] = [], joinedOn?: string) =>
    new RegisterStudent(repo, enrolments, transactions, clock, membership).execute(
      input(),
      groupIds.map((groupId) => ({ groupId, attendance: null })),
      siblingIds,
      false,
      joinedOn,
    );
  return { repo, enrolments, transactions, clock, membership, input, register };
}

Deno.test('RegisterStudent should register a student and enrol them in their groups atomically', async () => {
  const { repo, enrolments, transactions, register } = students();
  const id = await register(['g1', 'g2']);
  const student = await repo.find(StudentId.fromString(id));
  assertEquals(student?.details().fullName.value, 'Martina López Herrera');
  assertEquals(student?.details().guardians[0]?.name.value, 'Rocío Herrera');
  assertEquals(student?.details().guardians[0]?.phone?.value, '612 48 19 30');
  assertEquals(enrolments.enrolled, [{ student: id, groups: ['g1', 'g2'], confirmed: false }]);
  assertEquals(transactions.runs, 1);
});

Deno.test('RegisterStudent should accept an earlier joining date but never a future one', async () => {
  const { repo, register } = students();
  const id = await register(['g1'], [], '2026-09-01');
  assertEquals((await repo.find(StudentId.fromString(id)))?.joinedOn.toString(), '2026-09-01');
  await assertRejects(() => register(['g1'], [], '2027-01-01'), InvalidValue);
});

Deno.test('RegisterStudent should propagate enrolment problems and link siblings both ways', async () => {
  const { repo, enrolments, register } = students();
  enrolments.failWith = new GroupFull(12, 12);
  await assertRejects(() => register(['g1']), GroupFull);
  enrolments.failWith = null;
  const sister = await register(['g1']);
  const brother = await register(['g2'], [sister]);
  assertEquals((await repo.find(StudentId.fromString(brother)))?.siblings().map((s) => s.value), [
    sister,
  ]);
  assertEquals((await repo.find(StudentId.fromString(sister)))?.siblings().map((s) => s.value), [
    brother,
  ]);
});

Deno.test('UpdateStudent should accept partial contact data and fail clearly for unknown students', async () => {
  const { repo, clock, input, register } = students();
  const id = await register(['g1']);
  await new UpdateStudent(repo, clock).execute(id, input({ fullName: 'Martina López' }));
  assertEquals(
    (await repo.find(StudentId.fromString(id)))?.details().fullName.value,
    'Martina López',
  );
  await new UpdateStudent(repo, clock).execute(id, input({ guardians: [], birthDate: null }));
  assertEquals(
    (await repo.find(StudentId.fromString(id)))?.details().missingData(
      LocalDate.fromString('2026-10-02'),
    ),
    ['birth_date', 'guardian'],
  );
  await assertRejects(
    () => new UpdateStudent(repo, clock).execute(StudentId.generate().value, input()),
    StudentNotFound,
  );
});

Deno.test('WithdrawStudent should withdraw and end enrolments on the same date', async () => {
  const { repo, enrolments, transactions, clock, register } = students();
  const id = await register(['g1']);
  await new WithdrawStudent(repo, enrolments, transactions, clock).execute(id, '2026-10-31');
  assertFalse(
    (await repo.find(StudentId.fromString(id)))?.isActiveOn(LocalDate.fromString('2026-10-31')),
  );
  assertEquals(enrolments.ended, [{ student: id, on: '2026-10-31' }]);
});

Deno.test('LinkSiblings and UnlinkSiblings should be mutual', async () => {
  const { repo, transactions, register } = students();
  const a = await register(['g1']);
  const b = await register(['g2']);
  await new LinkSiblings(repo, transactions).execute(a, b);
  assertEquals((await repo.find(StudentId.fromString(b)))?.siblings().length, 1);
  await new UnlinkSiblings(repo, transactions).execute(b, a);
  assertEquals((await repo.find(StudentId.fromString(a)))?.siblings(), []);
  assertEquals((await repo.find(StudentId.fromString(b)))?.siblings(), []);
});

Deno.test('Teacher use cases should register, rename, change the rate, deactivate without groups and activate again', async () => {
  const teachers = new InMemoryTeacherRepository();
  const id = await new RegisterTeacher(teachers).execute('  Carlos   Ruiz Márquez ');
  const teacher = await teachers.find(TeacherId.fromString(id));
  assertEquals(teacher?.fullName().value, 'Carlos Ruiz Márquez');
  assert(teacher?.isActive());
  await new RenameTeacher(teachers).execute(id, 'Carlos Ruiz');
  assertEquals((await teachers.find(TeacherId.fromString(id)))?.fullName().value, 'Carlos Ruiz');
  await new ChangeTeacherRate(teachers).execute(id, '18,50');
  assertEquals((await teachers.find(TeacherId.fromString(id)))?.hourlyRate().cents, 1850);
  await new DeactivateTeacher(teachers, { groupCount: () => Promise.resolve(0) }).execute(id);
  assertFalse((await teachers.find(TeacherId.fromString(id)))?.isActive());
  await new ActivateTeacher(teachers).execute(id);
  assert((await teachers.find(TeacherId.fromString(id)))?.isActive());
  const busy = await assertRejects(
    () => new DeactivateTeacher(teachers, { groupCount: () => Promise.resolve(3) }).execute(id),
    TeacherHasGroups,
  );
  assertEquals(busy.details(), { groupCount: 3 });
  await assertRejects(
    () => new RenameTeacher(teachers).execute(TeacherId.generate().value, 'Nadie'),
    TeacherNotFound,
  );
});

Deno.test('RegisterStudent should admit a member without classes and mark them as member', async () => {
  const { repo, enrolments, membership, input } = students();
  const clock = new FrozenClock('2026-10-02T10:00:00+02:00');
  const id = await new RegisterStudent(
    repo,
    enrolments,
    new ImmediateTransactionRunner(),
    clock,
    membership,
  )
    .execute(input({ fullName: 'Socio Sin Clases' }), [], [], false);
  assertEquals(enrolments.enrolled, []);
  assertEquals(membership.members, [id]);
});

Deno.test('ListPendingData should list active students with what they are missing', async () => {
  const { repo, register, clock, input } = students();
  const complete = await register(['g1']);
  const incomplete = await new RegisterStudent(
    repo,
    new SpyEnrolments(),
    new ImmediateTransactionRunner(),
    clock,
  )
    .execute(
      input({ fullName: 'Pepe Sin Datos', birthDate: null, guardians: [], contactEmail: null }),
      [{ groupId: 'g1', attendance: null }],
      [],
      false,
    );
  const withdrawn = await register(['g1']);
  await new WithdrawStudent(repo, new SpyEnrolments(), new ImmediateTransactionRunner(), clock)
    .execute(withdrawn, '2026-10-02');
  const pending = await new ListPendingData(repo, clock).execute();
  assertEquals(pending, [{
    id: incomplete,
    fullName: 'Pepe Sin Datos',
    missing: ['birth_date', 'guardian', 'email'],
  }]);
  assert(!pending.some((p) => p.id === complete));
});
