import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  accountOf,
  Attachment,
  CategoryCatalog,
  categoryKind,
  categoryLabel,
  ExpectedExpense,
  ExpectedExpenseId,
  FiscalYear,
  InvoiceAlreadyPaid,
  ManualEntry,
  ManualEntryId,
  PeriodShares,
  SeasonClosing,
  SupplierInvoice,
  SupplierInvoiceId,
  Transfer,
  TransferId,
  Treasury,
} from '../../src/domain/accounting/mod.ts';

const cat = (code: string) => CategoryCatalog.of([]).require(code);

Deno.test('FiscalYear should run from september to august', () => {
  const year = FiscalYear.of(LocalDate.fromString('2027-08-31'));
  assertEquals(year.startYear, 2026);
  assertEquals(year.label(), '2026/27');
  assertEquals(year.months()[0]?.toString(), '2026-09');
  assertEquals(year.months()[11]?.toString(), '2027-08');
  assert(year.includes(LocalDate.fromString('2026-09-01')));
  assertFalse(year.includes(LocalDate.fromString('2027-09-01')));
  assertEquals(FiscalYear.of(LocalDate.fromString('2027-09-01')).startYear, 2027);
  assert(FiscalYear.ofMonth(YearMonth.fromString('2027-02')).equals(year));
});

Deno.test('ManualEntry should keep income and expense categories apart and require a positive amount', () => {
  assertEquals(categoryKind('rent'), 'expense');
  assertEquals(categoryKind('grants'), 'income');
  assertEquals(categoryLabel('federation'), 'Federación');
  const date = LocalDate.fromString('2026-10-01');
  assertThrows(
    () =>
      ManualEntry.record(
        ManualEntryId.generate(),
        date,
        'income',
        'Alquiler',
        cat('rent'),
        'transfer',
        Money.euros(950),
      ),
    InvalidValue,
  );
  assertThrows(
    () =>
      ManualEntry.record(
        ManualEntryId.generate(),
        date,
        'expense',
        'Comisión',
        cat('other_expenses'),
        'card',
        Money.zero(),
      ),
    InvalidValue,
  );
  assertThrows(
    () =>
      ManualEntry.record(
        ManualEntryId.generate(),
        date,
        'expense',
        '  ',
        cat('other_expenses'),
        'card',
        Money.euros(1),
      ),
    InvalidValue,
  );
  assertEquals(
    ManualEntry.record(
      ManualEntryId.generate(),
      date,
      'expense',
      ' Comisión ',
      cat('other_expenses'),
      'card',
      Money.euros(1),
    ).concept,
    'Comisión',
  );
});

Deno.test('SupplierInvoice should be paid once and replace its attachment', () => {
  const invoice = SupplierInvoice.register(
    SupplierInvoiceId.generate(),
    LocalDate.fromString('2026-10-01'),
    'E-0912',
    'Escaque Material Didáctico',
    'Tablero mural',
    cat('material'),
    Money.cents(8600),
  );
  assertFalse(invoice.isPaid());
  assertEquals(
    invoice.attach(new Attachment('invoices/a.pdf', 'factura.pdf', 'application/pdf', 1200)),
    null,
  );
  invoice.pay(LocalDate.fromString('2026-10-03'), 'transfer');
  assert(invoice.isPaid());
  assertEquals(invoice.attachment()?.originalName, 'factura.pdf');
  assertThrows(() => invoice.pay(LocalDate.fromString('2026-10-04'), 'cash'), InvoiceAlreadyPaid);
  assertThrows(
    () =>
      SupplierInvoice.register(
        SupplierInvoiceId.generate(),
        LocalDate.fromString('2026-10-01'),
        'X',
        'P',
        'C',
        cat('grants'),
        Money.euros(1),
      ),
    InvalidValue,
  );
  assertThrows(
    () =>
      SupplierInvoice.register(
        SupplierInvoiceId.generate(),
        LocalDate.fromString('2026-10-01'),
        'X',
        '',
        'C',
        cat('rent'),
        Money.euros(1),
      ),
    InvalidValue,
  );
});

