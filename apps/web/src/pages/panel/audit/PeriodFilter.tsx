import type { AuditPeriod } from '@/features/audit/api';
import { PERIODS } from '@/features/audit/sections';
import { ToggleButton } from '@/shared/ui/ToggleButton';

/** Hoy · Esta semana · Este mes · Todo, como los filtros de los movimientos de contabilidad. */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: AuditPeriod;
  onChange: (period: AuditPeriod) => void;
}) {
  return (
    <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1.5">
      {PERIODS.map((p) => (
        <ToggleButton
          key={p.value}
          tone="ink"
          pressed={value === p.value}
          onClick={() => onChange(p.value)}
          className="h-9 rounded-full font-medium"
        >
          {p.label}
        </ToggleButton>
      ))}
    </div>
  );
}
