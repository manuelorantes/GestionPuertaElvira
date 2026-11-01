import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, db, resetDatabase } from '../support/http.ts';
import { inTransaction } from '../../src/infrastructure/persistence/sql.ts';
import { runCommand } from '../../scripts/console.ts';

/** Un 20 de noviembre: las altas de hoy dejan elegir qué se cobra de noviembre. */
const LATE = '2026-11-20T10:00:00+01:00';

interface Fixture {
  client: ApiClient;
  group: string;
}

async function fixture(): Promise<Fixture> {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  return { client, group: await newGroup(client, await newTeacher(client)) };
}

interface Account {
  charges: { period: string; amountCents: number; manual: boolean; note: string | null }[];
}

async function register(
  fx: Fixture,
  joinedOn: string,
  firstMonth?: Record<string, unknown>,
): Promise<string> {
  const response = await fx.client.json('POST', '/api/admin/students', {
    fullName: 'Martina López Herrera',
    groupIds: [fx.group],
    joinedOn,
    ...(firstMonth ? { firstMonth } : {}),
  });
  assertEquals(response.status, 201, JSON.stringify(response.body));
  return (response.body as { id: string }).id;
}

async function monthlyCharges(fx: Fixture, id: string): Promise<Account['charges']> {
  return ((await fx.client.get(`/api/admin/billing/accounts/${id}`)).body as Account).charges;
}

async function chargedThisMonth(fx: Fixture): Promise<string[]> {
  const listed = (await fx.client.get('/api/admin/billing/charges?month=2026-11&kind=monthly'))
    .body as { items: { studentName: string }[] };
  return listed.items.map((i) => i.studentName);
}

Deno.test('a late join should charge the whole first month by default', async () => {
  await atTime(LATE, async () => {
    const fx = await fixture();
    const id = await register(fx, '2026-11-20');
    assertEquals((await monthlyCharges(fx, id)).map((c) => [c.period, c.amountCents]), [
      ['2026-11', 4500],
    ]);
  });
});

Deno.test('a late join should charge only the part of the first month agreed', async () => {
  await atTime(LATE, async () => {
    const fx = await fixture();
    const id = await register(fx, '2026-11-20', { mode: 'part', amountCents: 2000 });
    const [charge] = await monthlyCharges(fx, id);
    assertEquals(charge?.amountCents, 2000);
    assertEquals(charge?.manual, true);
    assertEquals(charge?.note, 'Alta el 20/11: parte del mes');
  });
});

Deno.test('a late join that pays nothing this month should have no fee anywhere until the next one', async () => {
  await atTime(LATE, async () => {
    const fx = await fixture();
    const id = await register(fx, '2026-11-20', { mode: 'none' });
    assertEquals(await monthlyCharges(fx, id), []);
    assertEquals(await chargedThisMonth(fx), []);
    // La tarea de la noche no se la crea.
    await inTransaction(db(), (tx) => runCommand(tx, 4, ['app:billing:generate-charges']));
    assertEquals(await monthlyCharges(fx, id), []);
    const quote = await fx.client.json('POST', '/api/admin/billing/quote', {
      studentId: id,
      kind: 'monthly',
      months: 1,
      method: 'cash',
      date: '2026-11-20',
    });
    assertEquals((quote.body as { periods: string[] }).periods, ['2026-12']);
  });
});

Deno.test('a join before the 16th or with a date of an earlier month should not choose the first month', async () => {
  await atTime(LATE, async () => {
    const fx = await fixture();
    for (const joinedOn of ['2026-11-15', '2026-10-25']) {
      assertError(
        await fx.client.json('POST', '/api/admin/students', {
          fullName: 'Pablo Gil Ruiz',
          groupIds: [fx.group],
          joinedOn,
          firstMonth: { mode: 'none' },
        }),
        422,
        'unprocessable',
      );
    }
    assertError(
      await fx.client.json('POST', '/api/admin/students', {
        fullName: 'Pablo Gil Ruiz',
        groupIds: [fx.group],
        joinedOn: '2026-11-20',
        firstMonth: { mode: 'part', amountCents: 4500 },
      }),
      422,
      'unprocessable',
    );
    // Nada se queda a medias: el alta fallida no deja alumno.
    const list = (await fx.client.get('/api/admin/students')).body as { items: unknown[] };
    assertEquals(list.items.length, 0);
  });
});

Deno.test('rejoining late should also choose what is charged of that month', async () => {
  const fx = await atTime('2026-11-02T10:00:00+01:00', fixture);
  const id = await atTime('2026-11-02T10:00:00+01:00', async () => {
    const id = await register(fx, '2026-11-02');
    const withdrawn = await fx.client.json('POST', `/api/admin/students/${id}/withdrawal`, {
      date: '2026-11-02',
    });
    assertEquals(withdrawn.status, 204, JSON.stringify(withdrawn.body));
    return id;
  });
  await atTime(LATE, async () => {
    await fx.client.logIn('junta@club.es');
    const rejoined = await fx.client.json('POST', `/api/admin/students/${id}/rejoin`, {
      date: '2026-11-20',
      groupIds: [fx.group],
      firstMonth: { mode: 'part', amountCents: 1500 },
    });
    assertEquals(rejoined.status, 204, JSON.stringify(rejoined.body));
    const [charge] = await monthlyCharges(fx, id);
    assertEquals([charge?.period, charge?.amountCents], ['2026-11', 1500]);
  });
});

Deno.test('moving the join date to a later month should delete the earlier fees and move their payments', async () => {
  await atTime('2026-11-02T10:00:00+01:00', async () => {
    const fx = await fixture();
    const id = await register(fx, '2026-10-01');
    await inTransaction(
      db(),
      (tx) => runCommand(tx, 4, ['app:billing:generate-charges', '--month=2026-10']),
    );
    assertEquals((await monthlyCharges(fx, id)).map((c) => c.period), ['2026-10', '2026-11']);
    const paid = await fx.client.json('POST', '/api/admin/billing/payments', {
      studentId: id,
      kind: 'monthly',
      months: 1,
      method: 'card',
      date: '2026-11-02',
    });
    assertEquals(paid.status, 201, JSON.stringify(paid.body));
    const payment = (paid.body as { id: string }).id;

    const moved = await fx.client.json('PUT', `/api/admin/students/${id}/joined-on`, {
      date: '2026-11-01',
    });
    assertEquals(moved.status, 204, JSON.stringify(moved.body));

    assertEquals((await monthlyCharges(fx, id)).map((c) => c.period), ['2026-11']);
    const receipt = (await fx.client.get(`/api/admin/billing/payments/${payment}`)).body as {
      concept: string;
      periods: string[];
    };
    assertEquals([receipt.concept, receipt.periods], ['Noviembre 2026', ['2026-11']]);
  });
});
