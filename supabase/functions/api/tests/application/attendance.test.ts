import { assertEquals, assertRejects } from '@std/assert';

import type { LocalDate } from '../../src/domain/common/mod.ts';
import { type RollCall, RollCallClosed } from '../../src/domain/attendance/mod.ts';
import {
  type ClassAssignments,
  ClassNotGiven,
  type ClassOnDay,
  type ClassRoster,
  OpenRollCall,
  type RollCallRepository,
  TakeRollCall,
  TeacherClasses,
} from '../../src/application/attendance/mod.ts';
import { FrozenClock } from '../support/identity.ts';

const class_ = (overrides: Partial<ClassOnDay>): ClassOnDay => ({
  date: '2026-10-13',
  groupId: 'g1',
  dutyId: null,
  label: 'Martes y jueves 17:00 · Intermedio · Alfil',
  start: '17:00',
  end: '18:30',
  minutes: 90,
  substitution: false,
  ...overrides,
});

const assignments = (items: ClassOnDay[]): ClassAssignments => ({
  agenda: (_teacher, from, to) =>
    Promise.resolve(items.filter((i) => i.date >= from && i.date <= to)),
});

class InMemoryRollCalls implements RollCallRepository {
  readonly saved = new Map<string, RollCall>();

  find(group: string, date: LocalDate): Promise<RollCall | null> {
    return Promise.resolve(this.saved.get(`${group}/${date.toString()}`) ?? null);
  }

  save(roll: RollCall): Promise<void> {
    this.saved.set(`${roll.group}/${roll.date.toString()}`, roll);
    return Promise.resolve();
  }
}

/** g1 tiene dos alumnos los martes y uno los jueves (el otro solo va los martes). */
const roster: ClassRoster = {
  studentsOn: (groupId: string, date: LocalDate) =>
    Promise.resolve(
      groupId !== 'g1'
        ? []
        : date.isoWeekday() === 2
        ? [{ id: 's1', name: 'Ana Pérez' }, { id: 's2', name: 'Pablo Gil' }]
        : [{ id: 's1', name: 'Ana Pérez' }],
    ),
  classroomOf: (groupId: string) => Promise.resolve(groupId === 'g1' ? 'alfil' : null),
};

Deno.test('TeacherClasses should add the classroom, the students of that day and the roll call status', async () => {
  const rolls = new InMemoryRollCalls();
  const clock = new FrozenClock('2026-10-15T17:30:00+02:00');
  const agenda = assignments([
    class_({ date: '2026-10-08' }),
    class_({}),
    class_({ date: '2026-10-15' }),
    class_({ date: '2026-10-15', start: '19:00', groupId: 'g2' }),
    class_({ groupId: null, dutyId: 'd1', label: 'Encargado del club' }),
  ]);
  await new TakeRollCall(agenda, roster, rolls, new FrozenClock('2026-10-13T18:00:00+02:00'))
    .execute('t1', 'g1', '2026-10-13', []);

  const classes = await new TeacherClasses(agenda, roster, rolls, clock).execute(
    't1',
    '2026-10-01',
    '2026-10-18',
  );
  assertEquals(classes.map((c) => [c.date, c.groupId, c.classroom, c.students, c.rollCall]), [
    ['2026-10-08', 'g1', 'alfil', 1, 'missed'],
    ['2026-10-13', 'g1', 'alfil', 2, 'taken'],
    ['2026-10-15', 'g1', 'alfil', 1, 'open'],
    ['2026-10-15', 'g2', null, 0, 'upcoming'],
    ['2026-10-13', null, null, 0, null],
  ]);
});

Deno.test('OpenRollCall and TakeRollCall should list the students of that day, all present by default', async () => {
  const rolls = new InMemoryRollCalls();
  const clock = new FrozenClock('2026-10-13T18:00:00+02:00');
  const agenda = assignments([class_({})]);
  const open = () =>
    new OpenRollCall(agenda, roster, rolls, clock).execute('t1', 'g1', '2026-10-13');
  const take = (absent: string[]) =>
    new TakeRollCall(agenda, roster, rolls, clock).execute('t1', 'g1', '2026-10-13', absent);

  assertEquals((await open()).list, [
    { id: 's1', name: 'Ana Pérez', present: true },
    { id: 's2', name: 'Pablo Gil', present: true },
  ]);
  assertEquals((await open()).rollCall, 'open');
  await take(['s2']);
  assertEquals((await open()).list.map((s) => s.present), [true, false]);
  assertEquals((await open()).rollCall, 'taken');
  await take([]);
  assertEquals((await open()).list.map((s) => s.present), [true, true], 'se corrige en plazo');

  await assertRejects(
    () => new OpenRollCall(agenda, roster, rolls, clock).execute('t1', 'g1', '2026-10-14'),
    ClassNotGiven,
  );
  const late = new FrozenClock('2026-10-15T09:00:00+02:00');
  await assertRejects(
    () => new TakeRollCall(agenda, roster, rolls, late).execute('t1', 'g1', '2026-10-13', []),
    RollCallClosed,
  );
});
