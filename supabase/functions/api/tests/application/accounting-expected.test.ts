import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, Money } from '../../src/domain/common/mod.ts';
import { FiscalYear, SeasonClosing } from '../../src/domain/accounting/mod.ts';
import {
  DefineExpectedExpense,
  DeleteEntry,
  ExpectedExpensesOfMonth,
  ExpectedMonthSettled,
  ListExpectedExpenses,
  MonthLedger,
  PayExpectedExpense,
  RemoveExpectedExpense,
  RestoreExpectedMonth,
  ReviseExpectedExpense,
  SkipExpectedMonth,
} from '../../src/application/accounting/mod.ts';
import { PeriodClosed } from '../../src/application/common/mod.ts';
import { AccountingFixture } from '../support/accounting.ts';

function setUp() {
  const fx = new AccountingFixture('2026-11-05T10:00:00+01:00');
  const define = (
    concept: string,
    category: string,
    amount: string,
    months: number[] | null = null,
  ) => new DefineExpectedExpense(fx, fx, fx.clock).execute({ concept, category, amount, months });
  const ofMonth = async (month: string) =>
    (await new ExpectedExpensesOfMonth(fx).execute(month)).map((m) => [
      m.concept,
      m.status,
      m.expectedCents,
      m.paidCents,
    ]);
  const pay = (id: string, month: string, amount: string, date = '2026-11-03') =>
    new PayExpectedExpense(fx, fx, fx, fx).execute(id, month, {
      date,
      method: 'transfer',
      amount,
    });
  return { fx, define, ofMonth, pay };
}

Deno.test('expected expenses are defined from this month, listed and revised', async () => {
  const { fx, define } = setUp();
  const rent = await define('Alquiler del local', 'rent', '950');
  await define('Presidencia', 'president', '200', [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8]);
  assertEquals(
    (await new ListExpectedExpenses(fx).execute()).map((e) => [e.concept, e.amountCents, e.since]),
    [['Alquiler del local', 95000, '2026-11'], ['Presidencia', 20000, '2026-11']],
  );
  await new ReviseExpectedExpense(fx, fx).execute(rent, {
    concept: 'Alquiler',
    category: 'rent',
    amount: '975',
    months: null,
    since: '2026-09',
  });
  const [revised] = await new ListExpectedExpenses(fx).execute();
  assertEquals([revised?.concept, revised?.amountCents, revised?.since], [
    'Alquiler',
    97500,
    '2026-09',
  ]);
  await assertRejects(
    () => define('Profesora', 'teachers', '300'),
    InvalidValue,
  );
});

Deno.test('each month an expected expense is pending until paid for what it really cost, or skipped', async () => {
  const { fx, define, ofMonth, pay } = setUp();
  const cleaning = await define('Limpieza', 'cleaning', '120');
  const rent = await define('Alquiler', 'rent', '950');
  assertEquals(await ofMonth('2026-11'), [
    ['Limpieza', 'pending', 12000, null],
    ['Alquiler', 'pending', 95000, null],
  ]);
  assertEquals(await ofMonth('2026-10'), [], 'antes del mes desde el que se espera');

  // La limpiadora hizo más horas: se paga lo que fue, y el apunte corresponde a noviembre.
  const entryId = await pay(cleaning, '2026-11', '135,50', '2026-12-02');
  const ledger = await new MonthLedger(fx, fx).execute('2026-12');
  assertEquals(
    ledger.lines.map((l) => [l.concept, l.category, l.amountCents, l.period]),
    [['Limpieza', 'cleaning', 13550, '2026-11']],
  );
  await new SkipExpectedMonth(fx, fx).execute(rent, '2026-11');
  assertEquals(await ofMonth('2026-11'), [
    ['Limpieza', 'paid', 12000, 13550],
    ['Alquiler', 'skipped', 95000, null],
  ]);
  await assertRejects(() => pay(cleaning, '2026-11', '120'), ExpectedMonthSettled);
  await assertRejects(
    () => new SkipExpectedMonth(fx, fx).execute(cleaning, '2026-11'),
    ExpectedMonthSettled,
  );

  // «Volver a esperarlo» deshace el salto; quitar el apunte deja el mes pendiente otra vez.
  await new RestoreExpectedMonth(fx, fx).execute(rent, '2026-11');
  await new DeleteEntry(fx, fx).execute(entryId);
  assertEquals((await ofMonth('2026-11')).map((m) => m[1]), ['pending', 'pending']);

  // Pagar un mes saltado lo deja pagado.
  await new SkipExpectedMonth(fx, fx).execute(rent, '2026-12');
  await pay(rent, '2026-12', '950', '2026-12-01');
  assertEquals((await ofMonth('2026-12')).map((m) => m[1]), ['pending', 'paid']);

  await assertRejects(() => pay(rent, '2027-07', '950'), InvalidValue, 'no se espera');
  await new RemoveExpectedExpense(fx).execute(rent);
  assertEquals((await ofMonth('2026-12')).map((m) => m[0]), ['Limpieza']);
  assertEquals(
    (await new MonthLedger(fx, fx).execute('2026-12')).lines.length,
    1,
    'el apunte pagado se queda',
  );
});

Deno.test('expected expenses respect closed seasons', async () => {
  const { fx, define } = setUp();
  const rent = await define('Alquiler', 'rent', '950');
  await new ReviseExpectedExpense(fx, fx).execute(rent, {
    concept: 'Alquiler',
    category: 'rent',
    amount: '950',
    months: null,
    since: '2025-09',
  });
  await fx.saveClosing(
    SeasonClosing.close(
      new FiscalYear(2025),
      Money.zero(),
      Money.zero(),
      Money.zero(),
      LocalDate.fromString('2026-09-01'),
    ),
  );
  await assertRejects(() => new SkipExpectedMonth(fx, fx).execute(rent, '2026-06'), PeriodClosed);
  await assertRejects(
    () =>
      new PayExpectedExpense(fx, fx, fx, fx).execute(rent, '2026-06', {
        date: '2026-11-02',
        method: 'transfer',
        amount: '950',
      }),
    PeriodClosed,
  );
  assertEquals(fx.entries.size, 0);
});
