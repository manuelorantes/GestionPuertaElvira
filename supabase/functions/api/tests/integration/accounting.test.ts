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
