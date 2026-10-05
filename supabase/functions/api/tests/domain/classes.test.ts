import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  AlreadyEnrolled,
  Capacity,
  Classroom,
  ClassroomSchedule,
  Enrolment,
  EnrolmentId,
  EnrolmentPolicy,
  GroupFull,
  GroupName,
  HalfHour,
  type Level,
  levelFromName,
  StudentReference,
  StudentScheduleOverlap,
  type Weekday,
  WeeklySlot,
} from '../../src/domain/classes/mod.ts';
import { GroupFactory } from '../support/classes.ts';

const slot = (days: Weekday[], start: string, end: string) =>
  WeeklySlot.of(days, HalfHour.fromString(start), HalfHour.fromString(end));

Deno.test('ClassGroup should derive the weekly plan from its weekly hours', () => {
  const cases: [Weekday[], string, string, Level, string][] = [
    [[5], '16:30', '17:30', 'beginner', 'one_hour'],
    [[2], '19:30', '21:00', 'intermediate', 'hour_and_half'],
    [[1, 3], '17:00', '18:00', 'beginner', 'two_hours'],
    [[1, 3], '18:00', '19:30', 'intermediate', 'three_hours'],
    [[4], '19:30', '21:00', 'private_lesson', 'private_lesson'],
  ];
  for (const [days, start, end, level, expected] of cases) {
    assertEquals(GroupFactory.details({ days, start, end, level }).weeklyPlan(), expected);
  }
});

Deno.test('ClassGroup should replace its details when updated and find classroom clashes only', () => {
  const group = GroupFactory.group();
  group.update(GroupFactory.details({ name: 'Iniciación B', classroom: 'caballo', capacity: 10 }));
  assertEquals(group.details().name.value, 'Iniciación B');
  assertEquals(group.details().classroom.code, 'caballo');

  const sameRoomClash = GroupFactory.group({
    days: [1],
    start: '17:30',
    end: '18:30',
    classroom: 'alfil',
    name: 'Choca',
  });
  const otherRoom = GroupFactory.group({
    days: [1],
    start: '17:00',
    end: '18:00',
    classroom: 'caballo',
    name: 'Otra aula',
  });
  const backToBack = GroupFactory.group({
    days: [1],
    start: '18:00',
    end: '19:00',
    classroom: 'alfil',
    name: 'Seguido',
  });
  const proposed = GroupFactory.group({
    days: [1, 3],
    start: '17:00',
    end: '18:00',
    classroom: 'alfil',
    name: 'Nuevo',
  });
  const conflicts = new ClassroomSchedule().conflictsFor(proposed.id, proposed.details(), [
    sameRoomClash,
    otherRoom,
    backToBack,
    proposed,
  ]);
  assertEquals(conflicts, [sameRoomClash]);
});

Deno.test('Enrolment should be active from its start until the day before it ends', () => {
  const enrolment = Enrolment.start(
    EnrolmentId.generate(),
    StudentReference.generate(),
    GroupFactory.group().id,
    LocalDate.fromString('2026-09-15'),
  );
  assertFalse(enrolment.isActiveOn(LocalDate.fromString('2026-09-14')));
  assert(enrolment.isActiveOn(LocalDate.fromString('2026-09-15')));
  enrolment.endOn(LocalDate.fromString('2026-10-01'));
  assert(enrolment.isActiveOn(LocalDate.fromString('2026-09-30')));
  assertFalse(enrolment.isActiveOn(LocalDate.fromString('2026-10-01')));
  assertThrows(() => enrolment.endOn(LocalDate.fromString('2026-09-01')), InvalidValue);
});

Deno.test('EnrolmentPolicy should accept free seats without clashes and refuse duplicates, overlaps and full groups', () => {
  const policy = new EnrolmentPolicy();
  const target = GroupFactory.group({ days: [5], start: '17:30', end: '19:00' });
  policy.assertCanEnrol(
    target,
    [GroupFactory.group({ days: [1], start: '17:00', end: '18:00' })],
    5,
    false,
  );
  assertThrows(() => policy.assertCanEnrol(target, [target], 5, false), AlreadyEnrolled);

  const particular = GroupFactory.group({
    days: [1],
    start: '17:30',
    end: '18:30',
    name: 'Particular',
  });
  const current = GroupFactory.group({
    days: [1, 3],
    start: '17:00',
    end: '18:00',
    classroom: 'caballo',
    name: 'Iniciación A',
  });
  const overlap = assertThrows(
    () => policy.assertCanEnrol(particular, [current], 0, false),
    StudentScheduleOverlap,
  );
  assertEquals(overlap.details().groupName, 'Iniciación A');

  const full = GroupFactory.group({ capacity: 12 });
  const error = assertThrows(() => policy.assertCanEnrol(full, [], 12, false), GroupFull);
  assertEquals(error.details(), { occupied: 12, capacity: 12 });
  assertEquals(error.message, 'El grupo está completo (12/12).');
  policy.assertCanEnrol(full, [], 12, true);
});

