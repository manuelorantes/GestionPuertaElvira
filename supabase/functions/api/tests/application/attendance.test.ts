import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  type ClassComment,
  type RollCall,
  RollCallClosed,
  RollCallNotOpenYet,
} from '../../src/domain/attendance/mod.ts';
import {
  AttendanceGroupNotFound,
  type ClassAssignments,
  ClassCommentNotFound,
  type ClassCommentQuery,
  type ClassCommentRepository,
  type ClassCommentView,
  ClassNotGiven,
  type ClassOnDay,
  type ClassRoster,
  CommentClass,
  ConfirmWithoutRollCall,
  EditClassComment,
  GroupAttendance,
  type GroupAttendanceData,
  type GroupAttendanceQuery,
  GroupNotYours,
  type MissedRollCallQuery,
  MissedRollCalls,
  NotYourComment,
  OpenRollCall,
  type RollCallRepository,
  RollCallStillOpen,
  StudentAttendance,
  TakeRollCall,
  TeacherClasses,
  TeacherGroupAccess,
  TeacherGroupAttendance,
  TeacherGroupComments,
  TeacherGroups,
  type TeacherRosterQuery,
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
      // Hugo se inscribió con fecha del 1 después de que el martes 6 le añadieran en asistencia especial.
      { studentId: 'hugo', name: 'Hugo', from: '2026-10-01', until: null, days: null },
    ],
    absences: [{ date: '2026-10-06', studentId: 'ana' }],
    // Sara no es del grupo y vino el martes 6; Pablo (solo jueves) vino también ese martes.
    guests: [
      { date: '2026-10-06', studentId: 'sara', name: 'Sara' },
      { date: '2026-10-06', studentId: 'pablo', name: 'Pablo' },
      { date: '2026-10-06', studentId: 'hugo', name: 'Hugo' },
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
    // Ya era del grupo ese día: su asistencia especial cuenta como asistencia normal.
    ['Hugo', ['unknown', 'present', null, 'unknown', 'unknown'], 1, 1, true],
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

class InMemoryComments implements ClassCommentRepository {
  readonly saved = new Map<string, ClassComment>();

  find(id: string): Promise<ClassComment | null> {
    return Promise.resolve(this.saved.get(id) ?? null);
  }

  save(comment: ClassComment): Promise<void> {
    this.saved.set(comment.id, comment);
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.saved.delete(id);
    return Promise.resolve();
  }
}

function commenting(now: string) {
  const rolls = new InMemoryRollCalls();
  const comments = new InMemoryComments();
  const clock = new FrozenClock(now);
  const agenda = assignments([class_({})]);
  return {
    rolls,
    comments,
    clock,
    agenda,
    comment: new CommentClass(agenda, roster, rolls, comments, clock),
    edit: new EditClassComment(comments, clock),
  };
}

Deno.test('CommentClass should let the teacher comment the class and its students once the roll call opens', async () => {
  const { comment, comments } = commenting('2026-10-13T17:30:00+02:00');
  const about = await comment.asTeacher('t1', 'u1', 'g1', '2026-10-13', {
    studentId: 's2',
    text: 'Ha roto un reloj',
  });
  const general = await comment.asTeacher('t1', 'u1', 'g1', '2026-10-13', {
    studentId: null,
    text: 'Hoy hemos dado mates de torres',
  });
  assertEquals(comments.saved.get(about)?.student, 's2');
  assertEquals(comments.saved.get(about)?.author, { teacher: 't1', user: 'u1' });
  assertEquals(comments.saved.get(general)?.text(), 'Hoy hemos dado mates de torres');

  await assertRejects(
    () =>
      comment.asTeacher('t2', 'u2', 'g1', '2026-10-15', { studentId: null, text: 'Otra clase' }),
    ClassNotGiven,
  );
  await assertRejects(
    () => comment.asTeacher('t1', 'u1', 'g1', '2026-10-13', { studentId: 's3', text: 'No vino' }),
    InvalidValue,
    'alumnos de esa clase',
  );
  const early = commenting('2026-10-13T16:00:00+02:00');
  await assertRejects(
    () =>
      early.comment.asTeacher('t1', 'u1', 'g1', '2026-10-13', { studentId: null, text: 'Pronto' }),
    RollCallNotOpenYet,
  );
  // Una clase pasada se comenta sin confirmar nada: no cambia la asistencia.
  const later = commenting('2026-10-20T10:00:00+02:00');
  await later.comment.asTeacher('t1', 'u1', 'g1', '2026-10-13', { studentId: null, text: 'Bien' });
  assertEquals(later.comments.saved.size, 1);
});

Deno.test('CommentClass should accept students that came to the class from another one', async () => {
  const { comment, rolls, clock, agenda } = commenting('2026-10-13T18:00:00+02:00');
  await new TakeRollCall(agenda, roster, rolls, clock).execute('t1', 'g1', '2026-10-13', {
    absent: [],
    guests: ['s3'],
  });
  const id = await comment.asTeacher('t1', 'u1', 'g1', '2026-10-13', {
    studentId: 's3',
    text: 'Ha venido a recuperar',
  });
  assertEquals(id.length > 0, true);
});

Deno.test('CommentClass should let administration comment a class that already happened', async () => {
  const { comment, comments } = commenting('2026-10-14T10:00:00+02:00');
  const id = await comment.asStaff('u9', 'g1', '2026-10-13', { studentId: 's1', text: 'Avisar' });
  assertEquals(comments.saved.get(id)?.author, { teacher: null, user: 'u9' });
  await assertRejects(
    () => comment.asStaff('u9', 'g1', '2026-10-15', { studentId: null, text: 'Futuro' }),
    InvalidValue,
    'aún no',
  );
  await assertRejects(
    () => comment.asStaff('u9', 'nope', '2026-10-13', { studentId: null, text: 'x' }),
    AttendanceGroupNotFound,
  );
});

Deno.test('EditClassComment should let teachers change only their comments and administration any', async () => {
  const { comment, comments, edit } = commenting('2026-10-13T18:00:00+02:00');
  const id = await comment.asTeacher('t1', 'u1', 'g1', '2026-10-13', {
    studentId: 's1',
    text: 'Ha llegado tarde',
  });
  await edit.rewrite(id, 'Ha llegado a mitad de clase', { teacher: 't1' });
  assertEquals(comments.saved.get(id)?.text(), 'Ha llegado a mitad de clase');
  await assertRejects(() => edit.rewrite(id, 'Otro', { teacher: 't2' }), NotYourComment);
  await assertRejects(() => edit.remove(id, { teacher: 't2' }), NotYourComment);
  await edit.rewrite(id, 'Revisado por la junta', 'staff');
  assertEquals(comments.saved.get(id)?.text(), 'Revisado por la junta');
  await edit.remove(id, { teacher: 't1' });
  assertEquals(comments.saved.size, 0);
  await assertRejects(() => edit.remove(id, 'staff'), ClassCommentNotFound);
});

// ---- Mis grupos ------------------------------------------------------------------------------

/** Lucía es titular de g1 y sustituye a Carlos en g2 el martes 13 de octubre. */
const teacherGroups = (): TeacherRosterQuery => ({
  taughtGroupIds: (teacher) => Promise.resolve(teacher === 'lucia' ? ['g1'] : []),
  substitutedGroupIds: (teacher, from, to) =>
    Promise.resolve(
      teacher === 'lucia' && from.toString() <= '2026-10-13' && '2026-10-13' <= to.toString()
        ? ['g2']
        : [],
    ),
  rostersOf: (ids) =>
    Promise.resolve(
      [
        {
          groupId: 'g1',
          name: 'Iniciación A',
          days: ['tue', 'thu'],
          start: '17:00',
          end: '18:30',
          classroom: 'alfil',
          students: [
            { id: 'ana', name: 'Ana', days: ['tue', 'thu'] },
            { id: 'luis', name: 'Luis', days: ['thu'] },
          ],
        },
        {
          groupId: 'g2',
          name: 'Avanzado',
          days: ['tue'],
          start: '18:30',
          end: '20:00',
          classroom: 'torre',
          students: [],
        },
      ].filter((g) => ids.includes(g.groupId)),
    ),
});

const access = (now: string) => new TeacherGroupAccess(teacherGroups(), new FrozenClock(now));

Deno.test('TeacherGroupAccess should show the groups taught and those substituted within a week', async () => {
  const visible = async (now: string) => [...(await access(now).visible('lucia')).entries()];
  assertEquals(await visible('2026-10-06T10:00:00+02:00'), [['g1', false], ['g2', true]]);
  assertEquals(await visible('2026-10-05T10:00:00+02:00'), [['g1', false]]);
  assertEquals(await visible('2026-10-20T22:00:00+02:00'), [['g1', false], ['g2', true]]);
  assertEquals(await visible('2026-10-21T10:00:00+02:00'), [['g1', false]]);
  await access('2026-10-21T10:00:00+02:00').assert('lucia', 'g1');
  await assertRejects(
    () => access('2026-10-21T10:00:00+02:00').assert('lucia', 'g2'),
    GroupNotYours,
  );
  await assertRejects(
    () => access('2026-10-13T10:00:00+02:00').assert('carlos', 'g1'),
    GroupNotYours,
  );
});

/** Asistencia de g1: Ana vino el 29/09 y faltó el 06/10; Luis vino el 08/10. */
const seasonAttendance = (asked: string[] = []): GroupAttendanceQuery => ({
  between: (id, from, to) => {
    asked.push(`${id} ${from}…${to}`);
    return Promise.resolve({
      name: id,
      weekdays: [2, 4],
      holidays: new Set<string>(),
      rollCalls: id === 'g1'
        ? [
          { date: '2026-09-29', kind: 'taken' as const },
          { date: '2026-10-06', kind: 'taken' as const },
          { date: '2026-10-08', kind: 'taken' as const },
        ]
        : [],
      enrolments: id === 'g1'
        ? [
          { studentId: 'ana', name: 'Ana', from: '2026-09-01', until: null, days: [2] },
          { studentId: 'luis', name: 'Luis', from: '2026-10-01', until: null, days: [4] },
        ]
        : [],
      absences: [{ date: '2026-10-06', studentId: 'ana' }],
      guests: [],
    });
  },
});

Deno.test('GroupAttendance should add up the whole season so far', async () => {
  const asked: string[] = [];
  const view = await new GroupAttendance(
    seasonAttendance(asked),
    new FrozenClock('2026-10-15T10:00:00Z'),
  )
    .season('g1');
  assertEquals(asked, ['g1 2026-09-01…2026-10-15']);
  assertEquals(view.students.map((s) => [s.name, s.attended, s.classes]), [
    ['Ana', 1, 2],
    ['Luis', 1, 1],
  ]);
});

Deno.test('TeacherGroups should list each visible group with its students and their season attendance', async () => {
  const clock = new FrozenClock('2026-10-15T10:00:00+02:00');
  const groups = await new TeacherGroups(
    new TeacherGroupAccess(teacherGroups(), clock),
    teacherGroups(),
    new GroupAttendance(seasonAttendance(), clock),
    clock,
  ).execute('lucia');
  assertEquals(groups.map((g) => [g.name, g.substitution]), [['Iniciación A', false], [
    'Avanzado',
    true,
  ]]);
  assertEquals(groups[0]?.students, [
    { id: 'ana', name: 'Ana', days: ['tue', 'thu'], attended: 1, classes: 2 },
    { id: 'luis', name: 'Luis', days: ['thu'], attended: 1, classes: 1 },
  ]);
});

Deno.test('TeacherGroupAttendance should show a month of a visible group only', async () => {
  const clock = new FrozenClock('2026-10-15T10:00:00+02:00');
  const attendance = new TeacherGroupAttendance(
    new TeacherGroupAccess(teacherGroups(), clock),
    new GroupAttendance(seasonAttendance(), clock),
  );
  const view = await attendance.execute('lucia', 'g1', '2026-10');
  assertEquals(view.month, '2026-10');
  await assertRejects(() => attendance.execute('carlos', 'g1', '2026-10'), GroupNotYours);
});

const comment = (date: string, writtenAt: string, text: string): ClassCommentView => ({
  id: text,
  groupId: 'g1',
  groupName: 'Iniciación A',
  date,
  studentId: null,
  studentName: null,
  text,
  author: 'Lucía',
  authorTeacherId: 'lucia',
  writtenAt,
});

Deno.test('TeacherGroupComments should show the last four weeks, newest first, and then the previous ones', async () => {
  const asked: string[] = [];
  const query: ClassCommentQuery = {
    ofClass: () => Promise.resolve([]),
    ofStudent: () => Promise.resolve([]),
    ofGroup: (_group, from, to) => {
      asked.push(`${from}…${to}`);
      return Promise.resolve([
        comment('2026-09-29', '2026-09-29T18:00:00Z', 'martes'),
        comment('2026-10-01', '2026-10-01T18:00:00Z', 'jueves'),
        comment('2026-10-01', '2026-10-01T18:30:00Z', 'jueves, después'),
      ].filter((c) => from.toString() <= c.date && c.date <= to.toString()));
    },
  };
  // El jueves 1 de octubre se comenta; el martes 6 se repasa.
  const clock = new FrozenClock('2026-10-06T16:00:00+02:00');
  const comments = new TeacherGroupComments(
    new TeacherGroupAccess(teacherGroups(), clock),
    query,
    clock,
  );
  const recent = await comments.execute('lucia', 'g1', null);
  assertEquals(recent.items.map((c) => c.text), ['jueves, después', 'jueves', 'martes']);
  assertEquals(recent.nextBefore, '2026-09-08');
  const older = await comments.execute('lucia', 'g1', '2026-09-08');
  // La ventana se corta al principio de la temporada.
  assertEquals(older.nextBefore, null);
  assertEquals(asked, ['2026-09-09…2026-10-06', '2026-09-01…2026-09-08']);
  await assertRejects(() => comments.execute('carlos', 'g1', null), GroupNotYours);
});
