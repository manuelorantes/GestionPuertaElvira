import { assertEquals } from '@std/assert';

import type { LocalDate } from '../../src/domain/common/mod.ts';
import {
  type ClassAssignments,
  type ClassOnDay,
  type ClassRoster,
  TeacherClasses,
} from '../../src/application/attendance/mod.ts';

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
  agenda: () => Promise.resolve(items),
});

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

Deno.test('TeacherClasses should add the classroom and the students of that day to each class', async () => {
  const classes = await new TeacherClasses(
    assignments([
      class_({}),
      class_({ date: '2026-10-15' }),
      class_({ groupId: null, dutyId: 'd1', label: 'Encargado del club' }),
    ]),
    roster,
  ).execute('t1', '2026-10-12', '2026-10-18');

  assertEquals(classes.map((c) => [c.date, c.classroom, c.students]), [
    ['2026-10-13', 'alfil', 2],
    ['2026-10-15', 'alfil', 1],
    ['2026-10-13', null, 0],
  ]);
});
