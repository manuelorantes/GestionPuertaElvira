import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import { type RollCall, RollCallClosed } from '../../src/domain/attendance/mod.ts';
import {
  AttendanceGroupNotFound,
  type ClassAssignments,
  ClassNotGiven,
  type ClassOnDay,
  type ClassRoster,
  ConfirmWithoutRollCall,
  GroupAttendance,
  type GroupAttendanceData,
  type GroupAttendanceQuery,
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
  activity: null,
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
  clubStudentsOn: () =>
    Promise.resolve([
      { id: 's1', name: 'Ana Pérez' },
      { id: 's2', name: 'Pablo Gil' },
      { id: 's3', name: 'Lola Ruiz' },
    ]),
  namesOf: (ids) =>
    Promise.resolve(
      [{ id: 's3', name: 'Lola Ruiz' }].filter((s) => ids.includes(s.id)),
    ),
};

Deno.test('TeacherClasses should add the classroom, the students of that day and the roll call status', async () => {
  const rolls = new InMemoryRollCalls();
  const clock = new FrozenClock('2026-10-15T17:30:00+02:00');
  const agenda = assignments([
    class_({ date: '2026-10-08' }),
    class_({}),
    class_({ date: '2026-10-15' }),
    class_({ date: '2026-10-15', start: '19:00', groupId: 'g2' }),
    class_({ date: '2026-10-15', start: '17:40', groupId: 'g3' }),
    class_({ groupId: null, dutyId: 'd1', label: 'Encargado del club' }),
  ]);
  await new TakeRollCall(agenda, roster, rolls, new FrozenClock('2026-10-13T18:00:00+02:00'))
    .execute('t1', 'g1', '2026-10-13', { absent: [] });

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
    ['2026-10-15', 'g3', null, 0, 'open'],
    ['2026-10-13', null, null, 0, null],
  ]);
});

Deno.test('OpenRollCall and TakeRollCall should list the students of that day, none ticked until taken', async () => {
  const rolls = new InMemoryRollCalls();
  const clock = new FrozenClock('2026-10-13T18:00:00+02:00');
  const agenda = assignments([class_({})]);
  const open = () =>
    new OpenRollCall(agenda, roster, rolls, clock).execute('t1', 'g1', '2026-10-13');
  const take = (absent: string[], guests: string[] = []) =>
    new TakeRollCall(agenda, roster, rolls, clock).execute('t1', 'g1', '2026-10-13', {
      absent,
      guests,
    });

  // Sin pasar, nadie está marcado: el profesor marca a quien viene.
  assertEquals((await open()).list, [
    { id: 's1', name: 'Ana Pérez', present: false },
    { id: 's2', name: 'Pablo Gil', present: false },
  ]);
  assertEquals((await open()).rollCall, 'open');
  await take(['s2']);
  assertEquals((await open()).list.map((s) => s.present), [true, false]);
  assertEquals((await open()).rollCall, 'taken');
  await take([]);
  assertEquals((await open()).list.map((s) => s.present), [true, true], 'se corrige en plazo');
  // Asistencia especial: Lola no es de la clase; solo se puede elegir a alumnos del club.
  assertEquals((await open()).others, [{ id: 's3', name: 'Lola Ruiz' }]);
  await take([], ['s3']);
  const withGuest = await open();
  assertEquals([withGuest.guests, withGuest.others, withGuest.period], [
    [{ id: 's3', name: 'Lola Ruiz' }],
    [],
    'open',
  ]);
  await assertRejects(() => take([], ['s9']), InvalidValue, 'alta en el club');

  await assertRejects(
    () => new OpenRollCall(agenda, roster, rolls, clock).execute('t1', 'g1', '2026-10-14'),
    ClassNotGiven,
  );
  // Pasada: se cambia solo confirmándolo, y no apunta horas.
  const late = new FrozenClock('2026-10-15T09:00:00+02:00');
  const recorded: string[] = [];
  const recorder = { record: (item: ClassOnDay) => Promise.resolve(void recorded.push(item.date)) };
  const lateTake = (past: boolean) =>
    new TakeRollCall(agenda, roster, rolls, late, recorder).execute(
      't1',
      'g1',
      '2026-10-13',
      { absent: ['s1'], guests: ['s3'] },
      past,
    );
  await assertRejects(() => lateTake(false), RollCallClosed);
  assertEquals(
    (await new OpenRollCall(agenda, roster, rolls, late).execute('t1', 'g1', '2026-10-13')).period,
    'past',
  );
  await lateTake(true);
  assertEquals((await rolls.find('g1', LocalDate.fromString('2026-10-13')))?.absent(), ['s1']);
  assertEquals(recorded, []);
});

const MISSED = {
  sessionId: 'p1',
  groupId: 'g1',
  dutyId: null,
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
          specials: [],
        });
      },
    },
    new FrozenClock('2026-10-16T09:00:00+02:00'),
  ).execute('s1');
  assertEquals(asked, ['2026-09-01…2026-10-16']);
  assertEquals([view.season, view.classes, view.attended], [2026, 6, 5]);
});

Deno.test('GroupAttendance should show each class day of the month until today and who came', async () => {
  // Grupo de martes y jueves. Octubre de 2026, hoy jueves 15: jueves 1, martes 6, jueves 8, martes 13 y jueves 15.
  const data: GroupAttendanceData = {
    name: 'Iniciación A',
    weekdays: [2, 4],
    holidays: new Set(['2026-10-08']),
    rollCalls: [{ date: '2026-10-06', kind: 'taken' }, { date: '2026-10-13', kind: 'confirmed' }],
    enrolments: [
      { studentId: 'ana', name: 'Ana', from: '2026-09-01', until: null, days: null },
      // Pablo solo los jueves y se fue el 14; Luis entró el 10.
      { studentId: 'pablo', name: 'Pablo', from: '2026-09-01', until: '2026-10-14', days: [4] },
      { studentId: 'luis', name: 'Luis', from: '2026-10-10', until: null, days: null },
    ],
    absences: [{ date: '2026-10-06', studentId: 'ana' }],
    // Sara no es del grupo y vino el martes 6; Pablo (solo jueves) vino también ese martes.
    guests: [
      { date: '2026-10-06', studentId: 'sara', name: 'Sara' },
      { date: '2026-10-06', studentId: 'pablo', name: 'Pablo' },
    ],
  };
  const query: GroupAttendanceQuery = {
    between: (id) => Promise.resolve(id === 'g1' ? data : null),
  };
  const view = await new GroupAttendance(query, new FrozenClock('2026-10-15T10:00:00Z'))
    .execute('g1', '2026-10');
  assertEquals(view.days, [
    { date: '2026-10-01', status: 'pending' },
    { date: '2026-10-06', status: 'taken' },
    { date: '2026-10-08', status: 'holiday' },
    { date: '2026-10-13', status: 'confirmed' },
    { date: '2026-10-15', status: 'pending' },
  ]);
  assertEquals(view.students.map((s) => [s.name, s.marks, s.attended, s.classes, s.member]), [
    ['Ana', ['unknown', 'absent', null, 'unknown', 'unknown'], 0, 1, true],
    ['Luis', [null, null, null, 'unknown', 'unknown'], 0, 0, true],
    ['Pablo', ['unknown', 'special', null, null, null], 0, 0, true],
    ['Sara', [null, 'special', null, null, null], 0, 0, false],
  ]);
  await assertRejects(
    () =>
      new GroupAttendance(query, new FrozenClock('2026-10-15T10:00:00Z')).execute('x', '2026-10'),
    AttendanceGroupNotFound,
  );
});
