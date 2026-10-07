import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import type { StudentSummary } from '@/features/students/api';
import type { SortKey, StudentSort } from '@/features/students/sorting';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';

function SortHeader({
  label,
  name,
  column,
  sort,
  onSort,
}: {
  label: string;
  name: string;
  column: SortKey;
  sort: StudentSort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.descending ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Ordenar por ${name}`}
      aria-pressed={active}
      title={`Ordenar por ${name}`}
      className={`inline-flex cursor-pointer items-center gap-1 uppercase hover:text-ink ${active ? 'text-ink' : ''}`}
    >
      {label}
      <Icon aria-hidden size={13} className={active ? '' : 'opacity-50'} />
    </button>
  );
}

export function StudentsList({
  students,
  sort,
  onSort,
  onOpen,
}: {
  students: StudentSummary[];
  sort: StudentSort;
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <ul aria-label="Alumnos">
      <li className="grid grid-cols-[3rem_1fr] gap-2 border-b border-line px-5 py-3 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase md:grid-cols-[3.5rem_2fr_2fr_1fr] md:gap-4">
        <SortHeader label="Nº" name="número" column="number" sort={sort} onSort={onSort} />
        <SortHeader label="Alumno" name="nombre" column="name" sort={sort} onSort={onSort} />
        <span aria-hidden className="hidden md:block">
          Grupos
        </span>
        <span aria-hidden className="hidden md:block">
          Estado
        </span>
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
              {student.hasSiblings && <Badge>Familia directa</Badge>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
