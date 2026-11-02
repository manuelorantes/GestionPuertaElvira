import { assertEquals } from '@std/assert';

import { Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  ExpectedExpense,
  ExpectedExpenseId,
  MonthlyCategories,
} from '../../src/domain/accounting/mod.ts';
import type { LedgerLine } from '../../src/application/accounting/mod.ts';
import type { ChargeView, ListMonthlyCharges } from '../../src/application/billing/mod.ts';
import {
  type ExpectedPayroll,
  FeesVsFixed,
  type PendingPayroll,
  type TeacherCostView,
} from '../../src/application/dashboard/mod.ts';
import { AccountingFixture } from '../support/accounting.ts';

const ANA = '00000000-0000-4000-8000-00000000000a';
const BRUNO = '00000000-0000-4000-8000-00000000000b';
const CARLA = '00000000-0000-4000-8000-00000000000c';
const LUCIA = '00000000-0000-4000-8000-0000000000f1';
const PEDRO = '00000000-0000-4000-8000-0000000000f2';
const CLEANING = '00000000-0000-4000-8000-0000000000e1';

function fee(
  studentId: string,
  studentName: string,
  period: string,
  coveredCents: number,
  status: string,
  paymentId: string | null,
): ChargeView {
  return {
    id: `${studentId}/${period}`,
    studentId,
    studentName,
    guardianName: '',
    guardianPhone: '',
    kind: 'monthly',
    period,
    amountCents: 4500,
    status,
    paymentId,
    receiptNumber: null,
    remindedOn: null,
    coveredCents,
    manual: false,
    note: null,
    fullAmountCents: 4500,
    cancelledCents: 0,
    concept: null,
  };
}

function line(
  fields:
    & Pick<LedgerLine, 'source' | 'sourceId' | 'date' | 'kind' | 'category' | 'amountCents'>
    & Partial<LedgerLine>,
): LedgerLine {
  return {
    concept: fields.sourceId,
    method: 'transfer',
    studentId: null,
    period: fields.date.slice(0, 7),
    shares: [{ period: fields.date.slice(0, 7), amountCents: fields.amountCents }],
    corrected: false,
    ...fields,
  };
}

const cost = (teacherId: string, teacherName: string, cents: number): TeacherCostView => ({
  teacherId,
  teacherName,
  minutes: 600,
  cents,
});

/**
 * Octubre ya pasado y noviembre en curso: Ana pagó octubre con un solo recibo; a Bruno se lo cubrieron dos recibos y le
 * falta una parte; Carla tiene noviembre previsto y sin emitir. Una factura de luz de septiembre corresponde a octubre,
 * una subvención entra en noviembre y la liquidación de noviembre de Lucía ya está pagada; a Pedro se le debe octubre.
 */
