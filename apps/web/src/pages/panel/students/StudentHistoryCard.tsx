import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { fetchStudentHistory } from '@/features/audit/api';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { madridDateTime } from '@/shared/dateTime';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';

import { ChangeCard } from '../audit/ActionDetail';

/**
 * Lo que ha cambiado del alumno, para rastrear lo que no pasa en el día a día: sus datos y los de contacto, la familia
 * directa, las altas y bajas, los grupos y sus datos de cobro (sin cuotas, cobros ni puntos, que tienen su sección).
 * Solo superadministración.
 */
export function StudentHistoryCard({
  studentId,
  title,
}: {
  studentId: string;
  title: (text: string) => ReactNode;
}) {
  const history = useInfiniteQuery({
    queryKey: ['student-history', studentId],
    queryFn: ({ pageParam }) => fetchStudentHistory(studentId, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const pages = history.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items.map((entry) => ({ entry, page })));

  return (
    <Card className="p-4">
      {title('Historial de cambios')}
      {history.isError ? (
        <Alert>{apiErrorMessage(history.error)}</Alert>
      ) : history.isPending ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">No hay cambios registrados.</p>
      ) : (
        <ol aria-label="Historial de cambios" className="flex flex-col gap-4">
          {items.map(({ entry, page }) => (
            <li key={entry.id} className="flex flex-col gap-2">
              <p className="text-[13px]">
                <span className="font-semibold">{entry.label}</span>
                <span className="text-ink-muted">
                  {' · '}
                  {madridDateTime(entry.occurredAt)} · {entry.userName}
                </span>
              </p>
              {entry.changes.map((change, index) => (
                <ChangeCard
                  key={`${change.table}-${index}`}
                  change={change}
                  references={page.references}
                  // «Ir al alumno» llevaría a esta misma ficha.
                  showTarget={
                    !(change.target?.kind === 'student' && change.target.id === studentId)
                  }
                />
              ))}
            </li>
          ))}
        </ol>
      )}
      {history.hasNextPage && (
        <div className="mt-3">
          <Button
            variant="secondary"
            busy={history.isFetchingNextPage}
            busyLabel="Cargando…"
            onClick={() => void history.fetchNextPage()}
          >
            Ver más
          </Button>
        </div>
      )}
    </Card>
  );
}
