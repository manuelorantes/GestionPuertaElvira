import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { currentMonth } from '@/features/billing/money';
import { fetchStudentPointsHistory } from '@/features/points/api';
import { formatDate } from '@/features/students/format';
import { Card } from '@/shared/ui/Card';

import { KIND_LABEL, signed } from '../points/labels';

/** Los puntos del alumno en la temporada: los de este mes y cada movimiento, del más reciente al más antiguo. */
export function StudentPointsCard({
  studentId,
  title,
}: {
  studentId: string;
  title: (text: string) => ReactNode;
}) {
  const movements = useQuery({
    queryKey: ['points', 'student-history', studentId],
    queryFn: () => fetchStudentPointsHistory(studentId),
  });
  const month = currentMonth();
  // Los puntos valen solo en su mes.
  const thisMonth = (movements.data ?? [])
    .filter((m) => m.date.startsWith(month))
    .reduce((sum, m) => sum + m.delta, 0);

  return (
    <Card className="p-4">
      {title('Puntos')}
      {!movements.data ? (
        <p className="text-sm text-ink-muted">{movements.isError ? '—' : 'Cargando…'}</p>
      ) : movements.data.length === 0 ? (
        <p className="text-sm text-ink-muted">No tiene movimientos de puntos esta temporada.</p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            Puntos de este mes: <strong>{thisMonth}</strong>
          </p>
          <table className="w-full text-[13px]">
            <caption className="sr-only">Movimientos de puntos</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-1 pr-3 font-medium">Fecha</th>
                <th className="py-1 pr-3 font-medium">Tipo</th>
                <th className="py-1 pr-3 font-medium">Motivo</th>
                <th className="py-1 text-right font-medium">Puntos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {movements.data.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(m.date)}</td>
                  <td className="py-1.5 pr-3 text-ink-muted">{KIND_LABEL[m.kind]}</td>
                  <td className="py-1.5 pr-3">{m.concept}</td>
                  <td
                    className={`py-1.5 text-right font-semibold ${m.delta < 0 ? 'text-ink-muted' : ''}`}
                  >
                    {signed(m.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
