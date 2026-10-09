import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, resetDatabase } from '../support/http.ts';

const body = <T>(response: { body: unknown }) => response.body as T;
// Viernes 9 de octubre de 2026, por la tarde.
const FRIDAY_EVENING = '2026-10-09T19:00:00+02:00';

async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const group = await newGroup(client, await newTeacher(client));
  const ids: string[] = [];
  for (
    const [fullName, groupIds] of [['Ana Pérez Gil', [group]], ['Pablo Ruiz Sanz', []]] as const
  ) {
    const created = await client.json('POST', '/api/admin/students', { fullName, groupIds });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    ids.push(body<{ id: string }>(created).id);
  }
  return { client, ana: ids[0] ?? '', pablo: ids[1] ?? '' };
}

Deno.test('Friday attendance and tournament photos should make the points of the month', async () => {
  await atTime(FRIDAY_EVENING, async () => {
    const { client, ana, pablo } = await fixture();
    const friday = (date: string, student: string, present: boolean) =>
      client.json('PUT', `/api/admin/points/fridays/${date}/students/${student}`, { present });

    // Los viernes de octubre; Pablo es socio sin clase y también sale.
    const grid = body<{ fridays: { date: string }[]; students: { name: string }[] }>(
      await client.get('/api/admin/points/fridays?month=2026-10'),
    );
    assertEquals(grid.fridays.map((f) => f.date), [
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
      '2026-10-23',
      '2026-10-30',
    ]);
    assertEquals(grid.students.map((s) => s.name), ['Ana Pérez Gil', 'Pablo Ruiz Sanz']);

    assertEquals((await friday('2026-10-09', ana, true)).status, 204);
    assertEquals((await friday('2026-10-09', pablo, true)).status, 204);
    assertError(await friday('2026-10-16', ana, true), 422, 'unprocessable');
    assertError(await friday('2026-10-08', ana, true), 422, 'unprocessable');

    // La foto de Ana con la equipación oficial en un torneo: 1 punto en el mes de la foto.
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
    const photoForm = (student: string, file: Uint8Array) => {
      const form = new FormData();
      form.append('studentId', student);
      form.append('date', '2026-10-09');
      form.append('note', 'Open de Granada');
      form.append(
        'file',
        new File([file as unknown as ArrayBuffer], 'foto.jpg', { type: 'image/jpeg' }),
      );
      return form;
    };
    const uploaded = await client.request('POST', '/api/admin/points/photos', {
      body: photoForm(ana, JPEG),
      headers: { 'X-Requested-With': 'fetch' },
    });
    assertEquals(uploaded.status, 201, JSON.stringify(uploaded.body));
    const photoId = body<{ id: string }>(uploaded).id;
    assertError(
      await client.request('POST', '/api/admin/points/photos', {
        body: photoForm(ana, new TextEncoder().encode('%PDF-1.4 no es una foto')),
        headers: { 'X-Requested-With': 'fetch' },
      }),
      422,
      'unprocessable',
    );
    const gallery =
      body<{ items: { id: string; studentName: string; note: string; points: number }[] }>(
        await client.get('/api/admin/points/photos?month=2026-10'),
      ).items;
    assertEquals(gallery.map((p) => [p.studentName, p.note, p.points]), [[
      'Ana Pérez Gil',
      'Open de Granada',
      1,
    ]]);
    const file = await client.raw('GET', `/api/admin/points/photos/${photoId}/file`);
    assertEquals([file.status, file.headers.get('content-type')], [200, 'image/jpeg']);
    assertEquals(new Uint8Array(await file.arrayBuffer()), JPEG);

    const points = async () =>
      body<{ items: { name: string; points: number; seasonEarned: number }[] }>(
        await client.get('/api/admin/points/students?month=2026-10'),
      ).items.map((s) => [s.name, s.points, s.seasonEarned]);
    assertEquals(await points(), [['Ana Pérez Gil', 2, 2], ['Pablo Ruiz Sanz', 1, 1]]);

    // En la cuenta de cobro se ven los puntos del mes y se canjean al cobrar.
    assertEquals(
      body<{ points: number }>(await client.get(`/api/admin/billing/accounts/${ana}`)).points,
      2,
    );
    const movements = body<{ items: { concept: string; delta: number; by: string | null }[] }>(
      await client.get(`/api/admin/points/movements?student=${ana}`),
    ).items;
    // Lo más reciente primero.
    assertEquals(movements.map((m) => [m.concept, m.delta]), [
      ['Foto de torneo · Open de Granada', 1],
      ['Viernes 09/10', 1],
    ]);
    assertEquals(movements[0]?.by, 'Lucía Moreno Gil');
  });
});

Deno.test('points should expire at the end of the month and be redeemed in payments', async () => {
  const { client, ana } = await atTime(FRIDAY_EVENING, async () => {
    const fx = await fixture();
    await fx.client.json('POST', '/api/admin/points/adjustments', {
      studentId: fx.ana,
      delta: 5,
      note: 'Premio',
    });
    return fx;
  });
  await atTime(FRIDAY_EVENING, async () => {
    const paid = await client.json('POST', '/api/admin/billing/payments', {
      studentId: ana,
      kind: 'monthly',
      months: 1,
      method: 'cash',
      date: '2026-10-09',
      redeemPoints: 5,
    });
    assertEquals(paid.status, 201, JSON.stringify(paid.body));
    const redeemed = body<{ items: { kind: string; delta: number }[] }>(
      await client.get('/api/admin/points/movements?kind=redemption&month=2026-10'),
    ).items;
    assertEquals(redeemed.map((m) => [m.kind, m.delta]), [['redemption', -5]]);
    assertEquals(
      body<{ points: number }>(await client.get(`/api/admin/billing/accounts/${ana}`)).points,
      0,
    );
  });
  await atTime('2026-11-02T10:00:00+01:00', async () => {
    await client.logIn('junta@club.es');
    await client.json('POST', '/api/admin/points/adjustments', {
      studentId: ana,
      delta: 1,
      note: 'Ayuda en el torneo',
    });
    const october = body<{ items: { points: number; seasonRedeemed: number }[] }>(
      await client.get('/api/admin/points/students?month=2026-10'),
    ).items[0];
    const november = body<{ items: { points: number }[] }>(
      await client.get('/api/admin/points/students?month=2026-11'),
    ).items[0];
    assertEquals([october?.points, october?.seasonRedeemed, november?.points], [0, 5, 1]);
  });
});
