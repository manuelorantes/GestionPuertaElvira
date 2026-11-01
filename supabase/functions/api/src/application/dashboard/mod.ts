import { type Clock, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import { PeriodShares } from '../../domain/accounting/mod.ts';
import {
  type AccountingSettingsRepository,
  type ExpectedExpenseRepository,
  expectedMonths,
  type FiscalYearSummary,
  type LedgerLine,
  type MonthLedger,
} from '../accounting/mod.ts';
import type { BillingQuery, ChargeView, ListMonthlyCharges } from '../billing/mod.ts';
import type { ClassQuery, GroupSummary } from '../classes/mod.ts';
import type { StudentQuery } from '../students/mod.ts';

export interface MonthBars {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

/**
 * Un mes de «Cuotas vs gastos fijos»: además, las cuotas del mes que faltan por cobrar (emitidas y pendientes, o que
 * aún se emitirán a los alumnos matriculados) y lo que costará el profesorado según el horario y aún no está en el
 * libro.
 */
export interface MonthFeeBars extends MonthBars {
  expectedCents: number;
  expectedExpenseCents: number;
}

export interface ClubSummaryView {
  month: string;
  today: string;
  /** Saldo del club: el acumulado del ejercicio hasta el mes en curso, desde el saldo arrastrado. */
  balanceCents: number;
  /** Ingresos menos gastos del ejercicio hasta el mes en curso. */
  seasonResultCents: number;
  /** Lo que falta por cobrar de las cuotas del mes (y el material). */
  pendingCents: number;
  /** Cuotas de socio de la temporada sin cobrar: aparte de las cifras del mes. */
  membershipPendingCents: number;
  /** Socios de alta hoy. */
  activeStudents: number;
  /** Cuántos más (o menos) que al empezar el mes: altas menos bajas. */
  studentsChange: number;
  /** Socios de alta hoy que están en al menos una clase. */
  studentsInClasses: number;
  /** Cuántos más (o menos) que al empezar el mes. */
  inClassesChange: number;
  /** Lo que entra y sale cada mes, por fecha (cuadra con Contabilidad). */
  cashChart: MonthBars[];
  /** Cuotas vs gastos fijos: lo que corresponde a cada mes, solo con las categorías «del mes» de Contabilidad. */
  monthChart: MonthFeeBars[];
  occupancy: {
    percent: number;
    fullGroups: number;
    emptiest: {
      id: string;
      name: string;
      teacherName: string;
      occupied: number;
      capacity: number;
    }[];
  };
  overdue: ChargeView[];
  latest: LedgerLine[];
}

/** Lo que costará el profesorado cada mes según el horario, a la tarifa de hoy (céntimos por «AAAA-MM»). */
export interface ExpectedPayroll {
  between(first: YearMonth, last: YearMonth): Promise<Map<string, number>>;
}

/** Lo que aún se debe al profesorado de cada mes: sus liquidaciones sin pagar (céntimos por «AAAA-MM»). */
export interface PendingPayroll {
  between(first: YearMonth, last: YearMonth): Promise<Map<string, number>>;
}

/**
 * Resumen del club con cifras reales: lo compone a partir de Cobros, Contabilidad, Alumnado y Clases.
 */
export class ClubSummary {
  /** La temporada en el gráfico: de septiembre a agosto. */
  private static readonly CHART_MONTHS = 12;
  private static readonly LIST_SIZE = 6;

  constructor(
    private readonly charges: ListMonthlyCharges,
    private readonly billing: BillingQuery,
    private readonly ledger: MonthLedger,
    private readonly students: StudentQuery,
    private readonly classes: ClassQuery,
    private readonly clock: Clock,
    private readonly settings: AccountingSettingsRepository,
    private readonly expectedPayroll: ExpectedPayroll,
    private readonly fiscalYear: FiscalYearSummary,
    private readonly expected: ExpectedExpenseRepository,
    private readonly pendingPayroll: PendingPayroll,
  ) {}

  /**
   * Meses de margen alrededor de la temporada: un gasto puede pagarse antes o después de los meses a los que corresponde
   * (como mucho, un año).
   */
  private static readonly MARGIN_MONTHS = PeriodShares.MAX_DISTANCE_MONTHS;

  async execute(): Promise<ClubSummaryView> {
    const today = LocalDate.fromInstant(this.clock.now());
    const month = YearMonth.of(today);
    // Las cifras del mes, solo con sus cuotas (y el material); las de socio pendientes, aparte.
    const charges = await this.charges.execute(month.toString(), 'monthly');
    const memberships = await this.charges.execute(month.toString(), 'membership');
    const first = Season.containing(month).firstMonth();
    let last = first;
    for (let i = 1; i < ClubSummary.CHART_MONTHS; i++) last = last.next();
    let from = first;
    let to = last;
    for (let i = 0; i < ClubSummary.MARGIN_MONTHS; i++) {
      from = from.previous();
      to = to.next();
    }
    const views = await this.ledger.between(from, to);
    // De septiembre a agosto.
    const seasonViews = views.filter((v) => {
      const m = YearMonth.fromString(v.month);
      return !m.isBefore(first) && !last.isBefore(m);
    });
    const cashChart: MonthBars[] = seasonViews.map((v) => ({
      month: v.month,
      incomeCents: v.incomeCents,
      expenseCents: v.expenseCents,
    }));
    const monthChart = await this.monthChart(
      seasonViews.map((v) => v.month),
      views.flatMap((v) => v.lines),
      first,
      last,
      month,
    );
    let current: { expenseCents: number; lines: LedgerLine[] } | null = null;
    let previousLines: LedgerLine[] = [];
    for (const view of seasonViews) {
      const m = YearMonth.fromString(view.month);
      if (m.equals(month)) current = view;
      else if (m.next().equals(month)) previousLines = view.lines;
    }
    // El saldo: lo que Contabilidad acumula hasta este mes en «Mes a mes».
    const year = await this.fiscalYear.execute(Season.containing(month).startYear);
    const balance = year.months.find((m) => m.month === month.toString())?.accumulatedCents ??
      year.openingCents;
    const groups = await this.classes.groups(today);
    const active = await this.students.list('active', null, today);
    const inClasses = active.filter((s) => s.groups.length > 0);
    // «±x este mes»: frente al último día del mes anterior. Su alta vigente ha de ser de antes (quien vuelve
    // este mes tras una baja anterior no estaba), y sus grupos son los de ese día.
    const eve = today.startOfMonth().plusDays(-1);
    const activeBefore = (await this.students.list('active', null, eve))
      .filter((s) => s.joinedOn <= eve.toString());
    const inClassesBefore = activeBefore.filter((s) => s.groups.length > 0);
    const capacity = groups.reduce((sum, g) => sum + g.capacity, 0);
    const occupied = groups.reduce((sum, g) => sum + Math.min(g.occupied, g.capacity), 0);
    const emptiest = [...groups].sort((a: GroupSummary, b: GroupSummary) =>
      (b.capacity - b.occupied) - (a.capacity - a.occupied)
    );
    return {
      month: month.toString(),
      today: today.toString(),
      balanceCents: balance,
      seasonResultCents: balance - year.openingCents,
      pendingCents: charges.expectedCents - charges.collectedCents,
      membershipPendingCents: memberships.expectedCents - memberships.collectedCents,
      activeStudents: active.length,
      studentsChange: active.length - activeBefore.length,
      studentsInClasses: inClasses.length,
      inClassesChange: inClasses.length - inClassesBefore.length,
      cashChart,
      monthChart,
      occupancy: {
        percent: capacity > 0 ? Math.round((occupied * 100) / capacity) : 0,
        fullGroups: groups.filter((g) => g.occupied >= g.capacity).length,
        emptiest: emptiest.slice(0, 4).map((g) => ({
          id: g.id,
          name: g.name,
          teacherName: g.teacherName,
          occupied: g.occupied,
          capacity: g.capacity,
        })),
      },
      overdue: (await this.billing.overdue(today)).slice(0, ClubSummary.LIST_SIZE),
      latest: [
        ...(current?.lines ?? []),
        ...[...previousLines].sort((a, b) => b.date.localeCompare(a.date)),
      ].slice(0, ClubSummary.LIST_SIZE),
    };
  }
  /**
   * Las categorías «del mes», cada movimiento en los meses a los que corresponde. De las cuotas mensuales de cada mes, lo
   * que tienen cubierto (cobrado, sea cual sea el recibo que lo pagó) y lo que les falta: las emitidas y pendientes (lo
   * cancelado no se debe) y, en los meses que vienen, las previstas de los alumnos matriculados hoy. Del mes en curso
   * en adelante, lo que costará el profesorado según el horario menos lo suyo que ya está en el libro ese mes; en los
   * meses ya pasados, lo que aún se le debe (sus liquidaciones sin pagar), que no se va al cambiar de mes; y, en
   * cualquier mes, lo esperado de los gastos esperados de esas categorías que aún no se han pagado ni saltado.
   */
  private async monthChart(
    months: string[],
    lines: LedgerLine[],
    first: YearMonth,
    last: YearMonth,
    current: YearMonth,
  ): Promise<MonthFeeBars[]> {
    const categories = await this.settings.monthlyCategories();
    const withFees = categories.includes('fees');
    const payroll = categories.includes('teachers') && !last.isBefore(current)
      ? await this.expectedPayroll.between(current.isBefore(first) ? first : current, last)
      : new Map<string, number>();
    const lastPast = current.previous();
    const owed = categories.includes('teachers') && !lastPast.isBefore(first)
      ? await this.pendingPayroll.between(first, last.isBefore(lastPast) ? last : lastPast)
      : new Map<string, number>();
    const pendingExpected = new Map<string, number>();
    for (const view of await expectedMonths(this.expected, first, last)) {
      if (view.status !== 'pending' || !categories.includes(view.category)) continue;
      pendingExpected.set(
        view.period,
        (pendingExpected.get(view.period) ?? 0) + view.expectedCents,
      );
    }
    const bars = new Map(
      months.map((m) => [m, {
        income: 0,
        expected: 0,
        expense: 0,
        teachers: 0,
        expectedExpense: payroll.get(m) ?? 0,
        expectedOther: pendingExpected.get(m) ?? 0,
        owed: owed.get(m) ?? 0,
      }]),
    );
    if (withFees) {
      // Las cuotas de cada mes: lo que tienen cubierto (cobrado) y lo que les falta, sea cual sea el recibo que lo pagó.
      for (const [month, bar] of bars) {
        const fees = (await this.charges.execute(month, 'monthly')).items
          .filter((charge) => charge.kind === 'monthly');
        bar.income = fees.reduce((total, c) => total + Math.min(c.coveredCents, c.amountCents), 0);
        bar.expected = fees.reduce(
          (total, c) => total + Math.max(0, c.amountCents - c.coveredCents),
          0,
        );
      }
    }
    for (const line of lines) {
      if (line.category === 'fees' || !categories.includes(line.category)) continue;
      for (const share of line.shares) {
        const bar = bars.get(share.period);
        if (!bar) continue;
        if (line.kind === 'income') bar.income += share.amountCents;
        else {
          bar.expense += share.amountCents;
          if (line.category === 'teachers') bar.teachers += share.amountCents;
        }
      }
    }
    return months.map((m) => {
      const bar = bars.get(m);
      return {
        month: m,
        incomeCents: bar?.income ?? 0,
        expenseCents: bar?.expense ?? 0,
        expectedCents: bar?.expected ?? 0,
        expectedExpenseCents: Math.max(0, (bar?.expectedExpense ?? 0) - (bar?.teachers ?? 0)) +
          (bar?.owed ?? 0) + (bar?.expectedOther ?? 0),
      };
    });
  }
}