Deno.test('Group values should validate capacity, classroom, name and level', () => {
  assertEquals(Capacity.of(1).value, 1);
  assertEquals(Capacity.of(30).value, 30);
  assertThrows(() => Capacity.of(31), InvalidValue);
  assertEquals(Classroom.fromString('peon').label(), 'Aula Peón');
  assertEquals(Classroom.fromString('caballo').position(), 1);
  assertThrows(() => Classroom.fromString('3'), InvalidValue);
  assertThrows(() => levelFromName('adults'), InvalidValue);
  assertEquals(GroupName.fromString('  Iniciación   A ').value, 'Iniciación A');
  assertThrows(() => GroupName.fromString('X'), InvalidValue);
  assertEquals(GroupName.optional('   '), null);
  assertEquals(GroupName.optional(null), null);
  assertEquals(GroupName.optional(' Peques ')?.value, 'Peques');
  assertEquals(levelFromName('private_lesson'), 'private_lesson');
  assertThrows(() => levelFromName('expert'), InvalidValue);
});

Deno.test('HalfHour should accept half hours between four and nine pm', () => {
  assertEquals(HalfHour.fromString('16:00').toString(), '16:00');
  assertEquals(HalfHour.fromString('21:00').toString(), '21:00');
  assertEquals(HalfHour.fromString('19:30').toString(), '19:30');
  for (const invalid of ['15:30', '21:30', '17:15', '5pm']) {
    assertThrows(() => HalfHour.fromString(invalid), InvalidValue);
  }
});

Deno.test('WeeklySlot should require days, end after start, sort days and describe itself', () => {
  assertThrows(() => slot([], '17:00', '18:00'), InvalidValue);
  assertThrows(() => slot([1], '18:00', '18:00'), InvalidValue);
  const s = slot([3, 1], '17:00', '18:30');
  assertEquals(s.days, [1, 3]);
  assertEquals(s.label(), 'Lun y Mié · 17:00–18:30');
  assertEquals(s.weeklyHours(), 3);
  assertEquals(slot([5], '16:00', '17:00').label(), 'Vie · 16:00–17:00');
});

Deno.test('WeeklySlot should overlap only when sharing a day and intersecting in time', () => {
  const cases: [Weekday[], string, string, Weekday[], string, string, boolean][] = [
    [[1], '17:00', '18:30', [1], '18:00', '19:00', true],
    [[1], '17:00', '18:00', [1], '18:00', '19:00', false],
    [[1], '17:00', '18:00', [2], '17:00', '18:00', false],
    [[1, 3], '17:00', '18:00', [3, 5], '17:30', '18:30', true],
    [[5], '16:00', '21:00', [5], '18:00', '18:30', true],
  ];
  for (const [da, sa, ea, db, sb, eb, expected] of cases) {
    assertEquals(slot(da, sa, ea).overlaps(slot(db, sb, eb)), expected);
    assertEquals(slot(db, sb, eb).overlaps(slot(da, sa, ea)), expected);
  }
});

Deno.test('GroupDetails should name the group by day, time, level and classroom when no name is given', () => {
  const one = GroupFactory.details({ name: null, days: [1], start: '17:00', end: '18:00' });
  assertEquals(one.name.value, 'Lunes 17:00 · Iniciación · Alfil');
  assertEquals(one.customName, false);
  const two = GroupFactory.details({
    name: null,
    days: [1, 3],
    start: '18:30',
    end: '19:30',
    level: 'intermediate',
    classroom: 'peon',
  });
  assertEquals(two.name.value, 'Lunes y miércoles 18:30 · Intermedio · Peón');
  const three = GroupFactory.details({
    name: null,
    days: [2, 4, 5],
    start: '19:30',
    end: '21:00',
    level: 'private_lesson',
    classroom: 'caballo',
  });
  assertEquals(three.name.value, 'Martes, jueves y viernes 19:30 · Particular · Caballo');
  const named = GroupFactory.details({ name: 'Competición' });
  assertEquals(named.name.value, 'Competición');
  assertEquals(named.customName, true);
});