Deno.test('SupplierInvoice should let its header be amended, and its payment only once paid', () => {
  const invoice = SupplierInvoice.register(
    SupplierInvoiceId.generate(),
    LocalDate.fromString('2026-10-01'),
    'E-0912',
    'Escaque Material Didáctico',
    'Tablero mural',
    cat('material'),
    Money.cents(8600),
  );
  const amendment = {
    date: LocalDate.fromString('2026-10-02'),
    number: 'E-0913',
    supplier: 'Escaque',
    concept: 'Tablero mural grande',
    category: cat('rent'),
    amount: Money.cents(9000),
    shares: PeriodShares.single(YearMonth.fromString('2026-09'), Money.cents(9000)),
    paidOn: LocalDate.fromString('2026-10-09'),
    method: 'cash' as const,
  };

  invoice.amend(amendment);
  assertEquals(
    [
      invoice.date.toString(),
      invoice.number,
      invoice.supplier,
      invoice.concept,
      invoice.category,
      invoice.amount.cents,
      invoice.period.toString(),
    ],
    ['2026-10-02', 'E-0913', 'Escaque', 'Tablero mural grande', 'rent', 9000, '2026-09'],
  );
  // Pendiente: el pago no se toca.
  assertFalse(invoice.isPaid());

  invoice.pay(LocalDate.fromString('2026-10-03'), 'transfer');
  invoice.amend(amendment);
  assertEquals([invoice.paidOn()?.toString(), invoice.method()], ['2026-10-09', 'cash']);
  // Pagada, la corrección no puede dejarla sin fecha ni sin forma de pago.
  assertThrows(() => invoice.amend({ ...amendment, paidOn: null }), InvalidValue);
  assertThrows(() => invoice.amend({ ...amendment, method: null }), InvalidValue);
  assertThrows(() => invoice.amend({ ...amendment, supplier: ' ' }), InvalidValue);
  assertThrows(() => invoice.amend({ ...amendment, concept: '' }), InvalidValue);
  assertThrows(() => invoice.amend({ ...amendment, category: cat('grants') }), InvalidValue);
  assertThrows(() => invoice.amend({ ...amendment, amount: Money.cents(0) }), InvalidValue);
});

Deno.test('Attachment should only accept documents and photos up to ten megabytes', () => {
  assertThrows(
    () => new Attachment('invoices/a.exe', 'virus.exe', 'application/x-msdownload', 1000),
    InvalidValue,
  );
  assertThrows(
    () => new Attachment('invoices/a.pdf', 'grande.pdf', 'application/pdf', 11 * 1024 * 1024),
    InvalidValue,
  );
  assertEquals(new Attachment('invoices/a.jpg', 'foto.jpg', 'image/jpeg', 10).bytes, 10);
});

Deno.test('SeasonClosing should close a season with its result, split between bank and cash', () => {
  const closing = SeasonClosing.close(
    FiscalYear.of(LocalDate.fromString('2026-10-01')),
    Money.euros(52000),
    Money.euros(48000),
    Money.euros(1500),
    LocalDate.fromString('2027-09-01'),
  );
  assertEquals(closing.result().cents, 400000);
  assertEquals(closing.cash.cents, 150000);
  assertEquals(closing.bankResult().cents, 250000);
  assert(closing.year.includes(LocalDate.fromString('2027-01-15')));
});

Deno.test('cash goes to the cash box and transfers and cards to the bank', () => {
  assertEquals(accountOf('cash'), 'cash');
  assertEquals(accountOf('transfer'), 'bank');
  assertEquals(accountOf('card'), 'bank');
});

Deno.test('Transfer should move money between different accounts, more than zero', () => {
  const transfer = Transfer.record(
    TransferId.generate(),
    LocalDate.fromString('2026-10-20'),
    'cash',
    'bank',
    Money.euros(500),
    '  Ingreso del efectivo de septiembre ',
  );
  assertEquals(transfer.note, 'Ingreso del efectivo de septiembre');
  assertThrows(
    () =>
      Transfer.record(
        TransferId.generate(),
        LocalDate.fromString('2026-10-20'),
        'bank',
        'bank',
        Money.euros(500),
        '',
      ),
    InvalidValue,
  );
  assertThrows(
    () =>
      Transfer.record(
        TransferId.generate(),
        LocalDate.fromString('2026-10-20'),
        'bank',
        'cash',
        Money.zero(),
        '',
      ),
    InvalidValue,
  );
});

