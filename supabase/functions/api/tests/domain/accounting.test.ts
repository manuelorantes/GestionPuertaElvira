import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  Attachment,
  categoryKind,
  categoryLabel,
  FiscalYear,
  InvoiceAlreadyPaid,
  ManualEntry,
  ManualEntryId,
  SeasonClosing,
  SupplierInvoice,
  SupplierInvoiceId,
} from '../../src/domain/accounting/mod.ts';

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
        'rent',
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
        'other_expenses',
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
        'other_expenses',
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
      'other_expenses',
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
    'material',
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
        'grants',
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
        'rent',
        Money.euros(1),
      ),
    InvalidValue,
  );
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

Deno.test('SeasonClosing should close a season with its result', () => {
  const closing = SeasonClosing.close(
    FiscalYear.of(LocalDate.fromString('2026-10-01')),
    Money.euros(52000),
    Money.euros(48000),
    LocalDate.fromString('2027-09-01'),
  );
  assertEquals(closing.result().cents, 400000);
  assert(closing.year.includes(LocalDate.fromString('2027-01-15')));
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
      'electricity',
      'transfer',
      Money.euros(80),
      period ?? null,
    );
  assertEquals(entry().period.toString(), '2026-10');
  assertEquals(entry(YearMonth.fromString('2026-09')).period.toString(), '2026-09');
  const invoice = SupplierInvoice.register(
    SupplierInvoiceId.generate(),
    date,
    'A-1',
    'Propietario del local',
    'Alquiler de septiembre',
    'rent',
    Money.euros(950),
    YearMonth.fromString('2026-09'),
  );
  assertEquals(invoice.period.toString(), '2026-09');
});
