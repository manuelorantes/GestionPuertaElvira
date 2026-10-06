import type { ClassGroup } from '@/features/classes/api';
import { CLASSROOMS, classroomColumn, classroomLabel } from '@/features/classes/classrooms';
import { LEVELS } from '@/features/classes/levels';
import {
  gridRows,
  groupsOn,
  HALF_HOUR_ROWS,
  HOUR_MARKS,
  WEEKDAYS,
} from '@/features/classes/schedule';
import { Card } from '@/shared/ui/Card';

const ROW_HEIGHT = 44;

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
  return (
    <Card className="p-4 md:p-6">
      <ul className="mb-4 flex flex-wrap gap-4 text-[13px] text-ink-soft" aria-label="Niveles">
        {Object.values(LEVELS).map((level) => (
          <li key={level.legend} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-3.5 rounded-[4px] border ${level.className}`} />
            {level.legend}
          </li>
        ))}
      </ul>
      <div tabIndex={0} aria-label="Horario semanal" className="overflow-x-auto">
        <div className="flex min-w-[1180px] gap-2">
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
          {WEEKDAYS.map((day) => (
            <div key={day.id} className="min-w-0 flex-1">
              <div className="flex h-12 flex-col justify-center border-b border-line-strong">
                <p className="text-sm font-semibold">{day.long}</p>
                <p className="grid grid-cols-3 text-[11px] tracking-[0.04em] text-ink-muted uppercase">
                  {CLASSROOMS.map((classroom) => (
                    <span key={classroom}>{classroomLabel(classroom).replace('Aula ', '')}</span>
                  ))}
                </p>
              </div>
              <div
                className="relative grid grid-cols-3 gap-x-1 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_87px,var(--color-line)_87px,var(--color-line)_88px)]"
                style={{ gridTemplateRows: `repeat(${HALF_HOUR_ROWS}, ${ROW_HEIGHT}px)` }}
              >
                {groupsOn(day.id, groups).map((group) => {
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
                        gridColumn: classroomColumn(group.classroom),
                      }}
                    >
                      {group.level === 'private_lesson' ? (
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
