import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, db, resetDatabase } from '../support/http.ts';

const body = <T>(response: { body: unknown }) => response.body as T;

// Martes 13 de octubre de 2026 a las 18:00, al acabar la clase de Lucía de los martes.
const TUESDAY_EVENING = '2026-10-13T18:00:00+02:00';

interface CommentItem {
  id: string;
  groupName: string;
  date: string;
  studentName: string | null;
  text: string;
  author: string;
  editable?: boolean;
}

/** Lucía da los martes a Martina y Pablo; Lola, del grupo de Carlos, viene a recuperar. */
async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  await db()`UPDATE identity_user SET full_name = 'Junta Pruebas' WHERE email = 'junta@club.es'`;
  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  const lucia = await newTeacher(admin, 'Lucía Moreno Gil');
  const group = await newGroup(admin, lucia, {
    name: 'Martes 17:00',
    days: ['tue'],
    start: '17:00',
    end: '18:00',
    classroom: 'alfil',
  });
  const other = await newGroup(admin, await newTeacher(admin, 'Carlos Ruiz Márquez'), {
    name: 'Martes 19:00',
    days: ['tue'],
    start: '19:00',
    end: '20:00',
    classroom: 'caballo',
  });
  const student = async (fullName: string, groupId: string) =>
    body<{ id: string }>(
      await admin.json('POST', '/api/admin/students', { fullName, groupIds: [groupId] }),
    ).id;
  const martina = await student('Martina López Herrera', group);
  const pablo = await student('Pablo Gil Ruiz', group);
  const lola = await student('Lola Ruiz Pardo', other);
  await createUser('profe@club.es', 'teacher');
  await db()`UPDATE identity_user SET teacher_id = ${lucia} WHERE email = 'profe@club.es'`;
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  return { admin, teacher, group, martina, pablo, lola };
}

Deno.test('class comments are written from the roll call and seen in the group and the student sheet', async () => {
  const { admin, teacher, group, martina, pablo, lola } = await atTime(TUESDAY_EVENING, fixture);
  const roll = `/api/teacher/roll-calls/${group}/2026-10-13`;

  await atTime(TUESDAY_EVENING, async () => {
    await teacher.json('PUT', roll, { absent: [], guests: [lola] });
    const general = await teacher.json('POST', `${roll}/comments`, {
      studentId: null,
      text: 'Hoy hemos dado mates de torres',
    });
    assertEquals(general.status, 201, JSON.stringify(general.body));
    for (const [studentId, text] of [[pablo, 'Ha roto un reloj'], [lola, 'Viene a recuperar']]) {
      assertEquals(
        (await teacher.json('POST', `${roll}/comments`, { studentId, text })).status,
        201,
      );
    }
    assertError(
      await teacher.json('POST', `${roll}/comments`, { studentId: null, text: '  ' }),
      422,
      'unprocessable',
    );

    // Administración comenta también, desde Clases → Asistencia.
    const staff = await admin.json('POST', `/api/admin/attendance/groups/${group}/comments`, {
      date: '2026-10-13',
      studentId: martina,
      text: 'Llamar a su familia',
    });
    assertEquals(staff.status, 201, JSON.stringify(staff.body));
    const staffId = body<{ id: string }>(staff).id;

    // En la lista, el profesor ve todos los de esa clase y solo puede cambiar los suyos.
    const seen = body<{ items: CommentItem[] }>(await teacher.get(`${roll}/comments`)).items;
    assertEquals(
      seen.map((c) => [c.studentName, c.text, c.author, c.editable]),
      [
        [null, 'Hoy hemos dado mates de torres', 'Lucía Moreno Gil', true],
        ['Pablo Gil Ruiz', 'Ha roto un reloj', 'Lucía Moreno Gil', true],
        ['Lola Ruiz Pardo', 'Viene a recuperar', 'Lucía Moreno Gil', true],
        ['Martina López Herrera', 'Llamar a su familia', 'Junta Pruebas', false],
      ],
    );
    assertError(
      await teacher.json('PUT', `/api/teacher/comments/${staffId}`, { text: 'Otro' }),
      403,
      'forbidden',
    );
    const own = seen[1]?.id ?? '';
    assertEquals(
      (await teacher.json('PUT', `/api/teacher/comments/${own}`, {
        text: 'Ha roto un reloj sin querer',
      })).status,
      204,
    );

    const month = body<{ items: CommentItem[] }>(
      await admin.get(`/api/admin/attendance/groups/${group}/comments?month=2026-10`),
    ).items;
    assertEquals(month.map((c) => [c.date, c.studentName, c.text]), [
      ['2026-10-13', null, 'Hoy hemos dado mates de torres'],
      ['2026-10-13', 'Pablo Gil Ruiz', 'Ha roto un reloj sin querer'],
      ['2026-10-13', 'Lola Ruiz Pardo', 'Viene a recuperar'],
      ['2026-10-13', 'Martina López Herrera', 'Llamar a su familia'],
    ]);

    const ofPablo = body<{ items: CommentItem[] }>(
      await admin.get(`/api/admin/students/${pablo}/class-comments`),
    ).items;
    assertEquals(ofPablo.map((c) => [c.date, c.groupName, c.text, c.author]), [
      ['2026-10-13', 'Martes 17:00', 'Ha roto un reloj sin querer', 'Lucía Moreno Gil'],
    ]);

    assertEquals(
      (await admin.json('PUT', `/api/admin/attendance/comments/${own}`, { text: 'Revisado' }))
        .status,
      204,
    );
    assertEquals(
      (await admin.json('DELETE', `/api/admin/attendance/comments/${staffId}`)).status,
      204,
    );
    assertEquals((await teacher.json('DELETE', `/api/teacher/comments/${own}`)).status, 204);
    assertEquals(
      body<{ items: CommentItem[] }>(await teacher.get(`${roll}/comments`)).items.length,
      2,
    );
  });
});