Deno.test('Treasury should split the balance by where each movement was paid, moved by the transfers', () => {
  const balances = Treasury.balances(
    { bankCents: 100000, cashCents: 20000 },
    [
      { kind: 'income', method: 'cash', amountCents: 4500 },
      { kind: 'income', method: 'card', amountCents: 4000 },
      { kind: 'expense', method: 'transfer', amountCents: 95000 },
    ],
    [
      Transfer.record(
        TransferId.generate(),
        LocalDate.fromString('2026-10-20'),
        'cash',
        'bank',
        Money.euros(200),
        '',
      ),
    ],
  );
  assertEquals(balances, { clubCents: 33500, bankCents: 29000, cashCents: 4500 });
});

Deno.test('the club expenses have their own categories: president, cleaning and each utility', () => {
  assertEquals(
    (['president', 'cleaning', 'water', 'electricity', 'internet'] as const).map((c) => [
      categoryLabel(c),
      categoryKind(c),
    ]),
    [
      ['Presidente', 'expense'],
      ['Limpieza', 'expense'],
      ['Agua', 'expense'],
      ['Electricidad', 'expense'],
      ['Wifi', 'expense'],
    ],
  );
});

Deno.test('entries and invoices belong to the month of their date unless another one is given', () => {
  const date = LocalDate.fromString('2026-10-03');
  const entry = (period?: YearMonth) =>
    ManualEntry.record(
      ManualEntryId.generate(),
      date,
      'expense',
      'Luz de septiembre',
      cat('electricity'),
      'transfer',
      Money.euros(80),
      period ? PeriodShares.single(period, Money.euros(80)) : null,
    );
  assertEquals(entry().period.toString(), '2026-10');
  assertEquals(entry(YearMonth.fromString('2026-09')).period.toString(), '2026-09');
  const invoice = SupplierInvoice.register(
    SupplierInvoiceId.generate(),
    date,
    'A-1',
    'Propietario del local',
    'Alquiler de septiembre',
    cat('rent'),
    Money.euros(950),
    PeriodShares.single(YearMonth.fromString('2026-09'), Money.euros(950)),
  );
  assertEquals(invoice.period.toString(), '2026-09');
});

Deno.test('CategoryCatalog should add and rename the club own categories, never the built-in ones', () => {
  const catalog = CategoryCatalog.of([]);
  assertEquals(catalog.add('c_seguro', 'expense', ' Seguro '), {
    code: 'c_seguro',
    kind: 'expense',
    label: 'Seguro',
    custom: true,
  });
  assertEquals(catalog.require('c_seguro', 'expense').label, 'Seguro');
  // Va después de las de serie de su tipo.
  assertEquals(catalog.all().filter((c) => c.kind === 'expense').at(-1)?.code, 'c_seguro');
  assertThrows(() => catalog.require('c_seguro', 'income'), InvalidValue);
  assertThrows(() => catalog.require('nope'), InvalidValue);
  // Sin nombres repetidos en el mismo tipo, tampoco con las de serie.
  assertThrows(() => catalog.add('c_otro', 'expense', 'alquiler'), InvalidValue);
  assertThrows(() => catalog.add('c_vacia', 'income', '  '), InvalidValue);
  assertEquals(catalog.rename('c_seguro', 'Seguro del local').label, 'Seguro del local');
  assertEquals(catalog.label('c_seguro'), 'Seguro del local');
  assertThrows(() => catalog.rename('rent', 'Local'), InvalidValue);
});

Deno.test('PeriodShares should split an amount equally between months, the first ones taking the spare cents', () => {
  const months = ['2026-10', '2026-11', '2026-12'].map((m) => YearMonth.fromString(m));
  const shares = PeriodShares.equal(Money.euros(100), months);
  assertEquals(
    shares.list().map((s) => [s.period.toString(), s.amount.cents]),
    [['2026-10', 3334], ['2026-11', 3333], ['2026-12', 3333]],
  );
  assertEquals(shares.first.toString(), '2026-10');
  assertFalse(shares.isSingle());
  assert(PeriodShares.single(YearMonth.fromString('2026-09'), Money.euros(80)).isSingle());
});

