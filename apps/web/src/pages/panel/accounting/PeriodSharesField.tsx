import { equalShares, resolveChoice, type PeriodChoice } from '@/features/accounting/periodShares';
import { centsToText, monthLabel, monthName, shiftMonth } from '@/features/billing/money';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';

/** Meses que se ofrecen alrededor del de la fecha: un gasto se suele pagar poco antes o poco después. */
const MONTHS_BEFORE = 6;
const MONTHS_AFTER = 3;
const MANY = 'many';

/**
 * «Mes al que corresponde» de un movimiento: el de su fecha (por defecto, y sigue a la fecha si cambia), otro mes o
 * varios («Varios meses…»), repartido a partes iguales o con lo que va a cada mes escrito a mano.
 */
export function PeriodSharesField({
  date,
  totalCents,
  value,
  onChange,
  defaultLabel,
}: {
  date: string;
  /** El importe del movimiento (0 mientras no es válido). */
  totalCents: number;
  value: PeriodChoice;
  onChange: (value: PeriodChoice) => void;
  /** «El de la fecha», «El de la factura»… */
  defaultLabel: string;
}) {
  const month = date.slice(0, 7);
  // Los de alrededor de la fecha y, al editar, los que ya tenía aunque queden fuera.
  const chosen = value.kind === 'one' ? [value.period].filter(Boolean) : value.months;
  const months = [
    ...new Set([
      ...Array.from({ length: MONTHS_BEFORE + MONTHS_AFTER + 1 }, (_, i) =>
        shiftMonth(month, i - MONTHS_BEFORE),
      ),
      ...chosen,
    ]),
  ].sort();
  const resolved = resolveChoice(value, month, totalCents);

  function pick(selected: string) {
    if (selected !== MANY) return onChange({ kind: 'one', period: selected });
    const current = value.kind === 'one' ? value.period || month : month;
    onChange({ kind: 'many', months: [current], amounts: null });
  }

  function toggle(m: string) {
    if (value.kind !== 'many') return;
    const chosen = value.months.includes(m)
      ? value.months.filter((x) => x !== m)
      : [...value.months, m];
    // Al cambiar los meses, vuelve a repartirse a partes iguales.
    onChange({ kind: 'many', months: chosen, amounts: null });
  }

  function type(m: string, text: string) {
    if (value.kind !== 'many') return;
    const current =
      value.amounts ??
      Object.fromEntries(
        equalShares(totalCents, value.months).map((s) => [s.period, centsToText(s.amountCents)]),
      );
    onChange({ ...value, amounts: { ...current, [m]: text } });
  }

  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Mes al que corresponde"
        value={value.kind === 'one' ? value.period : MANY}
        onChange={pick}
        options={[
          { value: '', label: `${defaultLabel} (${monthLabel(month).toLowerCase()})` },
          ...months.filter((m) => m !== month).map((m) => ({ value: m, label: monthLabel(m) })),
          { value: MANY, label: 'Varios meses…' },
        ]}
      />
      {value.kind === 'many' && (
        <div className="flex flex-col gap-3 rounded-sm bg-surface-muted p-3">
          <div
            role="group"
            aria-label="Meses a los que corresponde"
            className="flex flex-wrap gap-1.5"
          >
            {months.map((m) => (
              <ToggleButton
                key={m}
                tone="ink"
                pressed={value.months.includes(m)}
                onClick={() => toggle(m)}
                aria-label={monthLabel(m)}
                className="h-8 min-w-0 px-2 text-[13px] font-medium capitalize"
              >
                {monthName(m).slice(0, 3)} {m.slice(2, 4)}
              </ToggleButton>
            ))}
          </div>
          {resolved.effective.length > 1 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {resolved.effective.map((s) => (
                <TextField
                  key={s.period}
                  label={`${monthLabel(s.period)} (€)`}
                  inputMode="decimal"
                  value={value.amounts?.[s.period] ?? centsToText(s.amountCents)}
                  onChange={(e) => type(s.period, e.target.value)}
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className={resolved.problem ? 'text-danger-fg' : 'text-ink-muted'} role="status">
              {resolved.problem ??
                (value.amounts ? 'Repartido a mano.' : 'Repartido a partes iguales.')}
            </span>
            {value.amounts && (
              <Button
                variant="ghost"
                onClick={() => onChange({ ...value, amounts: null })}
                className="h-8"
              >
                Repartir a partes iguales
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
