import { assert, assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  GroupRef,
  ScheduledGroup,
  SessionMinutes,
  SessionPlanner,
  SettlementCalculator,
  TeacherRef,
  TimesheetEntry,
  TimesheetEntryId,
} from '../../src/domain/payroll/mod.ts';

Deno.test('SessionMinutes should accept half hours between half an hour and twelve hours', () => {
  assertEquals(SessionMinutes.fromHours(1.5).minutes, 90);
  assertEquals(SessionMinutes.fromMinutes(90).label(), '1,5 h');
  assertThrows(() => SessionMinutes.fromHours(1.25), InvalidValue);
  assertThrows(() => SessionMinutes.fromMinutes(750), InvalidValue);
});

Deno.test('SessionPlanner should propose a session for every class day of the month, and none in summer', () => {
  const teacher = TeacherRef.generate();
  const groups = [
    new ScheduledGroup(GroupRef.generate(), 'Iniciación A', teacher, [1, 3], 60),
    new ScheduledGroup(GroupRef.generate(), 'Competición', teacher, [5], 90),
  ];
  const sessions = new SessionPlanner().plan(YearMonth.fromString('2026-10'), groups);
  // Octubre 2026: lunes 5, 12, 19, 26 · miércoles 7, 14, 21, 28 · viernes 2, 9, 16, 23, 30
  assertEquals(sessions.length, 13);
  assertEquals(sessions[0]?.date.toString(), '2026-10-02');
  assertEquals(sessions[0]?.group.name, 'Competición');
  assertEquals(sessions[0]?.minutes.minutes, 90);
  assertEquals(sessions.reduce((sum, s) => sum + s.minutes.minutes, 0), 8 * 60 + 5 * 90);
  assertEquals(new SessionPlanner().plan(YearMonth.fromString('2027-07'), groups), []);
});

const entry = (
  teacher: TeacherRef,
  date: string,
  group: GroupRef | null,
  label: string,
  hours: number,
) =>
  TimesheetEntry.record(
    TimesheetEntryId.generate(),
    teacher,
    LocalDate.fromString(date),
    group,
    label,
    SessionMinutes.fromHours(hours),
    false,
  );

Deno.test('TimesheetEntry should reassign and resize a session and require a label', () => {
  const e = entry(TeacherRef.generate(), '2026-10-05', GroupRef.generate(), 'Iniciación A', 1);
  const substitute = TeacherRef.generate();
  e.reassign(substitute);
  e.changeDuration(SessionMinutes.fromHours(1.5));
  assert(e.teacher().equals(substitute));
  assertEquals(e.minutes().minutes, 90);
  assert(YearMonth.fromString('2026-10').equals(e.month()));
  assertThrows(() => entry(TeacherRef.generate(), '2026-10-05', null, '  ', 1), InvalidValue);
});

Deno.test('SettlementCalculator should settle hours by rate with a breakdown per group', () => {
  const teacher = TeacherRef.generate();
  const group = GroupRef.generate();
  const settlement = new SettlementCalculator().settle(
    [
      entry(teacher, '2026-10-05', group, 'Iniciación A', 1),
      entry(teacher, '2026-10-07', group, 'Iniciación A', 1),
      entry(teacher, '2026-10-09', null, 'Torneo escolar', 2.5),
    ],
    Money.cents(1650),
  );
  assertEquals(settlement.minutes, 270);
  assertEquals(settlement.amount.cents, 7425);
  assertEquals(settlement.lines.map((l) => [l.label, l.minutes, l.amount.cents]), [[
    'Iniciación A',
    120,
    3300,
  ], ['Torneo escolar', 150, 4125]]);
});
