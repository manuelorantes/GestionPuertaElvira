import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, Money } from '../../src/domain/common/mod.ts';
import { FiscalYear, SeasonClosing, SupplierInvoiceId } from '../../src/domain/accounting/mod.ts';
import {
  AddCategory,
  AmendInvoice,
  AttachDocument,
  CategoryInUse,
  CloseSeason,
  DeleteEntry,
  DeleteInvoice,
  DeleteTransfer,
  EditMovement,
  FiscalYearSummary,
  ListCategories,
  ListTransfers,
  MonthLedger,
  PayInvoice,
  PreviousSeasonOpen,
  RecordEntry,
  RecordTransfer,
  RegisterInvoice,
  RemoveCategory,
  RenameCategory,
  SeasonAlreadyClosed,
  SeasonNotFinished,
  SupplierInvoiceNotFound,
  TransferNotFound,
  TreasuryBalances,
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
      shares: [{ period: '2026-10', amountCents: 4500 }],
      corrected: false,
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
      shares: [{ period: '2026-09', amountCents: 41600 }],
      corrected: false,
    },
  ];
  const registerInvoice = (
    date: string,
    concept: string,
    category: string,
    amount: string,
    document: UploadedDocument | null = null,
  ) =>
    new RegisterInvoice(fx, fx, fx, fx).execute({
      date,
      number: 'F-1',
      supplier: 'Proveedor',
      concept,
      category,
      amount,
    }, document);
  const treasury = () => new TreasuryBalances(fx, fx, fx, fx.clock);
  const close = () =>
    new CloseSeason(new FiscalYearSummary(fx, fx, fx.clock), fx, treasury(), fx.clock);
  return { fx, registerInvoice, close, treasury };
}

Deno.test('MonthLedger should list the month with income, expenses and spending by category', async () => {
  const { fx, registerInvoice } = setUp();
  await new RecordEntry(fx, fx, fx).execute({
    date: '2026-10-10',
    kind: 'income',
    concept: 'Subvención municipal',
    category: 'grants',
    method: 'transfer',
    amount: '600',
  });
  const invoice = await registerInvoice('2026-10-01', 'Alquiler octubre', 'rent', '950');
  await new PayInvoice(fx, fx).execute(invoice, '2026-10-01', 'transfer');
  const ledger = await new MonthLedger(fx, fx).execute('2026-10');
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
      Money.euros(100),
      LocalDate.fromString('2026-09-01'),
    ),
  );
  await new RecordEntry(fx, fx, fx).execute({
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
  assertEquals(
    [
      october?.month,
      october?.incomeCents,
      october?.expenseCents,
      october?.resultCents,
      october?.accumulatedCents,
    ],
    ['2026-10', 4500, 0, 4500, 60000 - 37100],
    'la liquidación de septiembre cuenta en septiembre',
  );
  assertEquals(summary.months[0]?.expenseCents, 41600);
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
      new RecordEntry(fx, fx, fx).execute({
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
    shares: [{ period: '2024-10', amountCents: 4500 }],
    corrected: false,
  }];
  await assertRejects(() => close().execute(2026), PreviousSeasonOpen);
  const fresh = setUp();
  await assertRejects(() => fresh.close().execute(2027), SeasonNotFinished);
});

