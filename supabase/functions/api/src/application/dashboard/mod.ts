import { type Clock, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import type { AccountingSettingsRepository, LedgerLine, MonthLedger } from '../accounting/mod.ts';
import type { BillingQuery, ChargeView, ListMonthlyCharges } from '../billing/mod.ts';
import type { ClassQuery, GroupSummary } from '../classes/mod.ts';
import type { StudentQuery } from '../students/mod.ts';

export interface MonthBars {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

export interface ClubSummaryView {
  month: string;
  today: string;
  collectedCents: number;
  expectedCents: number;
  pendingCents: number;
  /** Cuotas de socio de la temporada sin cobrar: aparte de las cifras del mes. */
  membershipPendingCents: number;
  expensesCents: number;
  activeStudents: number;
  registeredStudents: number;
  /** Lo que entra y sale cada mes, por fecha (cuadra con Contabilidad). */
  cashChart: MonthBars[];
  /** Lo que corresponde a cada mes, solo con las categorías «del mes» de Contabilidad. */
  monthChart: MonthBars[];
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

/**
 * Cuotas mensuales para el gráfico de la temporada: no por cuándo se cobran, sino por el mes al que corresponden.
 */
export interface FeeIncome {
  /** Cada cobro de cuotas mensuales repartido a partes iguales entre los meses que paga. */
  earnedByMonth(first: YearMonth, last: YearMonth): Promise<Map<string, number>>;
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
    private readonly fees: FeeIncome,
    private readonly settings: AccountingSettingsRepository,
  ) {}

  /** Meses de margen alrededor de la temporada: un gasto puede pagarse antes o después del mes al que corresponde. */
  private static readonly MARGIN_MONTHS = 3;

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
    );
    let current: { expenseCents: number; lines: LedgerLine[] } | null = null;
    let previousLines: LedgerLine[] = [];
    for (const view of seasonViews) {
      const m = YearMonth.fromString(view.month);
      if (m.equals(month)) current = view;
      else if (m.next().equals(month)) previousLines = view.lines;
    }
    const groups = await this.classes.groups(today);
    const capacity = groups.reduce((sum, g) => sum + g.capacity, 0);
    const occupied = groups.reduce((sum, g) => sum + Math.min(g.occupied, g.capacity), 0);
    const emptiest = [...groups].sort((a: GroupSummary, b: GroupSummary) =>
      (b.capacity - b.occupied) - (a.capacity - a.occupied)
    );
    return {
      month: month.toString(),
      today: today.toString(),
      collectedCents: charges.collectedCents,
      expectedCents: charges.expectedCents,
      pendingCents: charges.expectedCents - charges.collectedCents,
      membershipPendingCents: memberships.expectedCents - memberships.collectedCents,
      expensesCents: current?.expenseCents ?? 0,
      activeStudents: (await this.students.list('active', null, today)).length,
      registeredStudents: await this.students.total(),
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
   * Las categorías «del mes», cada movimiento en el mes al que corresponde. Las cuotas mensuales, repartidas entre los
   * meses que paga cada cobro.
   */
  private async monthChart(
    months: string[],
    lines: LedgerLine[],
    first: YearMonth,
    last: YearMonth,
  ): Promise<MonthBars[]> {
    const categories = await this.settings.monthlyCategories();
    const earned = categories.includes('fees')
      ? await this.fees.earnedByMonth(first, last)
      : new Map<string, number>();
    const bars = new Map(months.map((m) => [m, { income: earned.get(m) ?? 0, expense: 0 }]));
    for (const line of lines) {
      if (line.category === 'fees' || !categories.includes(line.category)) continue;
      const bar = bars.get(line.period);
      if (!bar) continue;
      if (line.kind === 'income') bar.income += line.amountCents;
      else bar.expense += line.amountCents;
    }
    return months.map((m) => ({
      month: m,
      incomeCents: bars.get(m)?.income ?? 0,
      expenseCents: bars.get(m)?.expense ?? 0,
    }));
  }
}
