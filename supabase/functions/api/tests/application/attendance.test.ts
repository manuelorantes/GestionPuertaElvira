import { assertEquals, assertRejects } from '@std/assert';

import { LocalDate } from '../../src/domain/common/mod.ts';
import { type RollCall, RollCallClosed } from '../../src/domain/attendance/mod.ts';
import {
  type ClassAssignments,
  ClassNotGiven,
  type ClassOnDay,
  type ClassRoster,
  ConfirmWithoutRollCall,
  type MissedRollCallQuery,
  MissedRollCalls,
  OpenRollCall,
  type RollCallRepository,
  RollCallStillOpen,
  StudentAttendance,
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

const MISSED = {
  sessionId: 'p1',
  groupId: 'g1',
  date: '2026-10-13',
  label: 'Martes y jueves 17:00 · Intermedio · Alfil',
  teacherName: 'Lucía Moreno Gil',
  locked: false,
};

Deno.test('MissedRollCalls should list the recorded classes without a roll call once the deadline is over', async () => {
  const asked: string[] = [];
  const query: MissedRollCallQuery = {
    since: () => Promise.resolve(LocalDate.fromString('2026-10-10')),
    missed: (from, until) => {
      asked.push(`${from.toString()}…${until.toString()}`);
      return Promise.resolve([MISSED]);
    },
  };
  const clock = new FrozenClock('2026-10-16T09:00:00+02:00');
  assertEquals(await new MissedRollCalls(query, clock).execute(), [MISSED]);
  // El plazo del 14 acaba el 15 a medianoche: el 16 se avisa hasta el 14.
  assertEquals(asked, ['2026-10-10…2026-10-14']);
});

Deno.test('ConfirmWithoutRollCall should keep a missed class only once its deadline is over and without a list', async () => {
  const rolls = new InMemoryRollCalls();
  const confirm = (now: string, date = '2026-10-13') =>
    new ConfirmWithoutRollCall(rolls, new FrozenClock(now)).execute('g1', date, 'u1');

  await assertRejects(() => confirm('2026-10-14T20:00:00+02:00'), RollCallStillOpen);
  await confirm('2026-10-15T09:00:00+02:00');
  assertEquals((await rolls.find('g1', LocalDate.fromString('2026-10-13')))?.kind(), 'confirmed');
  await confirm('2026-10-15T10:00:00+02:00');
  assertEquals(rolls.saved.size, 1, 'darla por buena dos veces no cambia nada');
});

Deno.test('StudentAttendance should summarise the season so far', async () => {
  const asked: string[] = [];
  const view = await new StudentAttendance(
    {
      summary: (_student, from, to) => {
        asked.push(`${from.toString()}…${to.toString()}`);
        return Promise.resolve({
          classes: 6,
          absences: [{ date: '2026-10-06', label: 'Martes 19:00' }],
        });
      },
    },
    new FrozenClock('2026-10-16T09:00:00+02:00'),
  ).execute('s1');
  assertEquals(asked, ['2026-09-01…2026-10-16']);
  assertEquals([view.season, view.classes, view.attended], [2026, 6, 5]);
});
