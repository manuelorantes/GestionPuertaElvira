import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import { ApiClient, assertError, atTime, createUser, resetDatabase } from '../support/http.ts';

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

async function admin(): Promise<ApiClient> {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  return client;
}

function invoiceForm(
  file: { name: string; bytes: Uint8Array } | null,
  overrides: Record<string, string> = {},
): FormData {
  const form = new FormData();
  const fields = {
    date: '2025-10-01',
    number: 'R-2025-10',
    supplier: 'Propietario del local',
    concept: 'Alquiler octubre',
    category: 'rent',
    amount: '950',
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file) {
    form.append(
      'file',
      new File([file.bytes as unknown as ArrayBuffer], file.name, { type: 'application/pdf' }),
    );
  }
  return form;
}

const body = <T>(response: { body: unknown }) => response.body as T;

Deno.test('accounting should register an invoice with its document, pay it and see it in the ledger', async () => {
  const client = await admin();
  const registered = await client.request('POST', '/api/admin/accounting/invoices', {
    body: invoiceForm({ name: 'alquiler.pdf', bytes: PDF }),
    headers: { 'X-Requested-With': 'fetch' },
  });
  assertEquals(registered.status, 201, JSON.stringify(registered.body));
  const id = body<{ id: string }>(registered).id;

  const download = await client.raw('GET', `/api/admin/accounting/invoices/${id}/attachment`);
  assertEquals(download.status, 200);
  assertEquals(download.headers.get('Content-Type'), 'application/pdf');
  assertStringIncludes(
    download.headers.get('Content-Disposition') ?? '',
    'inline; filename="alquiler.pdf"',
  );
  assert(new TextDecoder().decode(new Uint8Array(await download.arrayBuffer())).startsWith('%PDF'));

  assertEquals(
    (await client.json('POST', `/api/admin/accounting/invoices/${id}/payment`, {
      date: '2025-10-02',
      method: 'transfer',
    })).status,
    204,
  );
  assertError(
    await client.json('DELETE', `/api/admin/accounting/invoices/${id}`),
    409,
    'invoice_paid',
  );
  assertEquals(
    (await client.json('POST', '/api/admin/accounting/entries', {
      date: '2025-10-15',
      kind: 'income',
      concept: 'Subvención',
      category: 'grants',
      method: 'transfer',
      amount: '600',
    })).status,
    201,
  );

  const ledger = body<
    { incomeCents: number; expenseCents: number; items: Record<string, unknown>[] }
  >(await client.get('/api/admin/accounting/ledger?month=2025-10'));
  assertEquals(ledger.incomeCents, 60000);
  assertEquals(ledger.expenseCents, 95000);
  assertEquals(ledger.items[1]?.categoryLabel, 'Alquiler');
  assertEquals(ledger.items[1]?.methodLabel, 'Transferencia');
  assertEquals(ledger.items[1]?.studentId, null);
  const invoices =
    body<{ items: Record<string, unknown>[] }>(await client.get('/api/admin/accounting/invoices'))
      .items;
  assertEquals(invoices[0]?.attachmentName, 'alquiler.pdf');
  assertEquals(invoices[0]?.categoryLabel, 'Alquiler');

  const replaced = await client.request('POST', `/api/admin/accounting/invoices/${id}/attachment`, {
    body: invoiceForm({ name: 'nuevo.pdf', bytes: PDF }),
    headers: { 'X-Requested-With': 'fetch' },
  });
  assertEquals(replaced.status, 204);
  assertError(await client.get('/api/admin/accounting/ledger'), 422, 'unprocessable');
});

