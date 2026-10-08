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
        {item.substitution && (
          <span className="mt-1.5 inline-block">
            <Badge>Sustitución</Badge>
          </span>
        )}
      </div>
    </Card>
  );
}
