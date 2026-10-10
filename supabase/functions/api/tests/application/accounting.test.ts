import { assertEquals, assertRejects } from '@std/assert';

import { LocalDate, Money } from '../../src/domain/common/mod.ts';
import { FiscalYear, SeasonClosing, SupplierInvoiceId } from '../../src/domain/accounting/mod.ts';
import {
  AttachDocument,
  CloseSeason,
  DeleteEntry,
  DeleteInvoice,
  FiscalYearSummary,
  MonthLedger,
  PayInvoice,
  PreviousSeasonOpen,
  RecordEntry,
  RegisterInvoice,
  SeasonAlreadyClosed,
  SeasonNotFinished,
  type UploadedDocument,
} from '../../src/application/accounting/mod.ts';
import { PeriodClosed } from '../../src/application/common/mod.ts';
import { AccountingFixture } from '../support/accounting.ts';

const bytes = (text: string) => new TextEncoder().encode(text);

function setUp() {
  const fx = new AccountingFixture();
  fx.external = [
    {
      source: 'payment',
      sourceId: 'p1',
      date: '2026-10-02',
      kind: 'income',
      concept: 'Octubre 2026 · Martina López',
      category: 'fees',
      method: 'cash',
      amountCents: 4500,
      studentId: 'martina',
      period: '2026-10',
    },
    {
      source: 'settlement',
      sourceId: 's1',
      date: '2026-10-02',
      kind: 'expense',
      concept: 'Liquidación septiembre · Lucía Moreno',
      category: 'teachers',
      method: 'transfer',
      amountCents: 41600,
      studentId: null,
      period: '2026-09',
    },
  ];
  const registerInvoice = (
    date: string,
    concept: string,
    category: string,
    amount: string,
    document: UploadedDocument | null = null,
  ) =>
    new RegisterInvoice(fx, fx, fx).execute({
      date,
      number: 'F-1',
      supplier: 'Proveedor',
      concept,
      category,
      amount,
    }, document);
  const close = () => new CloseSeason(new FiscalYearSummary(fx, fx, fx.clock), fx, fx.clock);
  return { fx, registerInvoice, close };
}

Deno.test('MonthLedger should list the month with income, expenses and spending by category', async () => {
  const { fx, registerInvoice } = setUp();
  await new RecordEntry(fx, fx).execute({
    date: '2026-10-10',
    kind: 'income',
    concept: 'Subvención municipal',
    category: 'grants',
    method: 'transfer',
    amount: '600',
  });
  const invoice = await registerInvoice('2026-10-01', 'Alquiler octubre', 'rent', '950');
  await new PayInvoice(fx, fx).execute(invoice, '2026-10-01', 'transfer');
  const ledger = await new MonthLedger(fx).execute('2026-10');
  assertEquals(ledger.lines.map((l) => l.date), [
    '2026-10-10',
    '2026-10-02',
    '2026-10-02',
    '2026-10-01',
  ]);
  assertEquals(ledger.incomeCents, 64500);
  assertEquals(ledger.expenseCents, 136600);
  assertEquals(ledger.expensesByCategory.map((c) => [c.category, c.label, c.amountCents]), [[
    'rent',
    'Alquiler',
    95000,
  ], ['teachers', 'Profesores', 41600]]);
});

Deno.test('invoices should store, replace and remove their documents', async () => {
  const { fx, registerInvoice } = setUp();
  const invoice = await registerInvoice('2026-10-01', 'Tablero mural', 'material', '86', {
    originalName: 'factura.pdf',
    mimeType: 'application/pdf',
    contents: bytes('%PDF-1'),
  });
  const first = (await fx.invoice(SupplierInvoiceId.fromString(invoice)))?.attachment()?.key ?? '';
  assertEquals(new TextDecoder().decode(fx.files.get(first)), '%PDF-1');
  await new AttachDocument(fx, fx, fx).execute(invoice, {
    originalName: 'foto.jpg',
    mimeType: 'image/jpeg',
    contents: bytes('JPEG'),
  });
  assertEquals(fx.files.has(first), false);
  assertEquals(fx.files.size, 1);
  await new DeleteInvoice(fx, fx, fx).execute(invoice);
  assertEquals(fx.files.size, 0);
  assertEquals(fx.invoices.size, 0);
});

Deno.test('FiscalYearSummary should summarise the year month by month with the opening balance', async () => {
  const { fx } = setUp();
  await fx.saveClosing(
    SeasonClosing.close(
      new FiscalYear(2025),
      Money.euros(1000),
      Money.euros(400),
      LocalDate.fromString('2026-09-01'),
    ),
  );
  await new RecordEntry(fx, fx).execute({
    date: '2027-02-10',
    kind: 'expense',
    concept: 'Comisión banco',
    category: 'other_expenses',
    method: 'card',
    amount: '10',
  });
  const summary = await new FiscalYearSummary(fx, fx, fx.clock).execute(2026);
  assertEquals(summary.label, '2026/27');
  assertEquals(summary.openingCents, 60000);
  assertEquals(summary.months.length, 12);
  const october = summary.months[1];
  assertEquals([
    october?.month,
    october?.incomeCents,
    october?.expenseCents,
    october?.resultCents,
    october?.accumulatedCents,
  ], ['2026-10', 4500, 41600, -37100, 60000 - 37100]);
  assertEquals(summary.resultCents, -38100);
  assertEquals(summary.canClose, true);
  assertEquals(summary.closedOn, null);
});

Deno.test('CloseSeason should close a finished season once and lock it', async () => {
  const { fx, close } = setUp();
  await close().execute(2026);
  assertEquals((await fx.closing(new FiscalYear(2026)))?.result().cents, -37100);
  await assertRejects(
    () =>
      new RecordEntry(fx, fx).execute({
        date: '2027-03-01',
        kind: 'income',
        concept: 'Tarde',
        category: 'other_income',
        method: 'cash',
        amount: '5',
      }),
    PeriodClosed,
  );
  await assertRejects(() => close().execute(2026), SeasonAlreadyClosed);
});

Deno.test('CloseSeason should refuse while an older season with movements is open or before the last month', async () => {
  const { fx, close } = setUp();
  fx.external = [{
    source: 'payment',
    sourceId: 'p0',
    date: '2024-10-02',
    kind: 'income',
    concept: 'Octubre 2024',
    category: 'fees',
    method: 'cash',
    amountCents: 4500,
    studentId: 'martina',
    period: '2024-10',
  }];
  await assertRejects(() => close().execute(2026), PreviousSeasonOpen);
  const fresh = setUp();
  await assertRejects(() => fresh.close().execute(2027), SeasonNotFinished);
});

Deno.test('DeleteEntry should only delete manual entries of open seasons', async () => {
  const { fx } = setUp();
  const id = await new RecordEntry(fx, fx).execute({
    date: '2027-08-10',
    kind: 'expense',
    concept: 'Comisión banco',
    category: 'other_expenses',
    method: 'card',
    amount: '10',
  });
  await new DeleteEntry(fx, fx).execute(id);
  assertEquals(fx.entries.size, 0);
});