Deno.test('only superadministration amends an invoice, its payment included', async () => {
  const client = await admin();
  const registered = await client.request('POST', '/api/admin/accounting/invoices', {
    body: invoiceForm(null),
    headers: { 'X-Requested-With': 'fetch' },
  });
  const id = body<{ id: string }>(registered).id;
  await client.json('POST', `/api/admin/accounting/invoices/${id}/payment`, {
    date: '2025-10-02',
    method: 'transfer',
  });
  const amendment = {
    date: '2025-10-03',
    number: 'R-2025-10-B',
    supplier: 'Casero',
    concept: 'Alquiler de octubre',
    category: 'rent',
    amount: '900',
    period: '2025-09',
    paidOn: '2025-10-09',
    method: 'cash',
  };
  assertError(
    await client.json('PUT', `/api/admin/accounting/invoices/${id}`, amendment),
    403,
    'forbidden',
  );

  await createUser('super@club.es', 'superadministrator');
  const superadmin = new ApiClient();
  await superadmin.logIn('super@club.es');
  assertEquals(
    (await superadmin.json('PUT', `/api/admin/accounting/invoices/${id}`, amendment)).status,
    204,
  );
  const invoice = body<{ items: Record<string, unknown>[] }>(
    await superadmin.get('/api/admin/accounting/invoices'),
  ).items[0];
  assertEquals(
    [
      invoice?.date,
      invoice?.number,
      invoice?.supplier,
      invoice?.concept,
      invoice?.amountCents,
      invoice?.period,
      invoice?.paidOn,
      invoice?.method,
    ],
    [
      '2025-10-03',
      'R-2025-10-B',
      'Casero',
      'Alquiler de octubre',
      90000,
      '2025-09',
      '2025-10-09',
      'cash',
    ],
  );
  const ledger = body<{ items: Record<string, unknown>[] }>(
    await superadmin.get('/api/admin/accounting/ledger?month=2025-10'),
  );
  assertEquals([ledger.items[0]?.date, ledger.items[0]?.amountCents], ['2025-10-09', 90000]);
  assertError(
    await superadmin.json('PUT', `/api/admin/accounting/invoices/${id}`, {
      ...amendment,
      supplier: ' ',
    }),
    422,
    'unprocessable',
  );
});

Deno.test('accounting should refuse uploads without the fetch header or of the wrong type', async () => {
  const client = await admin();
  const noHeader = await client.request('POST', '/api/admin/accounting/invoices', {
    body: invoiceForm({ name: 'a.pdf', bytes: PDF }),
  });
  assertError(noHeader, 403, 'forbidden');
  const fake = await client.request('POST', '/api/admin/accounting/invoices', {
    body: invoiceForm({ name: 'falso.pdf', bytes: new TextEncoder().encode('no soy un pdf') }),
    headers: { 'X-Requested-With': 'fetch' },
  });
  assertError(fake, 422, 'unprocessable');
  const unpaid = body<{ id: string }>(
    await client.request('POST', '/api/admin/accounting/invoices', {
      body: invoiceForm(null),
      headers: { 'X-Requested-With': 'fetch' },
    }),
  ).id;
  assertError(
    await client.get(`/api/admin/accounting/invoices/${unpaid}/attachment`),
    404,
    'not_found',
  );
  assertEquals(
    (await client.json('DELETE', `/api/admin/accounting/invoices/${unpaid}`)).status,
    204,
  );
  assertError(
    await client.json('DELETE', `/api/admin/accounting/invoices/${unpaid}`),
    404,
    'not_found',
  );
});

Deno.test('accounting should summarise and close a past season, then lock it', async () => {
  const client = await admin();
  assertEquals(
    (await client.json('POST', '/api/admin/accounting/entries', {
      date: '2024-11-10',
      kind: 'expense',
      concept: 'Comisión',
      category: 'other_expenses',
      method: 'card',
      amount: '12.5',
    })).status,
    201,
  );
  const year = body<Record<string, unknown>>(await client.get('/api/admin/accounting/years/2024'));
  assertEquals(year.label, '2024/25');
  assertEquals(year.canClose, true);
  assertEquals((year.months as unknown[]).length, 12);
  assertEquals((await client.json('POST', '/api/admin/accounting/years/2024/closing')).status, 204);
  assertError(
    await client.json('POST', '/api/admin/accounting/years/2024/closing'),
    409,
    'season_closed',
  );
  assertError(
    await client.json('POST', '/api/admin/accounting/entries', {
      date: '2025-01-10',
      kind: 'income',
      concept: 'Tarde',
      category: 'other_income',
      method: 'cash',
      amount: '5',
    }),
    409,
    'period_closed',
  );
  await createUser('profe@club.es', 'teacher');
  const teacher = new ApiClient();
  await teacher.logIn('profe@club.es');
  assertError(await teacher.get('/api/admin/accounting/invoices'), 403, 'forbidden');
});

