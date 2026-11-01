import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, atTime, createUser, resetDatabase } from '../support/http.ts';

interface Account {
  membershipPaid: boolean;
  totals: { kind: string; paidCents: number; pendingCents: number }[];
}

async function membershipPending(client: ApiClient, id: string): Promise<number> {
  const account = (await client.get(`/api/admin/billing/accounts/${id}`)).body as Account;
  return account.totals.find((t) => t.kind === 'membership')?.pendingCents ?? -1;
}

Deno.test('rejoining in the same season should owe again the membership fee cancelled on withdrawal', async () => {
  const { client, id, group } = await atTime('2026-10-01T10:00:00+02:00', async () => {
    await resetDatabase();
    await createUser('junta@club.es');
    const client = new ApiClient();
    await client.logIn('junta@club.es');
    const group = await newGroup(client, await newTeacher(client));
    const created = await client.json('POST', '/api/admin/students', {
      fullName: 'Martina López Herrera',
      groupIds: [group],
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    const id = (created.body as { id: string }).id;
    assertEquals(await membershipPending(client, id), 5000);
    // Se va sin pagar: se cancela su cuota de socio.
    const charges = (await client.get('/api/admin/billing/charges?month=2026-09&kind=membership'))
      .body as { items: { id: string }[] };
    const membership = charges.items[0]?.id;
    assertEquals(
      (await client.json('POST', `/api/admin/billing/charges/${membership}/cancel`)).status,
      204,
    );
    const left = await client.json('POST', `/api/admin/students/${id}/withdrawal`, {
      date: '2026-10-01',
    });
    assertEquals(left.status, 204, JSON.stringify(left.body));
    assertEquals(await membershipPending(client, id), 0);
    return { client, id, group };
  });

  await atTime('2026-10-14T10:00:00+02:00', async () => {
    await client.logIn('junta@club.es');
    const back = await client.json('POST', `/api/admin/students/${id}/rejoin`, {
      date: '2026-10-14',
      groupIds: [group],
    });
    assertEquals(back.status, 204, JSON.stringify(back.body));
    assertEquals(await membershipPending(client, id), 5000);
  });
});
