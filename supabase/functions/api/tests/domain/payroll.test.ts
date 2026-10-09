import { assert, assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  ClubDuty,
  DailyPlanner,
  DutyRef,
  ExpectedHours,
  GroupRef,
  overlapShares,
  ScheduledGroup,
  SessionMinutes,
  SettlementCalculator,
  Substitution,
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

Deno.test('DailyPlanner should plan the classes and club duties of a day once they are over, with substitutions', () => {
  const ana = TeacherRef.generate();
  const angel = TeacherRef.generate();
  const beginners = new ScheduledGroup(
    GroupRef.generate(),
    'Iniciación A',
    ana,
    [1, 3],
    60,
    17 * 60,
  );
  const competition = new ScheduledGroup(
    GroupRef.generate(),
    'Competición',
    angel,
    [5],
    90,
    18 * 60,
  );
  const duty = new ClubDuty(DutyRef.generate(), angel, 5, 17 * 60, 20 * 60, 'Encargado del club');
  const planner = new DailyPlanner();
  const friday = LocalDate.fromString('2026-10-09');

  // Viernes a las 19:00: ni la competición (18:00–19:30) ni el turno (17:00–20:00) han acabado.
  assertEquals(planner.plan(friday, [beginners, competition], [duty], [], 19 * 60), []);
  const day = planner.plan(friday, [beginners, competition], [duty], [], null);
  assertEquals(day.map((p) => [p.label, p.start, p.minutes.minutes, p.source]), [
    ['Encargado del club', 17 * 60, 180, `duty:${duty.id.value}`],
    ['Competición', 18 * 60, 90, `group:${competition.id.value}`],
  ]);
  assert(day.every((p) => p.teacher.equals(angel)));

  // El lunes de la sustitución, la clase la apunta quien sustituye.
  const monday = LocalDate.fromString('2026-10-05');
  const substitution = new Substitution(beginners.id, monday, angel, 'Ana, en un torneo');
  const replaced = planner.plan(monday, [beginners], [], [substitution], null);
  assertEquals(replaced.map((p) => [p.label, p.teacher.equals(angel)]), [[
    'Iniciación A (sustitución)',
    true,
  ]]);
  assertEquals(planner.plan(LocalDate.fromString('2027-07-05'), [beginners], [], [], null), []);
});

const entry = (
  teacher: TeacherRef,
  date: string,
  group: GroupRef | null,
  label: string,
  hours: number,
  start: number | null = null,
) =>
  TimesheetEntry.record(
    TimesheetEntryId.generate(),
    teacher,
    LocalDate.fromString(date),
    group,
    label,
    SessionMinutes.fromHours(hours),
    false,
    start,
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

Deno.test('SettlementCalculator should count the overlap once, giving it to the shortest session', () => {
  // Clase de 16:30 a 18:00 y actividad «Viernes» de 17:00 a 20:00: 3,5 horas, no 4,5. La clase (la más corta) cuenta
  // entera, 1,5 h, y la actividad se queda con lo que le sobra, 2 h. Otro viernes, solo la clase.
  const angel = TeacherRef.generate();
  const settlement = new SettlementCalculator().settle(
    [
      entry(angel, '2026-10-09', null, 'Viernes', 3, 17 * 60),
      entry(angel, '2026-10-09', GroupRef.generate(), 'Competición', 1.5, 16 * 60 + 30),
      entry(angel, '2026-10-16', GroupRef.generate(), 'Competición', 1.5, 16 * 60 + 30),
    ],
    Money.cents(1500),
  );
  assertEquals(settlement.minutes, 90 + 120 + 90);
  assertEquals(settlement.lines.map((l) => [l.label, l.minutes]), [
    ['Competición', 180],
    ['Viernes', 120],
  ]);
  assertEquals(settlement.amount.cents, 7500);
});

Deno.test('SettlementCalculator should count once a stretch covered by several overlapping sessions', () => {
  // 17:00–19:00 y 18:00–20:00 se solapan; una tercera de 18:00–19:00 no añade nada: 3 horas en total.
  const teacher = TeacherRef.generate();
  const settlement = new SettlementCalculator().settle(
    [
      entry(teacher, '2026-10-09', null, 'A', 2, 17 * 60),
      entry(teacher, '2026-10-09', null, 'B', 2, 18 * 60),
      entry(teacher, '2026-10-09', null, 'C', 1, 18 * 60),
    ],
    Money.cents(1000),
  );
  assertEquals(settlement.minutes, 180);
});

Deno.test('ExpectedHours should count every class and duty of the month except holidays, overlaps once', () => {
  const ana = TeacherRef.generate();
  const angel = TeacherRef.generate();
  const groups = [
    new ScheduledGroup(GroupRef.generate(), 'Iniciación A', ana, [1, 3], 60, 17 * 60),
    new ScheduledGroup(GroupRef.generate(), 'Competición', angel, [5], 90, 18 * 60),
  ];
  const duty = new ClubDuty(DutyRef.generate(), angel, 5, 17 * 60, 20 * 60, 'Encargado del club');
  // Octubre de 2026: 4 lunes y 4 miércoles, uno de ellos (lunes 12) festivo; 5 viernes.
  const minutes = new ExpectedHours().ofMonth(
    YearMonth.fromString('2026-10'),
    groups,
    [duty],
    new Set(['2026-10-12']),
  );
  assertEquals(minutes.get(ana.value), 7 * 60, 'lunes 5, 19, 26 y miércoles 7, 14, 21, 28');
  assertEquals(
    minutes.get(angel.value),
    5 * 180,
    'encargado de 17 a 20 con clase de 18 a 19:30: 3 h cada viernes',
  );
  assertEquals(
    new ExpectedHours().ofMonth(YearMonth.fromString('2026-08'), groups, [duty], new Set()).size,
    0,
  );
});

Deno.test('DailyPlanner should give a substituted club duty to the substitute', () => {
  const angel = TeacherRef.generate();
  const ana = TeacherRef.generate();
  const duty = new ClubDuty(DutyRef.generate(), angel, 5, 17 * 60, 20 * 60, 'Encargado del club');
  const friday = LocalDate.fromString('2026-10-09');
  const substitution = new Substitution(duty.id, friday, ana, 'Ángel en un torneo');
  assertEquals(substitution.source, `duty:${duty.id.value}`);
  const [session] = new DailyPlanner().plan(friday, [], [duty], [substitution], null);
  assertEquals(
    [session?.teacher.value, session?.label, session?.source],
    [ana.value, 'Encargado del club (sustitución)', `duty:${duty.id.value}`],
  );
});

Deno.test('overlapShares should tell what each session counts and with which ones it overlaps', () => {
  const span = (s: { label: string; start: number; minutes: number; substitution?: boolean }) => ({
    day: '2026-10-09',
    start: s.start,
    minutes: s.minutes,
    substitution: s.substitution ?? false,
  });
  // Clase de 17:00 a 18:30 durante «Viernes» de 17:00 a 20:00: la clase entera, la actividad 1,5 h.
  const friday = { label: 'Viernes', start: 17 * 60, minutes: 180 };
  const class_ = { label: 'Viernes 17:00', start: 17 * 60, minutes: 90 };
  assertEquals(
    overlapShares([friday, class_], span).map((
      s,
    ) => [s.item.label, s.minutes, s.overlappedBy.map((o) => o.label)]),
    [['Viernes 17:00', 90, []], ['Viernes', 90, ['Viernes 17:00']]],
  );
  // Dos clases a la misma hora: cuenta la suya y la sustitución se queda en 0; si las dos son suyas, la primera.
  const substitution = {
    label: 'Martes 17:00 (sustitución)',
    start: 17 * 60,
    minutes: 90,
    substitution: true,
  };
  const own = { label: 'Martes 17:00', start: 17 * 60, minutes: 90 };
  assertEquals(
    overlapShares([substitution, own], span).map((
      s,
    ) => [s.item.label, s.minutes, s.overlappedBy.map((o) => o.label)]),
    [['Martes 17:00', 90, []], ['Martes 17:00 (sustitución)', 0, ['Martes 17:00']]],
  );
  const other = { label: 'Martes 17:00 B', start: 17 * 60, minutes: 90 };
  assertEquals(overlapShares([own, other], span).map((s) => [s.item.label, s.minutes]), [
    ['Martes 17:00', 90],
    ['Martes 17:00 B', 0],
  ]);
});