async function season() {
  const charges = {
    execute: (month: string) =>
      Promise.resolve({
        month,
        items: month === '2026-10'
          ? [
            fee(ANA, 'Ana Ruiz', month, 4500, 'paid', 'p-ana'),
            fee(BRUNO, 'Bruno Gil', month, 3000, 'partial', 'p-bruno-1'),
          ]
          : [fee(CARLA, 'Carla Sanz', month, 0, 'expected', null)],
        expectedCents: 0,
        collectedCents: 0,
        overdueCount: 0,
      }),
  } as unknown as ListMonthlyCharges;
  const settings = {
    monthlyCategories: () =>
      Promise.resolve(
        MonthlyCategories.restore(['fees', 'teachers', 'electricity', 'cleaning', 'subsidies']),
      ),
    saveMonthlyCategories: () => Promise.resolve(),
  };
  const expectedPayroll: ExpectedPayroll = {
    byTeacher: () => Promise.resolve(new Map([['2026-11', [cost(LUCIA, 'Lucía Moreno', 30000)]]])),
  };
  const pendingPayroll: PendingPayroll = {
    byTeacher: () => Promise.resolve(new Map([['2026-10', [cost(PEDRO, 'Pedro Sáez', 12000)]]])),
  };
  const accounting = new AccountingFixture();
  await accounting.saveExpectedExpense(ExpectedExpense.restore({
    id: ExpectedExpenseId.fromString(CLEANING),
    concept: 'Limpieza',
    category: 'cleaning',
    amount: Money.cents(12000),
    months: [10, 11],
    since: YearMonth.fromString('2026-09'),
  }));
  const lines: LedgerLine[] = [
    line({
      source: 'payment',
      sourceId: 'p-ana',
      date: '2026-10-02',
      kind: 'income',
      category: 'fees',
      amountCents: 4500,
      studentId: ANA,
    }),
    line({
      source: 'payment',
      sourceId: 'p-bruno-1',
      date: '2026-10-02',
      kind: 'income',
      category: 'fees',
      amountCents: 2000,
      studentId: BRUNO,
    }),
    line({
      source: 'payment',
      sourceId: 'p-bruno-2',
      date: '2026-10-20',
      kind: 'income',
      category: 'fees',
      amountCents: 1000,
      studentId: BRUNO,
    }),
    line({
      source: 'invoice',
      sourceId: 'inv-luz',
      date: '2026-09-28',
      kind: 'expense',
      category: 'electricity',
      amountCents: 9000,
      shares: [{ period: '2026-10', amountCents: 9000 }],
    }),
    line({
      source: 'manual',
      sourceId: 'e-subvencion',
      date: '2026-11-03',
      kind: 'income',
      category: 'subsidies',
      amountCents: 50000,
    }),
    line({
      source: 'settlement',
      sourceId: `${LUCIA}/2026-11`,
      date: '2026-11-05',
      kind: 'expense',
      category: 'teachers',
      amountCents: 10000,
    }),
  ];
  const chart = new FeesVsFixed(charges, settings, expectedPayroll, pendingPayroll, accounting);
  const [october, november] = await chart.months(
    ['2026-10', '2026-11'],
    lines,
    YearMonth.fromString('2026-10'),
    YearMonth.fromString('2026-11'),
    YearMonth.fromString('2026-11'),
  );
  return { october: october!, november: november! };
}

Deno.test('fees vs fixed should link a fee paid by a single receipt to that receipt', async () => {
  const { october } = await season();
  assertEquals(
    october.parts.income.map((i) => [i.concept, i.link]),
    [
      ['Ana Ruiz', { kind: 'receipt', paymentId: 'p-ana' }],
      // Dos recibos la cubren: a su cuota en la ficha.
      ['Bruno Gil', { kind: 'fee', studentId: BRUNO, month: '2026-10' }],
    ],
  );
});

Deno.test('fees vs fixed should link what a fee is missing to that fee in the student page', async () => {
  const { october, november } = await season();
  assertEquals(october.parts.expected.map((i) => [i.concept, i.link]), [
    ['Bruno Gil', { kind: 'fee', studentId: BRUNO, month: '2026-10' }],
  ]);
  // Aún sin emitir: igual, a su ficha en ese mes.
  assertEquals(november.parts.expected.map((i) => [i.concept, i.link]), [
    ['Carla Sanz', { kind: 'fee', studentId: CARLA, month: '2026-11' }],
  ]);
});

Deno.test('fees vs fixed should link each movement to its row in the month of its date', async () => {
  const { october, november } = await season();
  assertEquals(october.parts.expense.map((i) => i.link), [
    { kind: 'movement', sourceId: 'inv-luz', month: '2026-09' },
  ]);
  assertEquals(november.parts.income.map((i) => [i.concept, i.link]), [
    ['e-subvencion', { kind: 'movement', sourceId: 'e-subvencion', month: '2026-11' }],
  ]);
  assertEquals(november.parts.expense.map((i) => i.link), [
    { kind: 'movement', sourceId: `${LUCIA}/2026-11`, month: '2026-11' },
  ]);
});

Deno.test('fees vs fixed should link teachers, expected expenses and the booked payroll', async () => {
  const { october, november } = await season();
  assertEquals(october.parts.expectedExpense.map((i) => [i.concept, i.link]), [
    ['Pedro Sáez', { kind: 'teacher', teacherId: PEDRO, month: '2026-10' }],
    ['Limpieza', { kind: 'expected', expenseId: CLEANING, month: '2026-10' }],
  ]);
  assertEquals(november.parts.expectedExpense.map((i) => [i.concept, i.link]), [
    ['Lucía Moreno', { kind: 'teacher', teacherId: LUCIA, month: '2026-11' }],
    ['Profesorado ya en el libro', { kind: 'ledger', month: '2026-11' }],
    ['Limpieza', { kind: 'expected', expenseId: CLEANING, month: '2026-11' }],
  ]);
});
