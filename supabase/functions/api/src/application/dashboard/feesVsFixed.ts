import { type Clock, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import { PeriodShares } from '../../domain/accounting/mod.ts';
import {
  type AccountingCategoryRepository,
  type AccountingSettingsRepository,
  type ExpectedExpenseRepository,
  expectedMonths,
  type LedgerLine,
  type MonthLedger,
} from '../accounting/mod.ts';
import type { ChargeView, ListMonthlyCharges } from '../billing/mod.ts';

/** Lo que cuesta (o se debe a) un profesor un mes. */
export interface TeacherCostView {
  teacherId: string;
  teacherName: string;
  /** Las horas previstas, en minutos (0 en lo que se debe de una liquidación). */
  minutes: number;
  cents: number;
}

/** Lo que costará el profesorado cada mes según el horario, a la tarifa de hoy, profesor a profesor. */
export interface ExpectedPayroll {
  byTeacher(first: YearMonth, last: YearMonth): Promise<Map<string, TeacherCostView[]>>;
}

/** Lo que aún se debe a cada profesor de cada mes: sus liquidaciones sin pagar. */
export interface PendingPayroll {
  byTeacher(first: YearMonth, last: YearMonth): Promise<Map<string, TeacherCostView[]>>;
}

/**
 * Adónde lleva una línea del detalle: el recibo que pagó la cuota, la cuota en la ficha del alumno, el movimiento (en el
 * mes de su fecha), la ficha del profesor en ese mes, el gasto esperado de ese mes o los movimientos del mes.
 */
export type FeesVsFixedLink =
  | { kind: 'receipt'; paymentId: string }
  | { kind: 'fee'; studentId: string; month: string }
  | { kind: 'movement'; sourceId: string; month: string }
  | { kind: 'teacher'; teacherId: string; month: string }
  | { kind: 'expected'; expenseId: string; month: string }
  | { kind: 'ledger'; month: string };

/** Una línea de lo que suma una parte de una barra. */
export interface FeesVsFixedItem {
  concept: string;
  detail: string;
  /** La del movimiento; nada en lo que aún no se ha movido. */
  date: string | null;
  /** Lo que suma a la barra (negativo en lo que la descuenta). */
  amountCents: number;
  /** El importe entero, si la línea es solo una parte (un apunte repartido, una cuota pagada en parte). */
  totalCents: number | null;
  link: FeesVsFixedLink;
}

export type FeesVsFixedPart = 'income' | 'expected' | 'expense' | 'expectedExpense';

/** Un mes de «Cuotas vs gastos fijos» con lo que suma cada parte de sus barras. */
export interface FeesVsFixedMonth {
  month: string;
  incomeCents: number;
  expectedCents: number;
  expenseCents: number;
  expectedExpenseCents: number;
  parts: Record<FeesVsFixedPart, FeesVsFixedItem[]>;
}

const sum = (items: FeesVsFixedItem[]) => items.reduce((total, i) => total + i.amountCents, 0);

function hours(minutes: number): string {
  return `${String(Math.round((minutes / 60) * 100) / 100).replace('.', ',')} h`;
}

const PENDING_FEE: Partial<Record<ChargeView['status'], string>> = {
  partial: 'Pagada en parte',
  overdue: 'Vencida',
  expected: 'Prevista',
};

/**
 * «Cuotas vs gastos fijos», línea a línea: las barras son la suma de sus líneas, así que el detalle cuadra siempre con
 * la gráfica. Las categorías «del mes», cada movimiento en los meses a los que corresponde. De las cuotas mensuales de
 * cada mes, lo que tienen cubierto (cobrado, sea cual sea el recibo que lo pagó) y lo que les falta: las emitidas y
 * pendientes (lo cancelado no se debe) y, en los meses que vienen, las previstas de los alumnos matriculados hoy. Del
 * mes en curso en adelante, lo que costará el profesorado según el horario menos lo suyo que ya está en el libro ese
 * mes; en los meses ya pasados, lo que aún se le debe (sus liquidaciones sin pagar), que no se va al cambiar de mes;
 * y, en cualquier mes, lo esperado de los gastos esperados de esas categorías que aún no se han pagado ni saltado.
 */
export class FeesVsFixed {
  constructor(
    private readonly charges: ListMonthlyCharges,
    private readonly settings: AccountingSettingsRepository,
    private readonly expectedPayroll: ExpectedPayroll,
    private readonly pendingPayroll: PendingPayroll,
    private readonly expected: ExpectedExpenseRepository,
  ) {}

  async months(
    months: string[],
    lines: LedgerLine[],
    first: YearMonth,
    last: YearMonth,
    current: YearMonth,
    label: (category: string) => string = (category) => category,
  ): Promise<FeesVsFixedMonth[]> {
    const categories = await this.settings.monthlyCategories();
    const withTeachers = categories.includes('teachers');
    const payroll = withTeachers && !last.isBefore(current)
      ? await this.expectedPayroll.byTeacher(current.isBefore(first) ? first : current, last)
      : new Map<string, TeacherCostView[]>();
    const lastPast = current.previous();
    const owed = withTeachers && !lastPast.isBefore(first)
      ? await this.pendingPayroll.byTeacher(first, last.isBefore(lastPast) ? last : lastPast)
      : new Map<string, TeacherCostView[]>();
    const pendingExpected = new Map<string, FeesVsFixedItem[]>();
    for (const view of await expectedMonths(this.expected, first, last)) {
      if (view.status !== 'pending' || !categories.includes(view.category)) continue;
      pendingExpected.set(view.period, [
        ...(pendingExpected.get(view.period) ?? []),
        {
          concept: view.concept,
          detail: `${label(view.category)} · gasto esperado`,
          date: null,
          amountCents: view.expectedCents,
          totalCents: null,
          link: { kind: 'expected', expenseId: view.expenseId, month: view.period },
        },
      ]);
    }
    const parts = new Map(
      months.map((m) => [m, {
        income: [] as FeesVsFixedItem[],
        expected: [] as FeesVsFixedItem[],
        expense: [] as FeesVsFixedItem[],
        teachers: 0,
      }]),
    );
    if (categories.includes('fees')) {
      const receipts = feeReceipts(lines);
      for (const [month, part] of parts) {
        const fees = (await this.charges.execute(month, 'monthly')).items
          .filter((charge) => charge.kind === 'monthly');
        for (const fee of fees) {
          const covered = Math.min(fee.coveredCents, fee.amountCents);
          const missing = Math.max(0, fee.amountCents - fee.coveredCents);
          const whole = covered > 0 && missing > 0 ? fee.amountCents : null;
          const inStudentPage: FeesVsFixedLink = { kind: 'fee', studentId: fee.studentId, month };
          if (covered > 0) {
            const paidBy = new Set(receipts.get(`${fee.studentId}/${month}`));
            if (fee.paymentId !== null) paidBy.add(fee.paymentId);
            part.income.push({
              concept: fee.studentName,
              detail: 'Cuota del mes',
              date: null,
              amountCents: covered,
              totalCents: whole,
              link: paidBy.size === 1
                ? { kind: 'receipt', paymentId: [...paidBy][0]! }
                : inStudentPage,
            });
          }
          if (missing > 0) {
            part.expected.push({
              concept: fee.studentName,
              detail: PENDING_FEE[fee.status] ?? 'Pendiente',
              date: null,
              amountCents: missing,
              totalCents: whole,
              link: inStudentPage,
            });
          }
        }
      }
    }
    for (const line of lines) {
      if (line.category === 'fees' || !categories.includes(line.category)) continue;
      for (const share of line.shares) {
        const part = parts.get(share.period);
        if (!part) continue;
        const item: FeesVsFixedItem = {
          concept: line.concept,
          detail: label(line.category),
          date: line.date,
          amountCents: share.amountCents,
          totalCents: share.amountCents === line.amountCents ? null : line.amountCents,
          link: { kind: 'movement', sourceId: line.sourceId, month: line.date.slice(0, 7) },
        };
        if (line.kind === 'income') part.income.push(item);
        else {
          part.expense.push(item);
          if (line.category === 'teachers') part.teachers += share.amountCents;
        }
      }
    }
    return months.map((m) => {
      const part = parts.get(m)!;
      const expectedTeachers = payroll.get(m) ?? [];
      const planned = expectedTeachers.reduce((total, t) => total + t.cents, 0);
      const expectedExpense: FeesVsFixedItem[] = expectedTeachers
        .filter((t) => t.cents > 0)
        .map((t) => ({
          concept: t.teacherName,
          detail: `Previsto según el horario · ${hours(t.minutes)}`,
          date: null,
          amountCents: t.cents,
          totalCents: null,
          link: { kind: 'teacher', teacherId: t.teacherId, month: m },
        }));
      // Lo del profesorado ya en el libro no se prevé otra vez (como mucho, todo lo previsto).
      const booked = Math.min(part.teachers, planned);
      if (booked > 0) {
        expectedExpense.push({
          concept: 'Profesorado ya en el libro',
          detail: 'Lo del profesorado ya pagado este mes',
          date: null,
          amountCents: -booked,
          totalCents: null,
          link: { kind: 'ledger', month: m },
        });
      }
      for (const t of owed.get(m) ?? []) {
        expectedExpense.push({
          concept: t.teacherName,
          detail: 'Liquidación sin pagar',
          date: null,
          amountCents: t.cents,
          totalCents: null,
          link: { kind: 'teacher', teacherId: t.teacherId, month: m },
        });
      }
      expectedExpense.push(...(pendingExpected.get(m) ?? []));
      const result = {
        income: part.income,
        expected: part.expected,
        expense: part.expense,
        expectedExpense,
      };
      return {
        month: m,
        incomeCents: sum(result.income),
        expectedCents: sum(result.expected),
        expenseCents: sum(result.expense),
        expectedExpenseCents: sum(result.expectedExpense),
        parts: result,
      };
    });
  }
}

/**
 * Los recibos de cuotas de cada alumno que reparten algo a cada mes («alumno/AAAA-MM» → recibos): si una cuota la pagó
 * uno solo, se enlaza a él.
 */
function feeReceipts(lines: LedgerLine[]): Map<string, Set<string>> {
  const receipts = new Map<string, Set<string>>();
  for (const line of lines) {
    if (line.source !== 'payment' || line.category !== 'fees' || line.studentId === null) continue;
    for (const share of line.shares) {
      const key = `${line.studentId}/${share.period}`;
      receipts.set(key, (receipts.get(key) ?? new Set()).add(line.sourceId));
    }
  }
  return receipts;
}

/** La temporada en curso de «Cuotas vs gastos fijos», con lo que suma cada parte de cada mes. */
export class FeesVsFixedDetail {
  constructor(
    private readonly chart: FeesVsFixed,
    private readonly ledger: MonthLedger,
    private readonly categories: AccountingCategoryRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ month: string; months: FeesVsFixedMonth[] }> {
    const month = YearMonth.of(LocalDate.fromInstant(this.clock.now()));
    const { first, last, lines } = await seasonLedger(this.ledger, month);
    const catalog = await this.categories.catalog();
    const months: string[] = [];
    for (let m = first; !last.isBefore(m); m = m.next()) months.push(m.toString());
    return {
      month: month.toString(),
      months: await this.chart.months(
        months,
        lines,
        first,
        last,
        month,
        (code) => catalog.label(code),
      ),
    };
  }
}

/**
 * La temporada de `month` (de septiembre a agosto) y los movimientos de alrededor: un gasto puede pagarse antes o
 * después de los meses a los que corresponde (como mucho, un año).
 */
export async function seasonLedger(ledger: MonthLedger, month: YearMonth) {
  const first = Season.containing(month).firstMonth();
  let last = first;
  for (let i = 1; i < 12; i++) last = last.next();
  let from = first;
  let to = last;
  for (let i = 0; i < PeriodShares.MAX_DISTANCE_MONTHS; i++) {
    from = from.previous();
    to = to.next();
  }
  const views = await ledger.between(from, to);
  return { first, last, views, lines: views.flatMap((v) => v.lines) };
}
