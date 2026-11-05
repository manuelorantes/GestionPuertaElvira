import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, resetDatabase } from '../support/http.ts';

interface Item {
  status: string;
  movement: Record<string, unknown>;
  matched: { source: string; sourceId: string }[];
  note: string;
  proposal: {
    items: { source: string; sourceId: string; method: string }[];
    fees: { studentId: string; student: string; concept: string; amountCents: number }[];
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

// Un extracto con 1.000,00 € de partida, del más reciente al más antiguo, como lo da el banco.
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
    method: 'transfer',
    amount: '50',
  });
  const rentId = (rent.body as { id: string }).id;
  // Un gasto en efectivo del mismo importe nunca casa con el banco.
  await superadmin.json('POST', '/api/admin/accounting/entries', {
    date: '2025-10-02',
    kind: 'expense',
    concept: 'Pintura',
    category: 'other_expenses',
    method: 'cash',
    amount: '50',
  });

  const first = await superadmin.json('POST', '/api/admin/accounting/reconciliation', {
    movements: MOVEMENTS,
  });
  assertEquals(first.status, 200, JSON.stringify(first.body));
  const view = first.body as View;
  assertEquals([view.from, view.to], ['2025-10-02', '2025-10-20']);
  assertEquals(view.bank, { openingCents: 100_000, closingCents: 70_624 });
  assertEquals(view.items.map((i) => i.status), ['matched', 'suggested', 'suggested']);
  const [alquiler, efectivo, agua] = view.items as [Item, Item, Item];
  assertEquals(alquiler.matched.map((i) => i.sourceId), [rentId]);
  assertEquals(efectivo.proposal!.transfer, { from: 'bank', to: 'cash' });
  assertEquals(agua.proposal!.record!.category, 'water');

  for (
    const accepted of [
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
    [['Agua', 'transfer', 4376], ['Alquiler', 'transfer', 5000], ['Pintura', 'cash', 5000]],
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

Deno.test('reconciliation should charge the fee of a transfer nobody recorded and let a match be undone', async () => {
  await atTime('2026-11-05T10:00:00+01:00', async () => {
    const { superadmin } = await clients();
    const group = await newGroup(superadmin, await newTeacher(superadmin));
    const created = await superadmin.json('POST', '/api/admin/students', {
      fullName: 'Ana Pérez Gil',
      groupIds: [group],
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    const ana = (created.body as { id: string }).id;
    const quote = await superadmin.json('POST', '/api/admin/billing/quote', {
      studentId: ana,
      months: 1,
      method: 'transfer',
      date: '2026-11-03',
    });
    assertEquals(quote.status, 200, JSON.stringify(quote.body));
    const fee = (quote.body as { totalCents: number }).totalCents;
    const movements = [{
      operationDate: '2026-11-03',
      valueDate: '2026-11-03',
      concept: 'Transferencia Inmediata De Ana Perez Gil, Concepto Noviembre',
      amountCents: fee,
      balanceCents: 100_000 + fee,
    }];
    const reconcile = async () =>
      ((await superadmin.json('POST', '/api/admin/accounting/reconciliation', { movements }))
        .body as View).items[0]!;

    const item = await reconcile();
    assertEquals(item.status, 'suggested');
    assertEquals(item.proposal!.fees.map((f) => [f.studentId, f.amountCents]), [[ana, fee]]);
    const accepted = await superadmin.json('POST', '/api/admin/accounting/reconciliation/accept', {
      movement: item.movement,
      items: [],
      fees: [{ studentId: ana, kind: 'monthly' }],
    });
    assertEquals(accepted.status, 204, JSON.stringify(accepted.body));
    const matched = await reconcile();
    assertEquals(matched.status, 'matched');
    const payments = (await superadmin.get(`/api/admin/billing/payments?studentId=${ana}`))
      .body as { items: { id: string; method: string; reconciled: boolean }[] };
    const paymentId = matched.matched[0]!.sourceId;
    assertEquals(payments.items.map((p) => [p.id, p.method, p.reconciled]), [[
      paymentId,
      'transfer',
      true,
    ]]);
    const ledger = (await superadmin.get('/api/admin/accounting/ledger?month=2026-11')).body as {
      items: { sourceId: string; reconciled: boolean }[];
    };
    assertEquals(ledger.items.find((l) => l.sourceId === paymentId)?.reconciled, true);
    const toCash = () =>
      superadmin.json('PUT', `/api/admin/billing/payments/${paymentId}/method`, {
        method: 'cash',
      });
    assertError(await toCash(), 409, 'reconciled_with_bank');

    const released = await superadmin.json('POST', '/api/admin/accounting/reconciliation/release', {
      movement: item.movement,
    });
    assertEquals(released.status, 204, JSON.stringify(released.body));
    assertEquals((await reconcile()).status === 'matched', false);
    assertEquals((await toCash()).status, 204);
  });
});

Deno.test('reconciliation should split a transfer by hand among fees and remember who sends it', async () => {
  await atTime('2026-11-05T10:00:00+01:00', async () => {
    const { superadmin } = await clients();
    const group = await newGroup(superadmin, await newTeacher(superadmin));
    const student = async (fullName: string) =>
      ((await superadmin.json('POST', '/api/admin/students', { fullName, groupIds: [group] }))
        .body as { id: string }).id;
    const [ana, luis] = [await student('Ana Pérez Gil'), await student('Luis Mora Vela')];
    const feeOf = async (id: string) => {
      const response = await superadmin.get(
        `/api/admin/accounting/reconciliation/fee?studentId=${id}&day=2026-11-03`,
      );
      assertEquals(response.status, 200, JSON.stringify(response.body));
      return (response.body as { monthly: { amountCents: number } }).monthly.amountCents;
    };
    const total = await feeOf(ana) + await feeOf(luis);
    assertError(
      await superadmin.get('/api/admin/accounting/reconciliation/fee?studentId=x&day=2026-11-03'),
      422,
      'unprocessable',
    );
    const transfer = (day: string, balance: number) => ({
      operationDate: day,
      valueDate: day,
      concept: 'Transferencia Inmediata De Marta Ruiz Sol, Concepto Clases',
      amountCents: total,
      balanceCents: balance,
    });
    const reconcile = async (day: string, balance: number) =>
      ((await superadmin.json('POST', '/api/admin/accounting/reconciliation', {
        movements: [transfer(day, balance)],
      })).body as View).items[0]!;

    const first = await reconcile('2026-11-03', 100_000 + total);
    assertEquals(first.proposal!.fees, []);
    const accepted = await superadmin.json('POST', '/api/admin/accounting/reconciliation/accept', {
      movement: first.movement,
      items: [],
      fees: [{ studentId: ana, kind: 'monthly' }, { studentId: luis, kind: 'monthly' }],
    });
    assertEquals(accepted.status, 204, JSON.stringify(accepted.body));
    assertEquals((await reconcile('2026-11-03', 100_000 + total)).matched.length, 2);

    const next = await reconcile('2026-12-02', 100_000 + 2 * total);
    assertEquals(next.proposal!.fees.map((f) => f.studentId).sort(), [ana, luis].sort());
  });
});

Deno.test('reconciliation should leave in favour of each student what a transfer paid over their fees', async () => {
  await atTime('2026-11-05T10:00:00+01:00', async () => {
    const { superadmin } = await clients();
    const group = await newGroup(superadmin, await newTeacher(superadmin));
    const student = async (fullName: string) =>
      ((await superadmin.json('POST', '/api/admin/students', { fullName, groupIds: [group] }))
        .body as { id: string }).id;
    const [andres, luis] = [
      await student('Andrés Porras Romero'),
      await student('Luis Porras Wadley'),
    ];
    const feeOf = async (id: string) =>
      ((await superadmin.get(
        `/api/admin/accounting/reconciliation/fee?studentId=${id}&day=2026-11-03`,
      )).body as { monthly: { amountCents: number } }).monthly.amountCents;
    const fees = await feeOf(andres) + await feeOf(luis);
    const movement = {
      operationDate: '2026-11-03',
      valueDate: '2026-11-03',
      concept: 'Transferencia De Luis Porras Wadley, Concepto Mensualidad',
      amountCents: fees + 1600,
      balanceCents: 100_000 + fees + 1600,
    };
    const accept = (adjust: boolean) =>
      superadmin.json('POST', '/api/admin/accounting/reconciliation/accept', {
        movement,
        items: [],
        fees: [{ studentId: andres, kind: 'monthly' }, { studentId: luis, kind: 'monthly' }],
        adjust,
      });
    assertError(await accept(false), 422, 'unprocessable');
    assertEquals((await accept(true)).status, 204);

    for (const id of [andres, luis]) {
      const account = (await superadmin.get(`/api/admin/billing/accounts/${id}`)).body as {
        balanceCents: number;
      };
      assertEquals(account.balanceCents, 800);
      const payments = (await superadmin.get(`/api/admin/billing/payments?studentId=${id}`))
        .body as { items: { method: string; reconciled: boolean }[] };
      assertEquals(payments.items.map((p) => [p.method, p.reconciled]), [['transfer', true]]);
    }
  });
});

Deno.test('reconciliation should charge a provisional member the membership fee and the rest on account', async () => {
  await atTime('2026-11-05T10:00:00+01:00', async () => {
    const { superadmin } = await clients();
    const created = await superadmin.json('POST', '/api/admin/students', {
      fullName: 'Álvaro Tejero Gilabert',
      provisional: true,
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    const alvaro = (created.body as { id: string }).id;
    const options = (await superadmin.get(
      `/api/admin/accounting/reconciliation/fee?studentId=${alvaro}&day=2026-11-03`,
    )).body as { monthly: unknown; membership: { amountCents: number } | null };
    assertEquals(options.monthly, null);
    const membership = options.membership!.amountCents;
    const movement = {
      operationDate: '2026-11-03',
      valueDate: '2026-11-03',
      concept: 'Transferencia De Alvaro Tejero Gilabert, Concepto Socio',
      amountCents: membership + 2000,
      balanceCents: 100_000 + membership + 2000,
    };
    const accepted = await superadmin.json('POST', '/api/admin/accounting/reconciliation/accept', {
      movement,
      items: [],
      fees: [
        { studentId: alvaro, kind: 'membership' },
        { studentId: alvaro, kind: 'credit', amountCents: 2000 },
      ],
    });
    assertEquals(accepted.status, 204, JSON.stringify(accepted.body));
    const account = (await superadmin.get(`/api/admin/billing/accounts/${alvaro}`)).body as {
      balanceCents: number;
      membershipPaid: boolean;
    };
    assertEquals([account.membershipPaid, account.balanceCents], [true, 2000]);
    const payments = (await superadmin.get(`/api/admin/billing/payments?studentId=${alvaro}`))
      .body as { items: { concept: string; amountCents?: number; reconciled: boolean }[] };
    assertEquals(
      payments.items.map((p) => [p.concept, p.reconciled]).sort(),
      [['Cuota de socio 2026/27', true], ['Pago a cuenta', true]],
    );
  });
});
