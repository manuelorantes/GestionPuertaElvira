import { Pencil } from 'lucide-react';

import type { ClassGroup } from '@/features/classes/api';
import { classroomLabel } from '@/features/classes/classrooms';
import { LEVELS, WEEKLY_PLAN_LABEL } from '@/features/classes/levels';
import { WEEKDAYS } from '@/features/classes/schedule';
import { Card } from '@/shared/ui/Card';
import { OccupancyBar } from '@/shared/ui/OccupancyBar';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import { OccupancyByDay } from './OccupancyByDay';

type Column = 'name' | 'level' | 'teacher' | 'slot' | 'classroom' | 'occupancy';

const COLUMNS: Record<Column, SortColumn<ClassGroup>> = {
  name: { label: 'Grupo', name: 'grupo', value: (g) => g.name },
  level: { label: 'Nivel', name: 'nivel', value: (g) => LEVELS[g.level].label },
  teacher: { label: 'Profesor', name: 'profesor', value: (g) => g.teacher.fullName },
  // Por su primer día de la semana y su hora, como salen en el horario.
  slot: {
    label: 'Horario',
    name: 'horario',
    value: (g) => `${WEEKDAYS.findIndex((d) => d.id === g.days[0])} ${g.start}`,
  },
  classroom: { label: 'Aula', name: 'aula', value: (g) => classroomLabel(g.classroom) },
  occupancy: { label: 'Ocupación', name: 'ocupación', value: (g) => g.occupied / g.capacity },
};

export function GroupsTable({
  groups,
  onEdit,
  onOpen,
}: {
  groups: ClassGroup[];
  /** Sin él (profesorado), no se puede editar. */
  onEdit?: ((group: ClassGroup) => void) | undefined;
  onOpen: (group: ClassGroup) => void;
}) {
  const { header, apply } = useTableSort(COLUMNS, { key: 'name' });
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <caption className="sr-only">Grupos</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {(Object.keys(COLUMNS) as Column[]).map((key) => (
              <th key={key} scope="col" className="px-4 py-3 font-semibold">
                {header(key)}
              </th>
            ))}
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apply(groups).map((group) => (
            <tr key={group.id} className="border-b border-line last:border-b-0">
              <td className="px-4 py-3 font-medium">
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={`size-3 shrink-0 rounded-[4px] border ${LEVELS[group.level].className}`}
                  />
                  {group.name}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-soft">{LEVELS[group.level].label}</td>
              <td className="px-4 py-3">{group.teacher.fullName}</td>
              <td className="px-4 py-3">
                <p>{group.slotLabel}</p>
                <p className="text-xs text-ink-muted">{WEEKLY_PLAN_LABEL[group.weeklyPlan]}</p>
              </td>
              <td className="px-4 py-3">{classroomLabel(group.classroom)}</td>
              <td className="px-4 py-3">
                <OccupancyBar occupied={group.occupied} capacity={group.capacity} />
                <OccupancyByDay group={group} />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(group)}
                    aria-label={`Alumnos de ${group.name}`}
                    className="inline-flex h-9 cursor-pointer items-center rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-surface-muted"
                  >
                    Alumnos
                  </button>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(group)}
                      aria-label={`Editar ${group.name}`}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-brand-soft"
                    >
                      <Pencil aria-hidden size={16} />
                      Editar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