Deno.test('PeriodShares should take amounts by hand that add up to the total, in month order', () => {
  const share = (period: string, euros: number) => ({
    period: YearMonth.fromString(period),
    amount: Money.euros(euros),
  });
  const shares = PeriodShares.of(Money.euros(300), [share('2026-12', 50), share('2026-10', 250)]);
  assertEquals(shares.list().map((s) => s.period.toString()), ['2026-10', '2026-12']);
  assertThrows(
    () => PeriodShares.of(Money.euros(300), [share('2026-10', 100), share('2026-11', 100)]),
    InvalidValue,
    'sumar el importe',
  );
  assertThrows(
    () => PeriodShares.of(Money.euros(200), [share('2026-10', 100), share('2026-10', 100)]),
    InvalidValue,
  );
  assertThrows(
    () => PeriodShares.of(Money.euros(100), [share('2026-10', 100), share('2026-11', 0)]),
    InvalidValue,
  );
  assertThrows(() => PeriodShares.of(Money.euros(100), []), InvalidValue);
});

Deno.test('entries and invoices can apply to several months, no further than a year from their date', () => {
  const date = LocalDate.fromString('2027-01-20');
  const months = ['2026-10', '2026-11', '2026-12'].map((m) => YearMonth.fromString(m));
  const entry = ManualEntry.record(
    ManualEntryId.generate(),
    date,
    'expense',
    'IVA del cuarto trimestre',
    cat('other_expenses'),
    'transfer',
    Money.euros(300),
    PeriodShares.equal(Money.euros(300), months),
  );
  assertEquals(entry.shares.months().map((m) => m.toString()), ['2026-10', '2026-11', '2026-12']);
  assertEquals(entry.period.toString(), '2026-10', 'el primero, para mostrarlo');
  assertThrows(
    () =>
      ManualEntry.record(
        ManualEntryId.generate(),
        date,
        'expense',
        'IVA',
        cat('other_expenses'),
        'transfer',
        Money.euros(200),
        PeriodShares.equal(Money.euros(300), months),
      ),
    InvalidValue,
    'sumar el importe',
  );
  assertThrows(
    () =>
      SupplierInvoice.register(
        SupplierInvoiceId.generate(),
        date,
        'A-1',
        'Hacienda',
        'IVA',
        cat('other_expenses'),
        Money.euros(10),
        PeriodShares.single(YearMonth.fromString('2025-12'), Money.euros(10)),
      ),
    InvalidValue,
    'un año',
  );
});

Deno.test('ExpectedExpense should be expected in its months of the year from the month it starts', () => {
  const cleaning = ExpectedExpense.define(
    ExpectedExpenseId.generate(),
    'Limpieza',
    cat('cleaning'),
    Money.euros(120),
    null,
    YearMonth.fromString('2026-10'),
  );
  const month = (m: string) => YearMonth.fromString(m);
  assertEquals(
    cleaning.months,
    [9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
    'por defecto, de septiembre a junio',
  );
  assert(cleaning.expectedIn(month('2026-11')));
  assertFalse(cleaning.expectedIn(month('2026-09')), 'antes de empezar');
  assertFalse(cleaning.expectedIn(month('2027-07')), 'en julio no hay');

  cleaning.revise('Limpieza del local', cat('cleaning'), Money.euros(130), [
    7,
    8,
    9,
    10,
    11,
    12,
    1,
    2,
    3,
    4,
    5,
    6,
  ], month('2026-09'));
  assert(cleaning.expectedIn(month('2027-07')));
  assertEquals([cleaning.concept, cleaning.amount.cents], ['Limpieza del local', 13000]);
});

Deno.test('ExpectedExpense should need a concept, an expense category other than teachers, an amount and months', () => {
  const define = (category: string, euros: number, months: number[] | null, concept = 'Alquiler') =>
    ExpectedExpense.define(
      ExpectedExpenseId.generate(),
      concept,
      cat(category),
      Money.euros(euros),
      months,
      YearMonth.fromString('2026-10'),
    );
  assertThrows(() => define('rent', 950, null, ' '), InvalidValue);
  assertThrows(() => define('grants', 950, null), InvalidValue);
  assertThrows(() => define('teachers', 950, null), InvalidValue, 'horario');
  assertThrows(() => define('rent', 0, null), InvalidValue);
  assertThrows(() => define('rent', 950, []), InvalidValue);
  assertThrows(() => define('rent', 950, [13]), InvalidValue);
  assertEquals(
    define('rent', 950, [10, 9, 10]).months,
    [9, 10],
    'sin repetir, en el orden de la temporada',
  );
});
