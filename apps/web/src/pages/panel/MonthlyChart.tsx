import { formatCents, monthLabel, monthName } from '@/features/billing/money';

interface MonthlyChartProps {
  months: { month: string; incomeCents: number; expenseCents: number }[];
  current: string;
}

/** Escala redonda para el eje: 1, 2 o 5 × 10ⁿ euros por división, en 4 divisiones. */
function axisMax(cents: number): number {
  const euros = Math.max(1, cents / 100) / 4;
  const power = 10 ** Math.floor(Math.log10(euros));
  const step = [1, 2, 5, 10].find((m) => m * power >= euros) ?? 10;
  return step * power * 4 * 100;
}

/** Barras de ingresos y gastos por mes (sin dependencias de gráficos). */
export function MonthlyChart({ months, current }: MonthlyChartProps) {
  const max = axisMax(Math.max(...months.flatMap((m) => [m.incomeCents, m.expenseCents])));
  const ticks = [4, 3, 2, 1, 0].map((i) => (max * i) / 4);
  const description = months
    .map(
      (m) =>
        `${monthLabel(m.month).toLowerCase()}: ingresos ${formatCents(m.incomeCents)}, gastos ${formatCents(m.expenseCents)}`,
    )
    .join('; ');

  return (
    <div
      role="img"
      aria-label={`Ingresos y gastos de la temporada, de septiembre a agosto (las cuotas, en el mes al que corresponden). ${description}`}
      className="flex h-60 gap-3"
    >
      <div
        aria-hidden
        className="flex min-w-11 flex-col justify-between pb-7 text-right text-xs text-ink-muted"
      >
        {ticks.map((t) => (
          <span key={t} className="leading-none">
            {formatCents(t)}
          </span>
        ))}
      </div>
      <div aria-hidden className="flex flex-1 items-stretch gap-1 border-l border-line sm:gap-2">
        {months.map((m) => (
          <div
            key={m.month}
            className="flex min-w-0 flex-1 flex-col"
            title={`${monthLabel(m.month)}: ${formatCents(m.incomeCents)} / ${formatCents(m.expenseCents)}`}
          >
            <div
              className={`flex flex-1 items-end justify-center gap-[3px] border-b border-line-strong ${m.month === current ? '' : 'opacity-90'}`}
            >
              <div
                className="w-[42%] max-w-4 rounded-t-[3px] bg-brand"
                style={{ height: `${(m.incomeCents / max) * 100}%` }}
              />
              <div
                className="w-[42%] max-w-4 rounded-t-[3px] bg-ink-strong"
                style={{ height: `${(m.expenseCents / max) * 100}%` }}
              />
            </div>
            <span
              className={`h-7 truncate pt-1.5 text-center text-xs ${m.month === current ? 'font-semibold text-brand-strong' : 'text-ink-muted'}`}
            >
              {monthName(m.month).slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
