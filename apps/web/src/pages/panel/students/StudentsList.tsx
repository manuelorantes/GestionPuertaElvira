import type { StudentSummary } from '@/features/students/api';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';

export function StudentsList({
  students,
  onOpen,
}: {
  students: StudentSummary[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul aria-label="Alumnos">
      <li
        aria-hidden
        className="hidden grid-cols-[3.5rem_2fr_2fr_1fr] gap-4 border-b border-line px-5 py-3 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase md:grid"
      >
        <span>Nº</span>
        <span>Alumno</span>
        <span>Grupos</span>
        <span>Estado</span>
      </li>
      {students.map((student) => (
        <li key={student.id} className="border-b border-line last:border-b-0">
          <button
            type="button"
            onClick={() => onOpen(student.id)}
            className="grid w-full cursor-pointer grid-cols-[3rem_1fr] gap-2 px-5 py-3 text-left hover:bg-surface-muted md:grid-cols-[3.5rem_2fr_2fr_1fr] md:items-center md:gap-4"
          >
            <span
              className="self-center text-sm font-semibold text-ink-muted tabular-nums"
              aria-label={`Número de socio ${student.memberNumber}`}
            >
              {student.memberNumber}
            </span>
            <span className="flex items-center gap-3">
              <Avatar name={student.fullName} />
              <span>
                <span className="block font-medium">{student.fullName}</span>
                <span className="block text-[13px] text-ink-muted">
                  {student.age === null ? 'Edad sin indicar' : `${student.age} años`}
                </span>
              </span>
            </span>
            <span className="col-start-2 text-sm md:col-start-auto">
              {student.groups.length === 0 && (
                <span className="text-ink-muted">Socio sin clases</span>
              )}
              {student.groups.map((group) => (
                <span key={group.id} className="block">
                  {group.name}{' '}
                  <span className="text-[13px] text-ink-muted">· {group.slotLabel}</span>
                </span>
              ))}
            </span>
            <span className="col-start-2 flex flex-wrap gap-1.5 md:col-start-auto">
              <Badge tone={student.status === 'active' ? 'success' : 'neutral'}>
                {student.status === 'active' ? 'Activo' : 'De baja'}
              </Badge>
              {student.hasSiblings && <Badge>Hermanos</Badge>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
