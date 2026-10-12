/** Un mes de la gráfica; `expectedCents` solo en «Cuotas vs gastos fijos». */
export interface ChartMonth {
  month: string;
  incomeCents: number;
  expenseCents: number;
  expectedCents?: number;
}

export type BarKind = 'income' | 'expected' | 'expense';

/** Las cuotas previstas, en el verde claro de los grupos de iniciación. */
export const BAR_STYLE: Record<BarKind, { label: string; color: string }> = {
  income: { label: 'Ingresos', color: 'bg-brand' },
  expected: { label: 'Cuotas previstas', color: 'border border-brand-tint bg-brand-soft' },
  expense: { label: 'Gastos', color: 'bg-ink-strong' },
};
