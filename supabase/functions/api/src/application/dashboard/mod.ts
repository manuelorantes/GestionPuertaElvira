import { type Clock, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import type { LedgerLine, MonthLedger } from '../accounting/mod.ts';
import type { BillingQuery, ChargeView, ListMonthlyCharges } from '../billing/mod.ts';
import type { ClassQuery, GroupSummary } from '../classes/mod.ts';
import type { StudentQuery } from '../students/mod.ts';

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
  chart: { month: string; incomeCents: number; expenseCents: number }[];
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
  /** Lo cobrado en cuotas mensuales, por mes de cobro (céntimos por «AAAA-MM»). */
  collectedByMonth(first: YearMonth, last: YearMonth): Promise<Map<string, number>>;
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
  ) {}

  async execute(): Promise<ClubSummaryView> {
    const today = LocalDate.fromInstant(this.clock.now());
    const month = YearMonth.of(today);
    // Las cifras del mes, solo con sus cuotas (y el material); las de socio pendientes, aparte.
    const charges = await this.charges.execute(month.toString(), 'monthly');
    const memberships = await this.charges.execute(month.toString(), 'membership');
    const first = Season.containing(month).firstMonth();
    let last = first;
    for (let i = 1; i < ClubSummary.CHART_MONTHS; i++) last = last.next();
    // Las cuotas mensuales cuentan en el mes al que corresponden; lo demás (socio, subvenciones, promociones…),
    // en el mes en que se cobra.
    const collected = await this.fees.collectedByMonth(first, last);
    const earned = await this.fees.earnedByMonth(first, last);
    const chart: ClubSummaryView['chart'] = [];
    let current: { expenseCents: number; lines: LedgerLine[] } | null = null;
    let previousLines: LedgerLine[] = [];
    for (const view of await this.ledger.between(first, last)) {
      const m = YearMonth.fromString(view.month);
      chart.push({
        month: m.toString(),
        incomeCents: view.incomeCents - (collected.get(m.toString()) ?? 0) +
          (earned.get(m.toString()) ?? 0),
        expenseCents: view.expenseCents,
      });
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
      chart,
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
}