Deno.test('entries and invoices keep the month they belong to, shown in the ledger', async () => {
  const client = await admin();
  const entry = await client.json('POST', '/api/admin/accounting/entries', {
    date: '2025-10-03',
    kind: 'expense',
    concept: 'Luz de septiembre',
    category: 'electricity',
    method: 'transfer',
    amount: '80',
    period: '2025-09',
  });
  assertEquals(entry.status, 201, JSON.stringify(entry.body));
  await client.json('POST', '/api/admin/accounting/entries', {
    date: '2025-10-04',
    kind: 'expense',
    concept: 'Wifi',
    category: 'internet',
    method: 'card',
    amount: '30',
  });
  const invoice = await client.request('POST', '/api/admin/accounting/invoices', {
    body: invoiceForm(null, { period: '2025-09' }),
    headers: { 'X-Requested-With': 'fetch' },
  });
  assertEquals(invoice.status, 201, JSON.stringify(invoice.body));
  const invoiceId = body<{ id: string }>(invoice).id;
  await client.json('POST', `/api/admin/accounting/invoices/${invoiceId}/payment`, {
    date: '2025-10-05',
    method: 'transfer',
  });

  const ledger = body<{ items: { concept: string; period: string; categoryLabel: string }[] }>(
    await client.get('/api/admin/accounting/ledger?month=2025-10'),
  );
  assertEquals(
    ledger.items.map((i) => [i.concept, i.categoryLabel, i.period]),
    [
      ['Propietario del local · Alquiler octubre', 'Alquiler', '2025-09'],
      ['Wifi', 'Wifi', '2025-10'],
      ['Luz de septiembre', 'Electricidad', '2025-09'],
    ],
  );
  const invoices = body<{ items: { period: string }[] }>(
    await client.get('/api/admin/accounting/invoices'),
  );
  assertEquals(invoices.items[0]?.period, '2025-09');
});

Deno.test('the categories that count as of the month have defaults and can be changed', async () => {
  const client = await admin();
  assertEquals(
    body<{ categories: string[] }>(await client.get('/api/admin/accounting/monthly-categories'))
      .categories,
    ['teachers', 'rent', 'president', 'cleaning', 'water', 'electricity', 'internet', 'fees'],
  );
  const saved = await client.json('PUT', '/api/admin/accounting/monthly-categories', {
    categories: ['fees', 'membership', 'rent'],
  });
  assertEquals(saved.status, 204, JSON.stringify(saved.body));
  assertEquals(
    body<{ categories: string[] }>(await client.get('/api/admin/accounting/monthly-categories'))
      .categories,
    ['rent', 'fees', 'membership'],
  );
  assertError(
    await client.json('PUT', '/api/admin/accounting/monthly-categories', {
      categories: ['nope'],
    }),
    422,
    'unprocessable',
  );
});

