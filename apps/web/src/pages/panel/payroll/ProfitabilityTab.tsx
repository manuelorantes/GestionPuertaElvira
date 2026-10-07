import { useState } from 'react';

import { formatCents, monthLabel } from '@/features/billing/money';
import type { ProfitabilityRow } from '@/features/payroll/api';
import { useProfitability } from '@/features/payroll/hooks';
import { hoursLabel } from '@/features/payroll/hours';
import { Card } from '@/shared/ui/Card';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const ORDERS: { id: string; label: string; value: (r: ProfitabilityRow) => number }[] = [
  { id: 'margin', label: 'Margen', value: (r) => r.marginCents },
  { id: 'perHour', label: '€ por hora', value: (r) => r.incomePerHourCents ?? -Infinity },
  { id: 'occupancy', label: 'Ocupación', value: (r) => occupancy(r) },
];

function occupancy(row: ProfitabilityRow): number {
  return row.capacity > 0 ? Math.round((row.occupied / row.capacity) * 100) : 0;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export function ProfitabilityTab({ month }: { month: string }) {
  const profitability = useProfitability(month);
  const [order, setOrder] = useState('margin');
  const rows = profitability.data ?? [];

  if (profitability.isPending) return <p className="text-ink-muted">Cargando rentabilidad…</p>;
  if (rows.length === 0)
    return <p className="text-ink-muted">No hay datos de rentabilidad este mes.</p>;

  const sort = ORDERS.find((o) => o.id === order) ?? ORDERS[0];
  const sorted = [...rows].sort((a, b) => (sort ? sort.value(b) - sort.value(a) : 0));
  const top = [...rows]
    .filter((r) => r.minutes > 0 && r.marginCents > 0)
    .sort((a, b) => b.marginCents - a.marginCents)[0];
  const maxMargin = Math.max(1, ...rows.map((r) => r.marginCents));
  const totals = [
    { label: 'Horas esperadas', value: hoursLabel(rows.reduce((sum, r) => sum + r.minutes, 0)) },
    {
      label: 'Coste de profesores',
      value: formatCents(rows.reduce((sum, r) => sum + r.costCents, 0)),
    },
    {
      label: 'Margen de las clases',
      value: formatCents(rows.reduce((sum, r) => sum + r.marginCents, 0)),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {totals.map((t) => (
          <Card key={t.label} className="px-6 py-5">
            <p className="text-[13px] text-ink-muted">{t.label}</p>
            <p className="font-display text-4xl leading-tight font-bold">{t.value}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
            Rentabilidad · {monthLabel(month).toLowerCase()}
          </h2>
          <div
            role="group"
            aria-label="Ordenar por"
            className="flex items-center gap-2 text-[13px] text-ink-muted"
          >
            Ordenar por
            {ORDERS.map((o) => (
              <ToggleButton
                key={o.id}
                pressed={order === o.id}
                onClick={() => setOrder(o.id)}
                className="h-9 font-medium"
              >
                {o.label}
              </ToggleButton>
            ))}
          </div>
        </div>
        <table className="w-full min-w-[980px] text-left text-sm">
          <caption className="sr-only">Rentabilidad de {monthLabel(month).toLowerCase()}</caption>
          <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {[
                'Profesor',
                'Horas',
                'Tarifa',
                'Coste',
                'Ingresos',
                'Margen',
                '€ por hora',
                'Ocupación',
              ].map((h) => (
                <th key={h} scope="col" className="px-5 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.teacherId}
                className={`border-b border-line-soft last:border-b-0 ${row === top ? 'bg-brand-soft/40' : ''}`}
              >
                <td className="px-5 py-3.5">
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-strong text-[13px] font-semibold text-paper"
                    >
                      {initials(row.teacherName)}
                    </span>
                    <span>
                      <span className="flex items-center gap-2 font-medium">
                        {row.teacherName}
                        {row === top && (
                          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-surface-raised">
                            Más rentable
                          </span>
                        )}
                      </span>
                      {/* Cada grupo en su línea: los nombres por defecto son largos. */}
                      {row.groups.map((group) => (
                        <span key={group} className="block text-xs text-ink-muted">
                          {group}
                        </span>
                      ))}
                    </span>
                  </span>
                </td>
                <td className="px-5 py-3.5">{hoursLabel(row.minutes)}</td>
                <td className="px-5 py-3.5">{formatCents(row.rateCents)}/h</td>
                <td className="px-5 py-3.5">{formatCents(row.costCents)}</td>
                <td className="px-5 py-3.5">{formatCents(row.incomeCents)}</td>
                <td className="px-5 py-3.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft"
                    >
                      <span
                        className="block h-full bg-brand"
                        style={{ width: `${Math.max(0, (row.marginCents / maxMargin) * 100)}%` }}
                      />
                    </span>
                    <span
                      className={`min-w-16 text-right font-semibold ${row.marginCents < 0 ? 'text-danger-fg' : ''}`}
                    >
                      {formatCents(row.marginCents)}
                    </span>
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  {row.incomePerHourCents === null ? '—' : formatCents(row.incomePerHourCents)}
                </td>
                <td className="px-5 py-3.5" title={`${row.occupied} de ${row.capacity} plazas`}>
                  {occupancy(row)} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[13px] text-ink-muted">
          Coste = horas esperadas del mes según el horario (sin festivos ni sustituciones) × tarifa.
          Ingresos = cuotas mensuales de sus alumnos ya con descuentos (sin cuotas de socio); si un
          alumno va con varios profesores, se reparte según las horas con cada uno. Ocupación =
          plazas ocupadas de todas sus clases, contando cada día. Margen = ingresos − coste.
        </p>
      </Card>
    </div>
  );
}
