import type { GroupMovement } from '@/features/classes/api';
import { useGroupHistory } from '@/features/classes/hooks';
import { formatDate } from '@/features/students/format';
import { Card } from '@/shared/ui/Card';
import { StudentLink } from '@/pages/panel/students/StudentLink';

function reasonText({ reason, otherGroup }: GroupMovement): string | null {
  switch (reason) {
    case 'moved_from':
      return `viene de ${otherGroup}`;
    case 'moved_to':
      return `pasa a ${otherGroup}`;
    case 'withdrawn':
      return 'baja del club';
    case null:
      return null;
  }
}

/** Quién entró en el grupo y quién salió, de lo más reciente a lo más antiguo. */
export function GroupHistory({ groupId }: { groupId: string }) {
  const history = useGroupHistory(groupId);

  return (
    <Card className="p-4">
      <section aria-labelledby={`group-history-${groupId}`}>
        <h3
          id={`group-history-${groupId}`}
          className="mb-2 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase"
        >
          Historial
        </h3>
        {history.isPending && <p className="text-sm text-ink-muted">Cargando historial…</p>}
        {history.isError && (
          <p className="text-sm text-danger-fg">No se ha podido cargar el historial.</p>
        )}
        {history.data?.length === 0 && (
          <p className="text-sm text-ink-muted">
            Todavía no ha entrado ni salido nadie de este grupo.
          </p>
        )}
        {history.data && history.data.length > 0 && (
          <ul className="divide-y divide-line">
            {history.data.map((m) => {
              const reason = reasonText(m);
              return (
                <li
                  key={`${m.studentId}-${m.movement}-${m.date}`}
                  className="flex gap-3 py-2 text-sm"
                >
                  <span className="w-20 shrink-0 text-ink-muted tabular-nums">
                    {formatDate(m.date)}
                  </span>
                  <span>
                    <span
                      className={`font-semibold ${m.movement === 'joined' ? 'text-success-fg' : 'text-danger-fg'}`}
                    >
                      {m.movement === 'joined' ? 'Entra' : 'Sale'}
                    </span>
                    {' · '}
                    <StudentLink id={m.studentId} className="font-medium">
                      {m.studentName}
                    </StudentLink>
                    {reason && <span className="text-ink-muted"> · {reason}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
