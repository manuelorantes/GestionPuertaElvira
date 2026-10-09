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

Deno.test('Friday attendance, tournament photos and adjustments should make the points of the month', async () => {
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

    const tournament = body<{ id: string }>(
      await client.json('POST', '/api/admin/points/tournaments', {
        name: 'Open de Granada',
        date: '2026-10-09',
        pointsPerPhoto: 2,
      }),
    ).id;
    assertEquals(
      (await client.json('PUT', `/api/admin/points/tournaments/${tournament}/students/${ana}`, {
        sent: true,
      }))
        .status,
      204,
    );
    const detail = body<{ photos: number; students: { name: string; sent: boolean }[] }>(
      await client.get(`/api/admin/points/tournaments/${tournament}`),
    );
    assertEquals(detail.photos, 1);
    assertEquals(detail.students.map((s) => [s.name, s.sent]), [['Ana Pérez Gil', true], [
      'Pablo Ruiz Sanz',
      false,
    ]]);
    assertError(
      await client.json('DELETE', `/api/admin/points/tournaments/${tournament}`, {}),
      409,
      'tournament_has_photos',
    );

    const points = async () =>
      body<{ items: { name: string; points: number; seasonEarned: number }[] }>(
        await client.get('/api/admin/points/students?month=2026-10'),
      ).items.map((s) => [s.name, s.points, s.seasonEarned]);
    assertEquals(await points(), [['Ana Pérez Gil', 3, 3], ['Pablo Ruiz Sanz', 1, 1]]);

    // En la cuenta de cobro se ven los puntos del mes y se canjean al cobrar.
    assertEquals(
      body<{ points: number }>(await client.get(`/api/admin/billing/accounts/${ana}`)).points,
      3,
    );
    const movements = body<{ items: { concept: string; delta: number; by: string | null }[] }>(
      await client.get(`/api/admin/points/movements?student=${ana}`),
    ).items;
    // Lo más reciente primero.
    assertEquals(movements.map((m) => [m.concept, m.delta]), [
      ['Foto en Open de Granada', 2],
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
