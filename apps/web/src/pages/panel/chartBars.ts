/** Un mes de la gráfica; lo previsto solo en «Cuotas vs gastos fijos». */
export interface ChartMonth {
  month: string;
  incomeCents: number;
  expenseCents: number;
  expectedCents?: number;
  expectedExpenseCents?: number;
}

export type BarKind = 'income' | 'expected' | 'expense' | 'expectedExpense';

/** Las cuotas previstas, en el verde claro de los grupos de iniciación; los gastos previstos, en gris. */
export const BAR_STYLE: Record<BarKind, { label: string; color: string }> = {
  income: { label: 'Ingresos', color: 'bg-brand' },
  expected: { label: 'Cuotas previstas', color: 'border border-brand-tint bg-brand-soft' },
  expense: { label: 'Gastos', color: 'bg-ink-strong' },
  expectedExpense: { label: 'Gastos previstos', color: 'bg-ink-muted' },
};

/** Cada parte en la dirección del detalle (`?parte=`). */
export const BAR_SLUG: Record<BarKind, string> = {
  income: 'ingresos',
  expected: 'cuotas-previstas',
  expense: 'gastos',
  expectedExpense: 'gastos-previstos',
};

export function barKindFromSlug(slug: string | null): BarKind | null {
  const found = Object.entries(BAR_SLUG).find(([, s]) => s === slug);
  return found ? (found[0] as BarKind) : null;
}

/** Dónde se ve de qué sale una parte de «Cuotas vs gastos fijos»: Contabilidad, en «Mes a mes y cierre». */
export function feesVsFixedHref(month: string, kind: BarKind): string {
  return `/panel/contabilidad?pestana=cierre&mes=${month}&parte=${BAR_SLUG[kind]}`;
}
