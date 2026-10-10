import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

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