Deno.test('DeleteEntry should only delete manual entries of open seasons', async () => {
  const { fx } = setUp();
  const id = await new RecordEntry(fx, fx, fx).execute({
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

Deno.test('the club adds and renames its own categories, and removes them only while unused', async () => {
  const fx = new AccountingFixture();
  const seguro = await new AddCategory(fx).execute('expense', 'Seguro');
  assertEquals(
    (await new ListCategories(fx).execute()).filter((c) => c.custom).map((c) => c.label),
    ['Seguro'],
  );
  await new RenameCategory(fx).execute(seguro.code, 'Seguro del local');
  await new RecordEntry(fx, fx, fx).execute({
    date: '2026-10-10',
    kind: 'expense',
    concept: 'Póliza anual',
    category: seguro.code,
    method: 'transfer',
    amount: '300',
  });
  const ledger = await new MonthLedger(fx, fx).execute('2026-10');
  assertEquals(ledger.expensesByCategory.map((c) => c.label), ['Seguro del local']);
  await assertRejects(() => new RemoveCategory(fx).execute(seguro.code), CategoryInUse);
  await assertRejects(() => new RemoveCategory(fx).execute('rent'), InvalidValue);
  const unused = await new AddCategory(fx).execute('income', 'Rifa');
  await new RemoveCategory(fx).execute(unused.code);
  assertEquals((await new ListCategories(fx).execute()).filter((c) => c.custom).length, 1);
});

Deno.test('AmendInvoice should correct the whole invoice, its payment included, within open seasons', async () => {
  const { fx, registerInvoice } = setUp();
  const amend = new AmendInvoice(fx, fx, fx);
  const invoice = await registerInvoice('2026-10-01', 'Alquiler', 'rent', '950');
  await new PayInvoice(fx, fx).execute(invoice, '2026-10-05', 'transfer');
  const input = {
    date: '2026-10-02',
    number: 'F-2',
    supplier: 'Casero',
    concept: 'Alquiler de octubre',
    category: 'rent',
    amount: '900',
    period: '2026-09',
    paidOn: '2026-10-09',
    method: 'cash',
  };

  await amend.execute(invoice, input);
  const stored = await fx.invoice(SupplierInvoiceId.fromString(invoice));
  assertEquals(
    [
      stored?.date.toString(),
      stored?.number,
      stored?.supplier,
      stored?.concept,
      stored?.amount.cents,
      stored?.period.toString(),
      stored?.paidOn()?.toString(),
      stored?.method(),
    ],
    ['2026-10-02', 'F-2', 'Casero', 'Alquiler de octubre', 90000, '2026-09', '2026-10-09', 'cash'],
  );
  // En el libro sale el día del pago corregido.
  const ledger = await new MonthLedger(fx, fx).execute('2026-10');
  assertEquals(ledger.lines.find((l) => l.sourceId === invoice)?.date, '2026-10-09');

  // Pendiente: el pago no se toca, aunque venga.
  const pending = await registerInvoice('2026-10-03', 'Luz', 'electricity', '80');
  await amend.execute(pending, { ...input, paidOn: '2026-10-09', method: 'cash' });
  assertEquals((await fx.invoice(SupplierInvoiceId.fromString(pending)))?.isPaid(), false);

  await assertRejects(() => amend.execute(invoice, { ...input, category: 'fees' }), InvalidValue);
  await assertRejects(() => amend.execute(invoice, { ...input, paidOn: null }), InvalidValue);
  await assertRejects(
    () => amend.execute(SupplierInvoiceId.generate().value, input),
    SupplierInvoiceNotFound,
  );
  // Ni la factura de una temporada cerrada ni moverla a una.
  await fx.saveClosing(
    SeasonClosing.close(
      new FiscalYear(2025),
      Money.euros(0),
      Money.euros(0),
      Money.euros(0),
      LocalDate.fromString('2026-09-01'),
    ),
  );
  await assertRejects(
    () => amend.execute(invoice, { ...input, paidOn: '2026-08-31' }),
    PeriodClosed,
  );
  await assertRejects(() => amend.execute(invoice, { ...input, date: '2026-08-31' }), PeriodClosed);
  await amend.execute(invoice, input);
});

Deno.test('EditMovement should edit entries and invoices, and correct payments only in accounting', async () => {
  const { fx, registerInvoice } = setUp();
  const edit = new EditMovement(fx, fx, fx, fx, fx, fx, fx);
  const line = async (source: string, id: string) =>
    (await new MonthLedger(fx, fx).execute('2026-10')).lines.find(
      (l) => l.source === source && l.sourceId === id,
    );

  const entry = await new RecordEntry(fx, fx, fx).execute({
    date: '2026-10-10',
    kind: 'expense',
    concept: 'Luz',
    category: 'electricity',
    method: 'card',
    amount: '80',
  });
  await edit.execute({
    source: 'manual',
    sourceId: entry,
    month: '2026-10',
    concept: 'Luz de septiembre',
    category: 'electricity',
    method: 'transfer',
    amount: '85',
    period: '2026-09',
  });
  assertEquals(await line('manual', entry), {
    source: 'manual',
    sourceId: entry,
    date: '2026-10-10',
    kind: 'expense',
    concept: 'Luz de septiembre',
    category: 'electricity',
    method: 'transfer',
    amountCents: 8500,
    studentId: null,
    period: '2026-09',
    shares: [{ period: '2026-09', amountCents: 8500 }],
    corrected: false,
  });

  const invoice = await registerInvoice('2026-10-01', 'Alquiler', 'rent', '950');
  await new PayInvoice(fx, fx).execute(invoice, '2026-10-05', 'transfer');
  // El concepto llega como en el libro, con el proveedor delante.
  await edit.execute({
    source: 'invoice',
    sourceId: invoice,
    month: '2026-10',
    concept: 'Proveedor · Alquiler de octubre',
    category: 'rent',
    method: 'cash',
    amount: '900',
    period: '2026-10',
  });
  const edited = await line('invoice', invoice);
  assertEquals(
    [edited?.concept, edited?.amountCents, edited?.method],
    ['Proveedor · Alquiler de octubre', 90000, 'cash'],
  );

  // Un cobro: se corrige solo en contabilidad (y la forma de pago, también en el cobro).
  await edit.execute({
    source: 'payment',
    sourceId: 'p1',
    month: '2026-10',
    concept: 'Octubre 2026 · Martina López',
    category: 'other_income',
    method: 'transfer',
    amount: '40',
    period: '2026-10',
  });
  const payment = await line('payment', 'p1');
  assertEquals(
    [payment?.amountCents, payment?.category, payment?.method, payment?.corrected],
    [4000, 'other_income', 'transfer', true],
  );
  assertEquals(fx.paymentMethodChanges, [['p1', 'transfer']]);

  // La categoría tiene que ser del mismo tipo.
  await assertRejects(
    () =>
      edit.execute({
        source: 'settlement',
        sourceId: 's1',
        month: '2026-10',
        concept: 'Liquidación',
        category: 'fees',
        method: 'transfer',
        amount: '416',
        period: '2026-09',
      }),
    InvalidValue,
  );
});

Deno.test('TreasuryBalances should tell what the club has in the bank and in cash, as of today', async () => {
  const { fx, treasury } = setUp();
  // Arrastrado: 600 € de resultado, de los que 100 € quedaron en caja.
  await fx.saveClosing(
    SeasonClosing.close(
      new FiscalYear(2025),
      Money.euros(1000),
      Money.euros(400),
      Money.euros(100),
      LocalDate.fromString('2026-09-01'),
    ),
  );
  // Hoy es el 25 de octubre de 2026: lo de este mes cuenta (45 € en efectivo, 416 € por transferencia).
  fx.clock.advanceSeconds(-315 * 24 * 3600);
  await new RecordTransfer(fx, fx).execute({
    date: '2026-10-20',
    from: 'cash',
    to: 'bank',
    amount: '120',
    note: 'Ingreso del efectivo',
  });
  // Un traspaso del mes que viene aún no cuenta.
  await new RecordTransfer(fx, fx).execute({
    date: '2026-11-01',
    from: 'bank',
    to: 'cash',
    amount: '50',
  });
  const balances = await treasury().execute();
  assertEquals(balances, {
    clubCents: 60000 + 4500 - 41600,
    bankCents: 50000 - 41600 + 12000,
    cashCents: 10000 + 4500 - 12000,
  });
  const transfers = await new ListTransfers(fx).execute();
  assertEquals(transfers.map((t) => [t.date, t.from, t.to, t.amountCents, t.note]), [
    ['2026-11-01', 'bank', 'cash', 5000, ''],
    ['2026-10-20', 'cash', 'bank', 12000, 'Ingreso del efectivo'],
  ]);
});

Deno.test('transfers should respect closed seasons and reject the same account twice', async () => {
  const { fx } = setUp();
  await assertRejects(
    () =>
      new RecordTransfer(fx, fx).execute({
        date: '2026-10-20',
        from: 'bank',
        to: 'bank',
        amount: '10',
      }),
    InvalidValue,
  );
  await assertRejects(
    () =>
      new RecordTransfer(fx, fx).execute({
        date: '2026-10-20',
        from: 'safe',
        to: 'bank',
        amount: '10',
      }),
    InvalidValue,
  );
  const id = await new RecordTransfer(fx, fx).execute({
    date: '2026-08-20',
    from: 'bank',
    to: 'cash',
    amount: '10',
  });
  await fx.saveClosing(
    SeasonClosing.close(
      new FiscalYear(2025),
      Money.euros(0),
      Money.euros(0),
      Money.euros(0),
      LocalDate.fromString('2026-09-01'),
    ),
  );
  await assertRejects(() => new DeleteTransfer(fx, fx).execute(id), PeriodClosed);
  await assertRejects(
    () =>
      new RecordTransfer(fx, fx).execute({
        date: '2026-08-21',
        from: 'bank',
        to: 'cash',
        amount: '10',
      }),
    PeriodClosed,
  );
  await assertRejects(
    () => new DeleteTransfer(fx, fx).execute('00000000-0000-7000-8000-000000000000'),
    TransferNotFound,
  );
  const open = await new RecordTransfer(fx, fx).execute({
    date: '2026-10-20',
    from: 'bank',
    to: 'cash',
    amount: '10',
  });
  await new DeleteTransfer(fx, fx).execute(open);
  assertEquals((await new ListTransfers(fx).execute()).length, 1);
});

Deno.test('CloseSeason should freeze what the season moved in cash', async () => {
  const { fx, close } = setUp();
  // 45 € en efectivo cobrados en octubre de 2026 y 120 € sacados del banco: 165 € más en caja.
  await new RecordTransfer(fx, fx).execute({
    date: '2027-03-01',
    from: 'bank',
    to: 'cash',
    amount: '120',
  });
  await close().execute(2026);
  const closing = await fx.closing(new FiscalYear(2026));
  assertEquals(closing?.cash.cents, 16500);
  assertEquals(closing?.bankResult().cents, -41600 - 12000);
});

Deno.test('FiscalYearSummary should count each movement in the months it applies to, keeping the balance by payment date', async () => {
  const { fx } = setUp();
  // El IVA del cuarto trimestre se paga el 20 de enero y corresponde a octubre, noviembre y diciembre.
  await new RecordEntry(fx, fx, fx).execute({
    date: '2027-01-20',
    kind: 'expense',
    concept: 'IVA cuarto trimestre',
    category: 'other_expenses',
    method: 'transfer',
    amount: '300',
    shares: [
      { period: '2026-10', amountCents: 10000 },
      { period: '2026-11', amountCents: 10000 },
      { period: '2026-12', amountCents: 10000 },
    ],
  });
  // Un cobro de tres meses cuenta un tercio en cada uno.
  fx.external.push({
    source: 'payment',
    sourceId: 'p3',
    date: '2026-11-03',
    kind: 'income',
    concept: '3 meses · Hugo Ruiz',
    category: 'fees',
    method: 'transfer',
    amountCents: 12150,
    studentId: 'hugo',
    period: '2026-11',
    shares: [
      { period: '2026-11', amountCents: 4050 },
      { period: '2026-12', amountCents: 4050 },
      { period: '2027-01', amountCents: 4050 },
    ],
    corrected: false,
  });
  const summary = await new FiscalYearSummary(fx, fx, fx.clock).execute(2026);
  const month = (m: string) => summary.months.find((row) => row.month === m);
  assertEquals(
    ['2026-10', '2026-11', '2026-12', '2027-01'].map((m) => [
      month(m)?.incomeCents,
      month(m)?.expenseCents,
    ]),
    [[4500, 10000], [4050, 10000], [4050, 10000], [4050, 0]],
  );
  // El saldo sigue al dinero: el IVA sale en enero y el cobro entra entero en noviembre.
  assertEquals(
    ['2026-10', '2026-11', '2026-12', '2027-01'].map((m) => month(m)?.accumulatedCents),
    [-37100, -37100 + 12150, -37100 + 12150, -37100 + 12150 - 30000],
  );
  assertEquals(summary.resultCents, 4500 + 12150 - 41600 - 30000);
  assertEquals(summary.cashResultCents, 4500 + 12150 - 41600 - 30000);
});

Deno.test('a movement cannot apply to the months of a closed season, and the closing keeps what was paid', async () => {
  const { fx, close } = setUp();
  // Pagado en septiembre de 2027, corresponde a junio de 2027.
  await new RecordEntry(fx, fx, fx).execute({
    date: '2027-08-20',
    kind: 'expense',
    concept: 'IVA segundo trimestre',
    category: 'other_expenses',
    method: 'transfer',
    amount: '90',
  });
  await close().execute(2026);
  assertEquals((await fx.closing(new FiscalYear(2026)))?.result().cents, -37100 - 9000);
  const fresh = new AccountingFixture('2027-10-05T10:00:00+02:00');
  await fresh.saveClosing(
    SeasonClosing.close(
      new FiscalYear(2026),
      Money.zero(),
      Money.zero(),
      Money.zero(),
      LocalDate.fromString('2027-09-01'),
    ),
  );
  await assertRejects(
    () =>
      new RecordEntry(fresh, fresh, fresh).execute({
        date: '2027-10-01',
        kind: 'expense',
        concept: 'IVA tercer trimestre',
        category: 'other_expenses',
        method: 'transfer',
        amount: '90',
        shares: [
          { period: '2027-08', amountCents: 3000 },
          { period: '2027-09', amountCents: 6000 },
        ],
      }),
    PeriodClosed,
  );
});

Deno.test('entries, invoices and corrections keep the months they apply to', async () => {
  const { fx, registerInvoice } = setUp();
  const invoice = await new RegisterInvoice(fx, fx, fx, fx).execute({
    date: '2027-01-15',
    number: 'H-1',
    supplier: 'Hacienda',
    concept: 'IVA',
    category: 'other_expenses',
    amount: '300',
    shares: [
      { period: '2026-10', amountCents: 5000 },
      { period: '2026-11', amountCents: 25000 },
    ],
  }, null);
  await new PayInvoice(fx, fx).execute(invoice, '2027-01-20', 'transfer');
  const line = (await new MonthLedger(fx, fx).execute('2027-01')).lines[0];
  assertEquals(line?.shares, [
    { period: '2026-10', amountCents: 5000 },
    { period: '2026-11', amountCents: 25000 },
  ]);
  void registerInvoice;

  // Corregir en contabilidad un cobro de octubre para que cuente en septiembre y octubre.
  await new EditMovement(fx, fx, fx, fx, fx, fx, fx).execute({
    source: 'payment',
    sourceId: 'p1',
    month: '2026-10',
    concept: 'Octubre 2026 · Martina López',
    category: 'fees',
    method: 'cash',
    amount: '45',
    period: '2026-10',
    shares: [
      { period: '2026-09', amountCents: 2000 },
      { period: '2026-10', amountCents: 2500 },
    ],
  });
  const payment = (await new MonthLedger(fx, fx).execute('2026-10')).lines.find((l) =>
    l.sourceId === 'p1'
  );
  assertEquals(payment?.shares.map((s) => s.period), ['2026-09', '2026-10']);
  await assertRejects(
    () =>
      new EditMovement(fx, fx, fx, fx, fx, fx, fx).execute({
        source: 'payment',
        sourceId: 'p1',
        month: '2026-10',
        concept: 'Octubre',
        category: 'fees',
        method: 'cash',
        amount: '45',
        period: '2026-10',
        shares: [{ period: '2026-10', amountCents: 4000 }],
      }),
    InvalidValue,
  );
});
