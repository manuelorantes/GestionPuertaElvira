import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import {
  FullName,
  InvalidValue,
  LocalDate,
  Money,
  PhoneNumber,
} from '../../src/domain/common/mod.ts';
import {
  FederationLicence,
  Guardian,
  MemberRenumbering,
  NationalId,
  Student,
  StudentId,
} from '../../src/domain/students/mod.ts';
import { Teacher, TeacherId } from '../../src/domain/teachers/mod.ts';
import { StudentFactory } from '../support/students.ts';

const today = LocalDate.fromString('2026-10-02');

Deno.test('Student should register an active minor with a guardian', () => {
  const student = Student.register(StudentId.generate(), StudentFactory.details(), today);
  assert(student.isActiveOn(today));
  assertEquals(student.details().ageOn(today), 12);
  assert(student.joinedOn.equals(today));
});

Deno.test('Student should accept any contact data and list what is missing instead of refusing', () => {
  const minorWithoutGuardian = Student.register(
    StudentId.generate(),
    StudentFactory.details({ guardians: [], email: null }),
    today,
  );
  assertEquals(minorWithoutGuardian.details().missingData(today), ['guardian', 'email']);
  const adult = Student.register(
    StudentId.generate(),
    StudentFactory.details({
      name: 'Javier Navarro Pérez',
      birthDate: '1984-05-01',
      guardians: [],
    }),
    today,
  );
  assertEquals(adult.details().missingData(today), ['phone']);
  adult.updateDetails(
    StudentFactory.details({ birthDate: '1984-05-01', guardians: [], ownPhone: '677528810' }),
    today,
  );
  assertEquals(adult.details().missingData(today), []);
  const guardianWithoutPhone = new Guardian(FullName.fromString('Tutor Uno'), null);
  const unknownAge = Student.register(
    StudentId.generate(),
    StudentFactory.details({ birthDate: null, guardians: [guardianWithoutPhone] }),
    today,
  );
  assertEquals(unknownAge.details().ageOn(today), null);
  assertEquals(unknownAge.details().isMinorOn(today), null);
  assertEquals(unknownAge.details().missingData(today), ['birth_date', 'guardian_phone']);
  assertEquals(
    Student.register(StudentId.generate(), StudentFactory.details(), today).details().missingData(
      today,
    ),
    [],
  );

  const guardian = new Guardian(
    FullName.fromString('Tutor Uno'),
    PhoneNumber.fromString('612481930'),
  );
  assertThrows(
    () =>
      Student.register(
        StudentId.generate(),
        StudentFactory.details({ guardians: [guardian, guardian, guardian] }),
        today,
      ),
    InvalidValue,
  );
  assertThrows(
    () =>
      Student.register(
        StudentId.generate(),
        StudentFactory.details({ birthDate: '2027-01-01' }),
        today,
      ),
    InvalidValue,
  );
});

Deno.test('Student should stop being active from the withdrawal date and refuse withdrawals before joining', () => {
  const student = Student.register(StudentId.generate(), StudentFactory.details(), today);
  student.withdraw(LocalDate.fromString('2026-10-31'), today);
  assert(student.isActiveOn(LocalDate.fromString('2026-10-30')));
  assertFalse(student.isActiveOn(LocalDate.fromString('2026-10-31')));
  assertThrows(() => student.withdraw(LocalDate.fromString('2026-09-01'), today), InvalidValue);
});

Deno.test('Student should manage siblings without including itself', () => {
  const student = Student.register(StudentId.generate(), StudentFactory.details(), today);
  const sibling = StudentId.generate();
  student.addSibling(sibling);
  student.addSibling(sibling);
  assertEquals(student.siblings(), [sibling]);
  student.removeSibling(sibling);
  assertEquals(student.siblings(), []);
  assertThrows(() => student.addSibling(student.id), InvalidValue);
});

Deno.test('NationalId should accept DNI and NIE with a correct check letter', () => {
  assertEquals(NationalId.fromString('12345678Z').value, '12345678Z');
  assertEquals(NationalId.fromString('12345678-z').value, '12345678Z');
  assertEquals(NationalId.fromString('X1234567L').value, 'X1234567L');
  for (const invalid of ['12345678A', '1234567Z', 'A1234567L']) {
    assertThrows(() => NationalId.fromString(invalid), InvalidValue);
  }
  assertEquals(FederationLicence.fromString(' and-20417 ').value, 'AND-20417');
  assertThrows(() => FederationLicence.fromString('X'), InvalidValue);
});

Deno.test('Teacher should be active when registered, be paid fifteen euros an hour and follow changes', () => {
  const teacher = Teacher.register(TeacherId.generate(), FullName.fromString('Lucía Moreno Gil'));
  assert(teacher.isActive());
  teacher.deactivate();
  assertFalse(teacher.isActive());
  teacher.activate();
  assert(teacher.isActive());
  assertEquals(teacher.hourlyRate().cents, 1500);
  teacher.changeRate(Money.euros(18));
  assertEquals(teacher.hourlyRate().cents, 1800);
  assertThrows(() => teacher.changeRate(Money.cents(-1)), InvalidValue);
  teacher.rename(FullName.fromString('Lucía Moreno Gil de la Torre'));
  assertEquals(teacher.fullName().value, 'Lucía Moreno Gil de la Torre');
});

Deno.test('MemberRenumbering should only swap numbers the students already have', () => {
  const current = new Map([['a', 1], ['b', 2], ['c', 3]]);
  assertEquals(
    MemberRenumbering.of(current, new Map([['a', 2], ['b', 1]])).changes(),
    new Map([['a', 2], ['b', 1]]),
  );
  assertEquals(MemberRenumbering.of(current, new Map([['c', 3]])).changes(), new Map());
  assertThrows(() => MemberRenumbering.of(current, new Map([['a', 9]])), InvalidValue);
  assertThrows(() => MemberRenumbering.of(current, new Map([['a', 3]])), InvalidValue);
  assertThrows(() => MemberRenumbering.of(current, new Map([['a', 2], ['b', 2]])), InvalidValue);
  assertThrows(() => MemberRenumbering.of(current, new Map([['x', 1]])), InvalidValue);
  assertThrows(() => MemberRenumbering.of(current, new Map([['a', 0]])), InvalidValue);
});
