import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { monthLabel } from '@/features/billing/money';
import type { PointsKind } from '@/features/points/api';
import { useMovements } from '@/features/points/hooks';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { ToggleButton } from '@/shared/ui/ToggleButton';

import { KIND_LABEL, signed } from './labels';
import { StudentLink } from '@/pages/panel/students/StudentLink';

const KINDS: (PointsKind | 'all')[] = ['all', 'friday', 'tournament', 'manual', 'redemption'];

/** Todo lo que ha pasado con los puntos en el mes: lo ganado, los ajustes y los canjes. */
export function MovementsTab({ month, kind }: { month: string; kind?: PointsKind }) {
  const [filter, setFilter] = useState<PointsKind | 'all'>(kind ?? 'all');
  const movements = useMovements({ month, ...(filter === 'all' ? {} : { kind: filter }) });

  return (
    <Card className="overflow-hidden">
      {!kind && (
        <div
          role="group"
          aria-label="Tipo"
          className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3"
        >
          {KINDS.map((k) => (
            <ToggleButton
              key={k}
              tone="ink"
              pressed={filter === k}
              onClick={() => setFilter(k)}
              className="h-9 rounded-full font-medium"
            >
              {k === 'all' ? 'Todos' : KIND_LABEL[k]}
            </ToggleButton>
          ))}
        </div>
      )}
      {movements.isPending ? (
        <p className="p-5 text-ink-muted">Cargando…</p>
      ) : movements.isError ? (
        <div className="p-5">
          <Alert>{apiErrorMessage(movements.error)}</Alert>
        </div>
      ) : movements.data.length === 0 ? (
        <p className="px-5 py-8 text-center text-ink-muted">
          Nada en {monthLabel(month).toLowerCase()}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Movimientos de {monthLabel(month).toLowerCase()}</caption>
            <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              <tr>
                {['Fecha', 'Alumno', 'Tipo', 'Concepto', 'Puntos', 'Quién'].map((h) => (
                  <th key={h} scope="col" className="px-5 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.data.map((m) => (
                <tr key={m.id} className="border-b border-line-soft last:border-b-0">
                  <td className="px-5 py-2.5 tabular-nums">{formatDate(m.date)}</td>
                  <td className="px-5 py-2.5 font-medium">
                    <StudentLink id={m.studentId}>{m.studentName}</StudentLink>
                  </td>
                  <td className="px-5 py-2.5 text-ink-muted">{KIND_LABEL[m.kind]}</td>
                  <td className="px-5 py-2.5">{m.concept}</td>
                  <td
                    className={`px-5 py-2.5 font-semibold tabular-nums ${m.delta < 0 ? 'text-danger-fg' : 'text-success-fg'}`}
                  >
                    {signed(m.delta)}
                  </td>
                  <td className="px-5 py-2.5 text-ink-muted">{m.by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
