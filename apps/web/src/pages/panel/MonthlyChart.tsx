import { useState } from 'react';

import { formatCents, monthLabel, monthName } from '@/features/billing/money';

import { BAR_STYLE, type BarKind, type ChartMonth } from './chartBars';

interface MonthlyChartProps {
  months: ChartMonth[];
  current: string;
  /** Qué muestra, al principio de la descripción accesible. */
  label: string;
  /** Prefijo de las barras (para distinguir dos gráficas en la misma página). */
  id: string;
  /** Con él, cada parte de barra es un botón que la elige. */
  onSelect?: ((month: string, kind: BarKind) => void) | undefined;
  /** La parte elegida, resaltada. */
  selected?: { month: string; kind: BarKind } | null;
  /** Al pinchar en el hueco de la gráfica (fuera de las barras), se deja de elegir. */
  onClear?: (() => void) | undefined;
  /** Alto de la gráfica (por defecto, `h-60`). */
  className?: string;
}

/** Escala redonda para el eje: 1, 2 o 5 × 10ⁿ euros por división, en 4 divisiones. */
function axisMax(cents: number): number {
  const euros = Math.max(1, cents / 100) / 4;
  const power = 10 ** Math.floor(Math.log10(euros));
  const step = [1, 2, 5, 10].find((m) => m * power >= euros) ?? 10;
  return step * power * 4 * 100;
}

/** En los extremos, el aviso se abre hacia dentro para no salirse de la tarjeta. */
function tooltipSide(index: number, count: number): string {
  if (index < 2) return 'left-0';
  if (index >= count - 2) return 'right-0';
  return 'left-1/2 -translate-x-1/2';
}

function describe(m: ChartMonth): string {
  const extras = [
    (m.expectedCents ?? 0) > 0 ? `cuotas previstas ${formatCents(m.expectedCents ?? 0)}` : null,
    (m.expectedExpenseCents ?? 0) > 0
      ? `gastos previstos ${formatCents(m.expectedExpenseCents ?? 0)}`
      : null,
  ].filter((part) => part !== null);
  return [
    `${monthLabel(m.month).toLowerCase()}: ingresos ${formatCents(m.incomeCents)}`,
    `gastos ${formatCents(m.expenseCents)}`,
    ...extras,
  ].join(', ');
}

/**
 * Barras de ingresos y gastos por mes (sin dependencias de gráficos); lo previsto, apilado sobre lo real: las cuotas
 * sobre los ingresos y los gastos previstos (profesorado y gastos esperados sin pagar) sobre los gastos.
 */
export function MonthlyChart({
  months,
  current,
  label,
  id: chartId,
  onSelect,
  selected = null,
  onClear,
  className = 'h-60',
}: MonthlyChartProps) {
  // La barra señalada (al pasar el ratón o al tocarla) muestra su importe.
  const [pointed, setPointed] = useState<string | null>(null);
  const max = axisMax(
    Math.max(
      ...months.flatMap((m) => [
        m.incomeCents + (m.expectedCents ?? 0),
        m.expenseCents + (m.expectedExpenseCents ?? 0),
      ]),
    ),
  );
  const ticks = [4, 3, 2, 1, 0].map((i) => (max * i) / 4);
  const description = months.map(describe).join('; ');

  /**
   * Un tramo de barra: su alto lo reparte la columna (`grow`) y al señalarlo muestra su importe. Con `onSelect`, es un
   * botón que lo elige.
   */
  function segment(m: ChartMonth, index: number, kind: BarKind, cents: number, rounded: boolean) {
    const id = `${m.month}-${kind}`;
    const text = `${BAR_STYLE[kind].label} de ${monthLabel(m.month).toLowerCase()}: ${formatCents(cents)}`;
    const chosen = selected?.month === m.month && selected.kind === kind;
    const props = {
      'data-testid': `${chartId}-${id}`,
      className: `relative block w-full ${rounded ? 'rounded-t-[3px]' : ''} ${BAR_STYLE[kind].color} ${chosen ? 'ring-2 ring-brand-strong ring-offset-1 ring-offset-paper' : ''} ${onSelect ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:outline-none' : ''}`,
      style: { flexGrow: cents, flexBasis: 0 },
      onPointerEnter: () => setPointed(id),
      onPointerLeave: () => setPointed((p) => (p === id ? null : p)),
    };
    const tooltip = pointed === id && (
      <span
        className={`pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap ${tooltipSide(index, months.length)} rounded-sm bg-ink-strong px-2 py-1 text-xs font-medium text-paper shadow-overlay`}
      >
        {text}
      </span>
    );
    if (onSelect && cents !== 0)
      return (
        <button
          key={kind}
          type="button"
          aria-label={text}
          aria-pressed={chosen}
          {...props}
          onClick={() => onSelect(m.month, kind)}
        >
          {tooltip}
        </button>
      );
    return (
      <div key={kind} {...props} onClick={() => setPointed((p) => (p === id ? null : id))}>
        {tooltip}
      </div>
    );
  }

  return (
    <div
      role={onSelect ? 'group' : 'img'}
      aria-label={`${label}. ${description}`}
      className={`flex gap-3 ${className}`}
      onClick={(event) => {
        if (onClear && !(event.target as Element).closest('button')) onClear();
      }}
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
      <div
        aria-hidden={!onSelect}
        className="flex flex-1 items-stretch gap-1 border-l border-line sm:gap-2"
      >
        {months.map((m, index) => {
          const expected = m.expectedCents ?? 0;
          const expectedExpense = m.expectedExpenseCents ?? 0;
          return (
            <div
              key={m.month}
              // La columna señalada, por encima de las demás: su aviso no queda tapado por las barras de al lado.
              className={`relative flex min-w-0 flex-1 flex-col ${pointed?.startsWith(`${m.month}-`) ? 'z-20' : ''}`}
            >
              <div
                className={`flex flex-1 items-end justify-center gap-[3px] border-b border-line-strong ${m.month === current ? '' : 'opacity-90'}`}
              >
                <div
                  className="flex w-[42%] max-w-4 flex-col"
                  style={{ height: `${((m.incomeCents + expected) / max) * 100}%` }}
                >
                  {expected > 0 && segment(m, index, 'expected', expected, true)}
                  {segment(m, index, 'income', m.incomeCents, expected === 0)}
                </div>
                <div
                  className="flex w-[42%] max-w-4 flex-col"
                  style={{ height: `${((m.expenseCents + expectedExpense) / max) * 100}%` }}
                >
                  {expectedExpense > 0 &&
                    segment(m, index, 'expectedExpense', expectedExpense, true)}
                  {segment(m, index, 'expense', m.expenseCents, expectedExpense === 0)}
                </div>
              </div>
              <span
                aria-hidden
                className={`h-7 truncate pt-1.5 text-center text-xs ${m.month === current ? 'font-semibold text-brand-strong' : 'text-ink-muted'}`}
              >
                {monthName(m.month).slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
