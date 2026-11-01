import { centsFromText, monthName, shiftMonth } from '@/features/billing/money';
import type { FirstMonthMode, FirstMonthValue } from '@/features/students/firstMonth';
import { lateJoinMonth } from '@/features/students/firstMonth';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const MODES: { id: FirstMonthMode; label: string }[] = [
  { id: 'full', label: 'El mes completo' },
  { id: 'part', label: 'Una parte' },
  { id: 'none', label: 'Nada este mes' },
];

/**
 * En un alta (o un alta de nuevo) del día 16 en adelante, qué se cobra de ese mes: entero, una parte (con su importe)
 * o nada (su primera cuota será la del mes siguiente). No se muestra si no hay nada que decidir.
 */
export function FirstMonthFeeField({
  joinedOn,
  hasClasses,
  value,
  onChange,
}: {
  joinedOn: string;
  hasClasses: boolean;
  value: FirstMonthValue;
  onChange: (value: FirstMonthValue) => void;
}) {
  const month = lateJoinMonth(joinedOn);
  if (!hasClasses || month === null) return null;
  const name = monthName(month);
  const day = Number(joinedOn.slice(8, 10));
  const cents = centsFromText(value.amount);
  const invalid = value.amount.trim() !== '' && (cents === null || cents <= 0);

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-line bg-surface-muted p-4">
      <div>
        <p className="text-sm font-semibold text-ink">¿Qué paga de {name}?</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Se da de alta el día {day}, con el mes ya avanzado.
        </p>
      </div>
      <div role="group" aria-label={`Cuota de ${name}`} className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <ToggleButton
            key={m.id}
            tone="ink"
            pressed={value.mode === m.id}
            onClick={() => onChange({ ...value, mode: m.id })}
            className="h-9 rounded-full font-medium"
          >
            {m.label}
          </ToggleButton>
        ))}
      </div>
      {value.mode === 'full' && (
        <p className="text-[13px] text-ink-muted">Paga la cuota de {name} entera.</p>
      )}
      {value.mode === 'part' && (
        <TextField
          label={`Lo que paga de ${name} (€)`}
          inputMode="decimal"
          placeholder="Por ejemplo: 20"
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          error={invalid ? 'Importe no válido.' : undefined}
        />
      )}
      {value.mode === 'none' && (
        <p className="text-[13px] text-ink-muted">
          No tendrá cuota de {name}: su primera cuota será la de {monthName(shiftMonth(month, 1))}.
        </p>
      )}
    </div>
  );
}
