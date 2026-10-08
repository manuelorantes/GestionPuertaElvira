import { Link } from 'react-router';

import { classroomLabel } from '@/features/classes/classrooms';
import type { TeacherClass } from '@/features/teacher-space/api';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';

/** Una clase de la agenda: hora, nombre, aula y alumnos de ese día. */
export function ClassCard({ item }: { item: TeacherClass }) {
  return (
    <Card className="flex items-start gap-4 px-4 py-3.5">
      <div className="w-14 shrink-0 text-center">
        <p className="font-display text-xl font-bold">{item.start}</p>
        <p className="text-xs text-ink-muted">{item.end}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.label}</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {item.groupId === null
            ? 'Turno'
            : `${item.classroom ? classroomLabel(item.classroom) : ''} · ${item.students} ${item.students === 1 ? 'alumno' : 'alumnos'}`}
        </p>
        <span className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
          {item.substitution && <Badge>Sustitución</Badge>}
          {item.rollCall === 'taken' && <Badge tone="success">Lista pasada</Badge>}
          {item.rollCall === 'missed' && <Badge tone="warning">Sin lista</Badge>}
        </span>
      </div>
      {item.groupId !== null && (item.rollCall === 'open' || item.rollCall === 'taken') && (
        <Link
          to={`/panel/lista/${item.groupId}/${item.date}`}
          aria-label={`${item.rollCall === 'open' ? 'Pasar lista' : 'Corregir la lista'} de ${item.label}`}
          className={`flex h-11 shrink-0 items-center rounded-sm px-3 text-sm font-semibold no-underline ${
            item.rollCall === 'open'
              ? 'bg-brand text-surface-raised hover:bg-brand-strong'
              : 'border border-line-strong text-ink hover:bg-surface-muted'
          }`}
        >
          {item.rollCall === 'open' ? 'Pasar lista' : 'Corregir'}
        </Link>
      )}
    </Card>
  );
}
