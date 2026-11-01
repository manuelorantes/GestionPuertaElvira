import { assertEquals } from '@std/assert';

import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

interface Item {
  status: string;
  movement: Record<string, unknown>;
  matched: { source: string; sourceId: string }[];
  proposal: {
    items: { source: string; sourceId: string; method: string }[];
    record: { concept: string; category: string } | null;
    transfer: { from: string; to: string } | null;
  } | null;
}

interface View {
  from: string;
  to: string;
  bank: { openingCents: number; closingCents: number };
  app: { openingCents: number; closingCents: number };
  items: Item[];
}

// Un extracto con 1.000 € de partida, del más reciente al más antiguo, como lo da el banco.
const MOVEMENTS = [
  {
    operationDate: '2025-10-20',
    valueDate: '2025-10-20',
    concept: 'Recibo Aguas Del Sur Sa Nº Recibo 0049',
    amountCents: -4376,
    balanceCents: 70_624,
  },
  {
    operationDate: '2025-10-06',
    valueDate: '2025-10-06',
    concept: 'Disposicion Efectivo En Oficina',
    amountCents: -20_000,
    balanceCents: 75_000,
  },
  {
    operationDate: '2025-10-02',
    valueDate: '2025-10-02',
    concept: 'Transferencia Inmediata A Favor De Pinturas Gil Concepto Alquiler',
    amountCents: -5_000,
    balanceCents: 95_000,
  },
];

async function clients() {
  await resetDatabase();
  await createUser('super@club.es', 'superadministrator');
  await createUser('junta@club.es');
  const superadmin = new ApiClient();
  await superadmin.logIn('super@club.es');
  const admin = new ApiClient();
  await admin.logIn('junta@club.es');
  return { superadmin, admin };
}

Deno.test('reconciliation should suggest from a bank statement and remember what is accepted', async () => {
  const { superadmin } = await clients();
  const rent = await superadmin.json('POST', '/api/admin/accounting/entries', {
    date: '2025-10-01',
    kind: 'expense',
    concept: 'Alquiler',
    category: 'rent',
    method: 'cash',
    amount: '50',
  });
  const rentId = (rent.body as { id: string }).id;

  const first = await superadmin.json('POST', '/api/admin/accounting/reconciliation', {
    movements: MOVEMENTS,
  });
  assertEquals(first.status, 200, JSON.stringify(first.body));
  const view = first.body as View;
  assertEquals([view.from, view.to], ['2025-10-02', '2025-10-20']);
  assertEquals(view.bank, { openingCents: 100_000, closingCents: 70_624 });
  assertEquals(view.items.map((i) => i.status), ['suggested', 'suggested', 'suggested']);
  const [alquiler, efectivo, agua] = view.items as [Item, Item, Item];
  assertEquals(alquiler.proposal!.items.map((i) => i.sourceId), [rentId]);
  assertEquals(efectivo.proposal!.transfer, { from: 'bank', to: 'cash' });
  assertEquals(agua.proposal!.record!.category, 'water');

  for (
    const accepted of [
      { movement: alquiler.movement, items: [{ source: 'manual', sourceId: rentId }] },
      { movement: efectivo.movement, items: [], transfer: true },
      { movement: agua.movement, items: [], record: { concept: 'Agua', category: 'water' } },
    ]
  ) {
    const response = await superadmin.json(
      'POST',
      '/api/admin/accounting/reconciliation/accept',
      accepted,
    );
    assertEquals(response.status, 204, JSON.stringify(response.body));
  }

  const again = (await superadmin.json('POST', '/api/admin/accounting/reconciliation', {
    movements: MOVEMENTS,
  })).body as View;
  assertEquals(again.items.map((i) => i.status), ['matched', 'matched', 'matched']);
  const ledger = (await superadmin.get('/api/admin/accounting/ledger?month=2025-10')).body as {
    items: { concept: string; method: string; amountCents: number }[];
  };
  assertEquals(
    ledger.items.map((i) => [i.concept, i.method, i.amountCents]).sort(),
    [['Agua', 'transfer', 4376], ['Alquiler', 'transfer', 5000]],
  );
  const transfers = (await superadmin.get('/api/admin/accounting/transfers')).body as {
    items: { from: string; to: string; amountCents: number }[];
  };
  assertEquals(transfers.items.map((t) => [t.from, t.to, t.amountCents]), [[
    'bank',
    'cash',
    20_000,
  ]]);

  assertError(
    await superadmin.json('POST', '/api/admin/accounting/reconciliation/accept', {
      movement: agua.movement,
      items: [],
      record: { concept: 'Agua', category: 'water' },
    }),
    409,
    'already_matched',
  );
});

Deno.test('reconciliation should refuse a statement whose balances do not chain', async () => {
  const { superadmin } = await clients();
  const broken = [MOVEMENTS[0]!, MOVEMENTS[2]!];
  assertError(
    await superadmin.json('POST', '/api/admin/accounting/reconciliation', { movements: broken }),
    422,
    'unprocessable',
  );
});

Deno.test('reconciliation should be reserved to superadministration', async () => {
  const { admin } = await clients();
  assertError(
    await admin.json('POST', '/api/admin/accounting/reconciliation', { movements: MOVEMENTS }),
    403,
    'forbidden',
  );
  assertError(
    await admin.json('POST', '/api/admin/accounting/reconciliation/accept', {
      movement: MOVEMENTS[0],
      items: [],
    }),
    403,
    'forbidden',
  );
});
