import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { groupLine } from '@/features/teacher-space/groups';
import { useTeacherGroups } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';

/** Sus grupos (y los que sustituye esa semana); cada uno lleva a su página con alumnos, asistencia y comentarios. */
export function TeacherGroupsPage() {
  const groups = useTeacherGroups();
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
        Mis grupos
      </h1>
      {groups.isPending ? (
        <p className="text-ink-muted">Cargando grupos…</p>
      ) : groups.isError ? (
        <Alert>{apiErrorMessage(groups.error)}</Alert>
      ) : groups.data.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">No tienes clases asignadas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.data.map((group) => (
            <li key={group.groupId}>
              <Card className="overflow-hidden">
                <Link
                  to={`/panel/mis-grupos/${group.groupId}`}
                  aria-label={`Ver ${group.name}`}
                  className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{group.name}</span>
                      {group.substitution && <Badge>Sustitución</Badge>}
                    </span>
                    <span className="block text-sm text-ink-muted">{groupLine(group)}</span>
                  </span>
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-muted" />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
