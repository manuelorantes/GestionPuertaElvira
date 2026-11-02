import { type Clock, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import { type FiscalYearSummary, type LedgerLine, type MonthLedger } from '../accounting/mod.ts';
import type { BillingQuery, ChargeView, ListMonthlyCharges } from '../billing/mod.ts';
import type { ClassQuery, GroupSummary } from '../classes/mod.ts';
import type { StudentQuery } from '../students/mod.ts';
import { type FeesVsFixed, seasonLedger } from './feesVsFixed.ts';

export * from './feesVsFixed.ts';

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

/**
 * Resumen del club con cifras reales: lo compone a partir de Cobros, Contabilidad, Alumnado y Clases.
 */
export class ClubSummary {
  private static readonly LIST_SIZE = 6;

  constructor(
    private readonly charges: ListMonthlyCharges,
    private readonly billing: BillingQuery,
    private readonly ledger: MonthLedger,
    private readonly students: StudentQuery,
    private readonly classes: ClassQuery,
    private readonly clock: Clock,
    private readonly fiscalYear: FiscalYearSummary,
    private readonly feesVsFixed: FeesVsFixed,
  ) {}

  async execute(): Promise<ClubSummaryView> {
    const today = LocalDate.fromInstant(this.clock.now());
    const month = YearMonth.of(today);
    // Las cifras del mes, solo con sus cuotas (y el material); las de socio pendientes, aparte.
    const charges = await this.charges.execute(month.toString(), 'monthly');
    const memberships = await this.charges.execute(month.toString(), 'membership');
    const { first, last, views, lines } = await seasonLedger(this.ledger, month);
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
    const monthChart: MonthFeeBars[] = (await this.feesVsFixed.months(
      seasonViews.map((v) => v.month),
      lines,
      first,
      last,
      month,
    )).map(({ parts: _, ...bars }) => bars);
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
}
