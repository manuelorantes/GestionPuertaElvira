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
  MissingContact,
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
  assertEquals(student.details().birthDate.ageOn(today), 12);
  assert(student.joinedOn.equals(today));
});

Deno.test('Student should apply the contact rules: minors need a guardian, adults a guardian or a phone', () => {
  const minor = assertThrows(
    () => Student.register(StudentId.generate(), StudentFactory.details({ guardians: [] }), today),
    MissingContact,
  );
  assertEquals(minor.details(), { field: 'guardians' });
  const adult = Student.register(
    StudentId.generate(),
    StudentFactory.details({
      name: 'Javier Navarro Pérez',
      birthDate: '1984-05-01',
      guardians: [],
      ownPhone: '677528810',
    }),
    today,
  );
  assert(adult.isActiveOn(today));
  assertThrows(
    () =>
      Student.register(
        StudentId.generate(),
        StudentFactory.details({ birthDate: '1984-05-01', guardians: [] }),
        today,
      ),
    MissingContact,
    'Sin tutor, el alumno necesita su propio teléfono de contacto.',
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
  const student = Student.register(StudentId.generate(), StudentFactory.details(), today);
  assertThrows(
    () => student.updateDetails(StudentFactory.details({ guardians: [] }), today),
    MissingContact,
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