Deno.test('the club adds its own categories, uses and renames them, and removes them while unused', async () => {
  const client = await admin();
  const added = await client.json('POST', '/api/admin/accounting/categories', {
    kind: 'expense',
    label: 'Seguro',
  });
  assertEquals(added.status, 201, JSON.stringify(added.body));
  const code = body<{ code: string }>(added).code;
  assertError(
    await client.json('POST', '/api/admin/accounting/categories', {
      kind: 'expense',
      label: 'alquiler',
    }),
    422,
    'unprocessable',
  );
  const entry = await client.json('POST', '/api/admin/accounting/entries', {
    date: '2025-10-03',
    kind: 'expense',
    concept: 'Póliza',
    category: code,
    method: 'transfer',
    amount: '300',
  });
  assertEquals(entry.status, 201, JSON.stringify(entry.body));
  assertEquals(
    (await client.json('PUT', `/api/admin/accounting/categories/${code}`, {
      label: 'Seguro del local',
    })).status,
    204,
  );
  const ledger = body<{ items: { categoryLabel: string }[] }>(
    await client.get('/api/admin/accounting/ledger?month=2025-10'),
  );
  assertEquals(ledger.items.map((i) => i.categoryLabel), ['Seguro del local']);
  const categories = body<{ items: { code: string; custom: boolean; label: string }[] }>(
    await client.get('/api/admin/accounting/categories'),
  ).items;
  assertEquals(categories.filter((c) => c.custom).map((c) => c.label), ['Seguro del local']);
  assertError(
    await client.json('DELETE', `/api/admin/accounting/categories/${code}`),
    409,
    'category_in_use',
  );
  // Se puede marcar como «del mes».
  assertEquals(
    (await client.json('PUT', '/api/admin/accounting/monthly-categories', {
      categories: ['fees', code],
    })).status,
    204,
  );
  assertEquals(
    body<{ categories: string[] }>(await client.get('/api/admin/accounting/monthly-categories'))
      .categories,
    ['fees', code],
  );
});

Deno.test('accounting shows a manual entry by id, to open the ledger where it is', async () => {
  const client = await admin();
  const created = await client.json('POST', '/api/admin/accounting/entries', {
    date: '2025-10-03',
    kind: 'expense',
    concept: 'Luz',
    category: 'electricity',
    method: 'card',
    amount: '80',
    period: '2025-09',
  });
  const id = body<{ id: string }>(created).id;

  const shown = await client.get(`/api/admin/accounting/entries/${id}`);
  assertEquals(shown.status, 200);
  assertEquals(shown.body, {
    id,
    date: '2025-10-03',
    kind: 'expense',
    concept: 'Luz',
    category: 'electricity',
    method: 'card',
    amountCents: 8000,
    period: '2025-09',
    shares: [{ period: '2025-09', amountCents: 8000 }],
  });
  assertError(
    await client.get('/api/admin/accounting/entries/00000000-0000-7000-8000-000000000000'),
    404,
    'not_found',
  );
});

Deno.test('accounting edits a manual entry, but not one in a closed season', async () => {
  const client = await admin();
  const created = await client.json('POST', '/api/admin/accounting/entries', {
    date: '2025-10-03',
    kind: 'expense',
    concept: 'Luz',
    category: 'electricity',
    method: 'card',
    amount: '80',
  });
  const id = body<{ id: string }>(created).id;
  const edit = (overrides: Record<string, string> = {}) =>
    client.json('PUT', '/api/admin/accounting/movements', {
      source: 'manual',
      sourceId: id,
      month: '2025-10',
      concept: 'Luz de septiembre',
      category: 'electricity',
      method: 'transfer',
      amount: '85,50',
      period: '2025-09',
      ...overrides,
    });
  assertEquals((await edit()).status, 204);
  const ledger = body<{ items: Record<string, unknown>[] }>(
    await client.get('/api/admin/accounting/ledger?month=2025-10'),
  );
  assertEquals(
    ledger.items.map((i) => [i.concept, i.method, i.amountCents, i.period, i.corrected]),
    [['Luz de septiembre', 'transfer', 8550, '2025-09', false]],
  );
  assertError(await edit({ category: 'fees' }), 422, 'unprocessable');
  assertError(
    await edit({ source: 'payment', sourceId: 'no-existe' }),
    404,
    'not_found',
  );
});

