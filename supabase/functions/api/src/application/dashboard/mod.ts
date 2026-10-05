import { type Clock, LocalDate, YearMonth } from '../../domain/common/mod.ts';
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
 * Resumen del club con cifras reales: lo compone a partir de Cobros, Contabilidad, Alumnado y Clases.
 */
export class ClubSummary {
  private static readonly CHART_MONTHS = 12;
  private static readonly LIST_SIZE = 6;

  constructor(
    private readonly charges: ListMonthlyCharges,
    private readonly billing: BillingQuery,
    private readonly ledger: MonthLedger,
    private readonly students: StudentQuery,
    private readonly classes: ClassQuery,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ClubSummaryView> {
    const today = LocalDate.fromInstant(this.clock.now());
    const month = YearMonth.of(today);
    const charges = await this.charges.execute(month.toString());
    let first = month;
    for (let i = 1; i < ClubSummary.CHART_MONTHS; i++) first = first.previous();
    const chart: ClubSummaryView['chart'] = [];
    let current: { expenseCents: number; lines: LedgerLine[] } | null = null;
    let previousLines: LedgerLine[] = [];
    for (let m = first, i = 0; i < ClubSummary.CHART_MONTHS; m = m.next(), i++) {
      const view = await this.ledger.execute(m.toString());
      chart.push({
        month: m.toString(),
        incomeCents: view.incomeCents,
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
