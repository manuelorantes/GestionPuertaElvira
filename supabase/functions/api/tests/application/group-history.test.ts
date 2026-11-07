import { assertEquals } from '@std/assert';

import { groupHistory, type StudentEnrolmentFact } from '../../src/application/classes/mod.ts';

const enrolment = (
  studentName: string,
  groupName: string,
  enrolledOn: string,
  endsOn: string | null = null,
): StudentEnrolmentFact => ({
  studentId: studentName,
  studentName,
  groupId: groupName,
  groupName,
  enrolledOn,
  endsOn,
});

Deno.test('groupHistory lists who joins and leaves a group, newest first, with the reason when known', () => {
  const history = groupHistory('Iniciación A', {
    enrolments: [
      enrolment('Ana Ruiz', 'Iniciación A', '2026-09-15'),
      // Pablo pasa de Intermedio B a Iniciación A y luego a Avanzado C.
      enrolment('Pablo Gil', 'Intermedio B', '2026-09-01', '2026-10-01'),
      enrolment('Pablo Gil', 'Iniciación A', '2026-10-01', '2026-10-20'),
      enrolment('Pablo Gil', 'Avanzado C', '2026-10-20'),
      // Luis se da de baja del club.
      enrolment('Luis Mora', 'Iniciación A', '2026-09-01', '2026-10-10'),
      // Marta sale del grupo sin más.
      enrolment('Marta Sanz', 'Iniciación A', '2026-09-01', '2026-10-05'),
      // Inscrita por error: entra y sale el mismo día.
      enrolment('Eva Gil', 'Iniciación A', '2026-10-02', '2026-10-02'),
    ],
    withdrawals: [{ studentId: 'Luis Mora', withdrawnOn: '2026-10-10' }],
  });

  assertEquals(
    history.map((h) => [h.date, h.movement, h.studentName, h.reason, h.otherGroup]),
    [
      ['2026-10-20', 'left', 'Pablo Gil', 'moved_to', 'Avanzado C'],
      ['2026-10-10', 'left', 'Luis Mora', 'withdrawn', null],
      ['2026-10-05', 'left', 'Marta Sanz', null, null],
      ['2026-10-01', 'joined', 'Pablo Gil', 'moved_from', 'Intermedio B'],
      ['2026-09-15', 'joined', 'Ana Ruiz', null, null],
      ['2026-09-01', 'joined', 'Luis Mora', null, null],
      ['2026-09-01', 'joined', 'Marta Sanz', null, null],
    ],
  );
});
