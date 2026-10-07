import type { ReactNode } from 'react';

import { ToggleButton } from '@/shared/ui/ToggleButton';

import { currentMonth, monthLabel, monthName, seasonMonths } from './money';

/**
 * Un botón por mes de la temporada, todos a la vista; el mes en curso va subrayado. `selected` null: ninguno marcado
 * (p. ej. cuando se ve otra cosa, como las cuotas de socio). `before`: botones extra al principio.
 */
export function SeasonMonths({
  month,
  selected,
  label,
  onChange,
  before,
}: {
  month: string;
  selected: string | null;
  label: string;
  onChange: (month: string) => void;
  before?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {before}
      {seasonMonths(month).map((m) => (
        <ToggleButton
          key={m}
          tone="ink"
          pressed={m === selected}
          onClick={() => onChange(m)}
          aria-label={monthLabel(m)}
          title={m === currentMonth() ? `${monthLabel(m)} (en curso)` : monthLabel(m)}
          className={`h-9 min-w-0 rounded-full px-3 font-medium capitalize ${m === currentMonth() ? 'underline decoration-2 underline-offset-4' : ''}`}
        >
          {monthName(m).slice(0, 3)}
        </ToggleButton>
      ))}
    </div>
  );
}