Deno.test('accounting should tell the bank and cash balances and move money between them', async () => {
  // Hoy es el 25 de octubre de 2025: el ejercicio en curso es el 2025/26.
  await atTime('2025-10-25T10:00:00+02:00', async () => {
    const client = await admin();
    await client.json('POST', '/api/admin/accounting/entries', {
      date: '2025-10-15',
      kind: 'income',
      concept: 'Subvención',
      category: 'grants',
      method: 'transfer',
      amount: '600',
    });
    await client.json('POST', '/api/admin/accounting/entries', {
      date: '2025-10-16',
      kind: 'income',
      concept: 'Venta de libros',
      category: 'other_income',
      method: 'cash',
      amount: '80',
    });
    const recorded = await client.json('POST', '/api/admin/accounting/transfers', {
      date: '2025-10-20',
      from: 'cash',
      to: 'bank',
      amount: '50',
      note: 'Ingreso del efectivo',
    });
    assertEquals(recorded.status, 201, JSON.stringify(recorded.body));
    const id = body<{ id: string }>(recorded).id;

    const balances = await client.get('/api/admin/accounting/balances');
    assertEquals(balances.body, { clubCents: 68000, bankCents: 65000, cashCents: 3000 });

    const transfers = body<{ items: Record<string, unknown>[] }>(
      await client.get('/api/admin/accounting/transfers'),
    );
    assertEquals(transfers.items.length, 1);
    assertEquals(transfers.items[0]?.fromLabel, 'Caja');
    assertEquals(transfers.items[0]?.toLabel, 'Banco');
    assertEquals(transfers.items[0]?.amountCents, 5000);

    assertError(
      await client.json('POST', '/api/admin/accounting/transfers', {
        date: '2025-10-20',
        from: 'bank',
        to: 'bank',
        amount: '50',
      }),
      422,
      'unprocessable',
    );
    assertEquals(
      (await client.json('DELETE', `/api/admin/accounting/transfers/${id}`)).status,
      204,
    );
    assertEquals(
      (await client.get('/api/admin/accounting/balances')).body,
      { clubCents: 68000, bankCents: 60000, cashCents: 8000 },
    );
  });
});

