import { Pencil } from 'lucide-react';

import type { ClassGroup } from '@/features/classes/api';
import { LEVELS, WEEKLY_PLAN_LABEL } from '@/features/classes/levels';
import { Card } from '@/shared/ui/Card';
import { OccupancyBar } from '@/shared/ui/OccupancyBar';

export function GroupsTable({
  groups,
  onEdit,
  onOpen,
}: {
  groups: ClassGroup[];
  onEdit: (group: ClassGroup) => void;
  onOpen: (group: ClassGroup) => void;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <caption className="sr-only">Grupos</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {['Grupo', 'Nivel', 'Profesor', 'Horario', 'Aula', 'Ocupación'].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                {heading}
              </th>
            ))}
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
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
              <td className="px-4 py-3">Aula {group.classroom}</td>
              <td className="px-4 py-3">
                <OccupancyBar occupied={group.occupied} capacity={group.capacity} />
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
                  <button
                    type="button"
                    onClick={() => onEdit(group)}
                    aria-label={`Editar ${group.name}`}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-brand-soft"
                  >
                    <Pencil aria-hidden size={16} />
                    Editar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
