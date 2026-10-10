import { monthLabel, shiftMonth } from '@/features/billing/money';
import { Select } from '@/shared/ui/Select';

/** Meses que se ofrecen alrededor del de la fecha: un gasto se suele pagar poco antes o poco después. */
const MONTHS_BEFORE = 6;
const MONTHS_AFTER = 3;

/**
 * «Mes al que corresponde» de un apunte o una factura. Vacío: el de su fecha (y sigue a la fecha si cambia).
 */
export function PeriodSelect({
  date,
  value,
  onChange,
  defaultLabel,
}: {
  date: string;
  value: string;
  onChange: (value: string) => void;
  /** «El de la fecha», «El de la factura»… */
  defaultLabel: string;
}) {
  const month = date.slice(0, 7);
  const months = Array.from({ length: MONTHS_BEFORE + MONTHS_AFTER + 1 }, (_, i) =>
    shiftMonth(month, i - MONTHS_BEFORE),
  );
  return (
    <Select
      label="Mes al que corresponde"
      value={value}
      onChange={onChange}
      options={[
        { value: '', label: `${defaultLabel} (${monthLabel(month).toLowerCase()})` },
        ...months.filter((m) => m !== month).map((m) => ({ value: m, label: monthLabel(m) })),
      ]}
    />
  );
}
