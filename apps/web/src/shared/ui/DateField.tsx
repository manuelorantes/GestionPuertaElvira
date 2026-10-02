import { useId, useState } from 'react';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  fromYear: number;
  toYear: number;
  error?: string | undefined;
}

function split(iso: string) {
  const [year = '', month = '', day = ''] = iso ? iso.split('-') : [];
  return { day: day ? String(Number(day)) : '', month: month ? String(Number(month)) : '', year };
}

function daysIn(month: string, year: string): number {
  return new Date(Number(year) || 2000, Number(month) || 1, 0).getDate();
}

const selectClass =
  'h-11 rounded-sm border border-line-strong bg-surface px-2 text-[15px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30';

/**
 * Fecha en orden día / mes / año (regla del framework) con valor ISO (AAAA-MM-DD).
 * Solo emite el valor cuando la fecha está completa.
 */
export function DateField({ label, value, onChange, fromYear, toYear, error }: DateFieldProps) {
  const errorId = useId();
  const [parts, setParts] = useState(() => split(value));

  function update(change: Partial<typeof parts>) {
    const next = { ...parts, ...change };
    setParts(next);
    if (next.day && next.month && next.year && Number(next.day) <= daysIn(next.month, next.year)) {
      onChange(`${next.year}-${next.month.padStart(2, '0')}-${next.day.padStart(2, '0')}`);
    } else {
      onChange('');
    }
  }

  const years = Array.from({ length: toYear - fromYear + 1 }, (_, index) => String(toYear - index));

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-1.5"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
      <div className="grid grid-cols-[4.5rem_1fr_6rem] gap-2">
        <select
          aria-label="Día"
          className={selectClass}
          value={parts.day}
          onChange={(e) => update({ day: e.target.value })}
        >
          <option value="">Día</option>
          {Array.from({ length: daysIn(parts.month, parts.year) }, (_, i) => String(i + 1)).map(
            (day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Mes"
          className={selectClass}
          value={parts.month}
          onChange={(e) => update({ month: e.target.value })}
        >
          <option value="">Mes</option>
          {MONTHS.map((month, index) => (
            <option key={month} value={String(index + 1)}>
              {month}
            </option>
          ))}
        </select>
        <select
          aria-label="Año"
          className={selectClass}
          value={parts.year}
          onChange={(e) => update({ year: e.target.value })}
        >
          <option value="">Año</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}
    </fieldset>
  );
}