Deno.test('accounting splits a movement between the months it applies to, for the year month by month', async () => {
  const client = await admin();
  const shares = [
    { period: '2025-10', amountCents: 10000 },
    { period: '2025-11', amountCents: 10000 },
    { period: '2025-12', amountCents: 10000 },
  ];
  const created = await client.json('POST', '/api/admin/accounting/entries', {
    date: '2026-01-20',
    kind: 'expense',
    concept: 'IVA cuarto trimestre',
    category: 'other_expenses',
    method: 'transfer',
    amount: '300',
    shares,
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const id = body<{ id: string }>(created).id;
  assertEquals(
    body<{ shares: unknown }>(await client.get(`/api/admin/accounting/entries/${id}`)).shares,
    shares,
  );

  // Una factura con documento lleva el reparto como JSON.
  const invoice = await client.request('POST', '/api/admin/accounting/invoices', {
    body: invoiceForm(null, {
      date: '2026-01-10',
      amount: '90',
      shares: JSON.stringify([
        { period: '2025-12', amountCents: 3000 },
        { period: '2026-01', amountCents: 6000 },
      ]),
    }),
    headers: { 'X-Requested-With': 'fetch' },
  });
  assertEquals(invoice.status, 201, JSON.stringify(invoice.body));
  const invoiceId = body<{ id: string }>(invoice).id;
  await client.json('POST', `/api/admin/accounting/invoices/${invoiceId}/payment`, {
    date: '2026-01-12',
    method: 'transfer',
  });

  const ledger = body<{ items: { sourceId: string; period: string; shares: unknown }[] }>(
    await client.get('/api/admin/accounting/ledger?month=2026-01'),
  );
  const entry = ledger.items.find((i) => i.sourceId === id);
  assertEquals([entry?.period, entry?.shares], ['2025-10', shares]);

  const year = body<{
    months: { month: string; expenseCents: number; accumulatedCents: number }[];
    resultCents: number;
    cashResultCents: number;
  }>(await client.get('/api/admin/accounting/years/2025'));
  const month = (m: string) => year.months.find((r) => r.month === m);
  assertEquals(
    ['2025-10', '2025-11', '2025-12', '2026-01'].map((m) => month(m)?.expenseCents),
    [10000, 10000, 13000, 6000],
  );
  assertEquals(month('2026-01')?.accumulatedCents, -39000, 'el saldo, por cuando se pagó');
  assertEquals([year.resultCents, year.cashResultCents], [-39000, -39000]);

  assertError(
    await client.json('POST', '/api/admin/accounting/entries', {
      date: '2026-01-20',
      kind: 'expense',
      concept: 'IVA',
      category: 'other_expenses',
      method: 'transfer',
      amount: '300',
      shares: [{ period: '2025-10', amountCents: 100 }],
    }),
    422,
    'unprocessable',
  );
});

Deno.test('accounting expects the club monthly expenses, pays them for what they cost and counts the rest as expected', async () => {
  await atTime('2026-11-05T10:00:00+01:00', async () => {
    const client = await admin();
    const define = async (concept: string, category: string, amount: string) => {
      const created = await client.json('POST', '/api/admin/accounting/expected', {
        concept,
        category,
        amount,
      });
      assertEquals(created.status, 201, JSON.stringify(created.body));
      return body<{ id: string }>(created).id;
    };
    const rent = await define('Alquiler', 'rent', '950');
    const cleaning = await define('Limpieza', 'cleaning', '120');
    const list = body<
      { items: { concept: string; categoryLabel: string; months: number[]; since: string }[] }
    >(
      await client.get('/api/admin/accounting/expected'),
    ).items;
    assertEquals(
      list.map((e) => [e.concept, e.since, e.months.length]),
      [
        ['Alquiler', '2026-11', 10],
        ['Limpieza', '2026-11', 10],
      ].sort(),
    );

    const expectedOf = async (month: string) =>
      body<{ monthChart: { month: string; expenseCents: number; expectedExpenseCents: number }[] }>(
        await client.get('/api/admin/dashboard'),
      ).monthChart.find((m) => m.month === month);
    assertEquals((await expectedOf('2026-11'))?.expectedExpenseCents, 107000);
    assertEquals((await expectedOf('2026-10'))?.expectedExpenseCents, 0, 'antes de esperarlos');

    const paid = await client.json(
      'POST',
      `/api/admin/accounting/expected/${cleaning}/months/2026-11/payment`,
      { date: '2026-11-04', method: 'cash', amount: '135,50' },
    );
    assertEquals(paid.status, 201, JSON.stringify(paid.body));
    assertEquals(
      (await client.json('POST', `/api/admin/accounting/expected/${rent}/months/2026-11/skip`))
        .status,
      204,
    );
    const month = body<{ items: { concept: string; status: string; paidCents: number | null }[] }>(
      await client.get('/api/admin/accounting/expected/month?month=2026-11'),
    ).items;
    assertEquals(
      month.map((m) => [m.concept, m.status, m.paidCents]).sort(),
      [['Alquiler', 'skipped', null], ['Limpieza', 'paid', 13550]],
    );
    assertEquals(
      [
        (await expectedOf('2026-11'))?.expenseCents,
        (await expectedOf('2026-11'))?.expectedExpenseCents,
      ],
      [13550, 0],
    );
    assertError(
      await client.json('POST', `/api/admin/accounting/expected/${rent}/months/2026-11/skip`),
      409,
      'expected_month_settled',
    );

    // Quitar el apunte deja la limpieza pendiente otra vez.
    const entryId = body<{ id: string }>(paid).id;
    assertEquals(
      (await client.json('DELETE', `/api/admin/accounting/entries/${entryId}`)).status,
      204,
    );
    assertEquals((await expectedOf('2026-11'))?.expectedExpenseCents, 12000);

    assertEquals(
      (await client.json('DELETE', `/api/admin/accounting/expected/${rent}`)).status,
      204,
    );
    assertEquals(
      body<{ items: unknown[] }>(await client.get('/api/admin/accounting/expected')).items.length,
      1,
    );
  });
});
