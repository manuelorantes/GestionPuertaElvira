import { useState } from 'react';

import type { ClassGroup, Classroom } from '@/features/classes/api';
import { CLASSROOMS, classroomLabel } from '@/features/classes/classrooms';
import { LEVELS } from '@/features/classes/levels';
import { gridRows, groupsOn, HALF_HOUR_ROWS, HOUR_MARKS } from '@/features/classes/schedule';
import { allClassroomsColumns, classroomWeekColumns } from '@/features/classes/scheduleLayout';
import { Card } from '@/shared/ui/Card';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const ROW_HEIGHT = 44;
/** Ancho mínimo de cada columna de aula, para que la rejilla haga scroll antes de apretarse. */
const COLUMN_MIN_WIDTH = { summary: 75, detailed: 140 };

function teacherShortName(fullName: string) {
  return fullName.split(' ').slice(0, 2).join(' ');
}

export function WeeklySchedule({
  groups,
  onSelect,
}: {
  groups: ClassGroup[];
  onSelect: (group: ClassGroup) => void;
}) {
  // «Todas» muestra todas las aulas en columnas; un aula sola ocupa el ancho del día y da más detalle.
  const [classroom, setClassroom] = useState<Classroom | 'all'>('all');
  const detailed = classroom !== 'all';
  const visible = classroom === 'all' ? groups : groups.filter((g) => g.classroom === classroom);
  const days =
    classroom === 'all'
      ? allClassroomsColumns(visible, CLASSROOMS)
      : classroomWeekColumns(visible, classroom);
  const columnCount = days.reduce((total, day) => total + day.columnCount, 0);
  const minWidth = 44 + columnCount * COLUMN_MIN_WIDTH[detailed ? 'detailed' : 'summary'];

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4 text-[13px] text-ink-soft" aria-label="Niveles">
          {Object.values(LEVELS).map((level) => (
            <li key={level.legend} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-3.5 rounded-[4px] border ${level.className}`} />
              {level.legend}
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Aula" className="flex flex-wrap gap-1.5">
          <ToggleButton
            pressed={classroom === 'all'}
            onClick={() => setClassroom('all')}
            className="h-9 rounded-full font-medium"
          >
            Todas
          </ToggleButton>
          {CLASSROOMS.map((c) => (
            <ToggleButton
              key={c}
              pressed={classroom === c}
              onClick={() => setClassroom(c)}
              className="h-9 rounded-full font-medium"
            >
              {classroomLabel(c)}
            </ToggleButton>
          ))}
        </div>
      </div>
      <div role="region" tabIndex={0} aria-label="Horario semanal" className="overflow-x-auto">
        <div className="flex gap-2" style={{ minWidth }}>
          <div className="flex w-11 shrink-0 flex-col pt-12">
            {HOUR_MARKS.map((hour) => (
              <div
                key={hour}
                className="-mt-2 text-xs text-ink-muted"
                style={{ height: ROW_HEIGHT * 2 }}
              >
                {hour}
              </div>
            ))}
          </div>
          {days.map(({ day, classrooms, columnCount: dayColumnCount, columnOf }) => (
            <div
              key={day.id}
              role="group"
              aria-label={day.long}
              className="min-w-0 basis-0"
              style={{ flexGrow: dayColumnCount }}
            >
              <div className="flex h-12 flex-col justify-center border-b border-line-strong">
                <p className="text-sm font-semibold">{day.long}</p>
                <p
                  className="grid text-[11px] tracking-[0.04em] text-ink-muted uppercase"
                  style={{ gridTemplateColumns: `repeat(${dayColumnCount}, minmax(0, 1fr))` }}
                >
                  {classrooms.map(({ classroom: c, firstColumn, span }) => (
                    <span key={c} style={{ gridColumn: `${firstColumn} / span ${span}` }}>
                      {classroomLabel(c).replace('Aula ', '')}
                    </span>
                  ))}
                </p>
              </div>
              <div
                className="relative grid gap-x-1 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_87px,var(--color-line)_87px,var(--color-line)_88px)]"
                style={{
                  gridTemplateColumns: `repeat(${dayColumnCount}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${HALF_HOUR_ROWS}, ${ROW_HEIGHT}px)`,
                }}
              >
                {groupsOn(day.id, visible).map((group) => {
                  const { rowStart, rowEnd } = gridRows(group.start, group.end);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => onSelect(group)}
                      aria-label={`${group.name}, ${group.slotLabel}, ${group.teacher.fullName}, ${group.occupancyByDay[day.id] ?? group.occupied} de ${group.capacity} plazas`}
                      className={`m-0.5 flex cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded-sm border p-1.5 text-left hover:shadow-overlay ${LEVELS[group.level].className}`}
                      style={{
                        gridRow: `${rowStart} / ${rowEnd}`,
                        gridColumn: columnOf.get(group.id),
                      }}
                    >
                      {detailed ? (
                        <>
                          <span className="text-[13px] leading-tight font-semibold">
                            {group.customName ? group.name : LEVELS[group.level].label}
                          </span>
                          <span className="text-[11px] opacity-85">
                            {group.start}–{group.end}
                          </span>
                          <span className="text-[11px] opacity-85">
                            {group.teacher.fullName} ·{' '}
                            {group.occupancyByDay[day.id] ?? group.occupied}/{group.capacity}
                          </span>
                        </>
                      ) : group.level === 'private_lesson' ? (
                        <>
                          <span className="text-[13px] leading-tight font-semibold">
                            {group.name}
                          </span>
                          <span className="text-[11px] opacity-85">
                            {teacherShortName(group.teacher.fullName)} ·{' '}
                            {group.occupancyByDay[day.id] ?? group.occupied}/{group.capacity}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[13px] leading-tight font-semibold">
                            {teacherShortName(group.teacher.fullName)}
                          </span>
                          <span className="text-[11px] opacity-85">
                            {group.occupancyByDay[day.id] ?? group.occupied}/{group.capacity} plazas
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
