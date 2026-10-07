import { Clock, Plus, X } from 'lucide-react';

import type { ScheduleBlock, ScheduleResolution } from '@/features/classes/api';
import { classroomLabel } from '@/features/classes/classrooms';
import { attendanceText, WEEKDAYS } from '@/features/classes/schedule';
import type { Attendance } from '@/features/students/api';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';

/** Medias horas de 16:00 a 21:00. */
const HOURS = Array.from({ length: 11 }, (_, i) => {
  const minutes = 16 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function blankBlock(): ScheduleBlock {
  return { day: 'mon', start: '17:00', end: '18:00', classroom: null };
}

interface ScheduleEditorProps {
  blocks: ScheduleBlock[];
  onChange: (blocks: ScheduleBlock[]) => void;
  resolution: ScheduleResolution | undefined;
  loading: boolean;
  /** Horario especial elegido a mano por grupo (undefined: el que sale de las horas; null: el grupo entero). */
  overrides?: Record<string, Attendance | null>;
  /** Abre el ajuste del horario especial de un grupo. */
  onEditAttendance?: (groupId: string) => void;
}

/**
 * Las horas a las que va a venir el alumno. La API las traduce a grupos (completos o con horario
 * especial); si a una hora hay clase en varias aulas, se elige el aula del tramo.
 */
export function ScheduleEditor({
  blocks,
  onChange,
  resolution,
  loading,
  overrides = {},
  onEditAttendance,
}: ScheduleEditorProps) {
  const update = (index: number, patch: Partial<ScheduleBlock>) =>
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const choiceFor = (block: ScheduleBlock) =>
    resolution?.choices.find(
      (c) => c.day === block.day && c.start >= block.start && c.end <= block.end,
    );

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => {
        const choice = choiceFor(block);
        return (
          <div
            key={index}
            role="group"
            aria-label={`Horario ${index + 1}`}
            className="grid items-end gap-2 rounded-sm bg-surface-muted p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <Select
              label="Día"
              options={WEEKDAYS.map((d) => ({ value: d.id, label: d.long }))}
              value={block.day}
              onChange={(day) =>
                update(index, { day: day as ScheduleBlock['day'], classroom: null })
              }
            />
            <Select
              label="Empieza"
              options={HOURS.slice(0, -1).map((h) => ({ value: h, label: h }))}
              value={block.start}
              onChange={(start) => update(index, { start })}
            />
            <Select
              label="Termina"
              options={HOURS.slice(1).map((h) => ({ value: h, label: h }))}
              value={block.end}
              onChange={(end) => update(index, { end })}
            />
            <button
              type="button"
              aria-label={`Quitar horario ${index + 1}`}
              onClick={() => onChange(blocks.filter((_, i) => i !== index))}
              className="flex size-10 cursor-pointer items-center justify-center rounded-sm hover:bg-surface"
            >
              <X aria-hidden size={16} />
            </button>
            {block.start >= block.end && (
              <p className="text-[13px] font-medium text-danger-fg sm:col-span-4">
                La hora de fin debe ser posterior a la de inicio.
              </p>
            )}
            {choice && (
              <Select
                label={`Aula para ${choice.label}`}
                options={[
                  { value: '', label: 'Elige el aula' },
                  ...choice.groups.map((g) => ({
                    value: g.classroom,
                    label: `${classroomLabel(g.classroom)} · ${g.name}`,
                  })),
                ]}
                value={block.classroom ?? ''}
                onChange={(classroom) =>
                  update(index, {
                    classroom: (classroom || null) as ScheduleBlock['classroom'],
                  })
                }
              />
            )}
          </div>
        );
      })}
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => onChange([...blocks, blankBlock()])}
      >
        <Plus aria-hidden size={16} />
        Añadir horario
      </Button>
      {blocks.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          Sin horario, se dará de alta como socio sin clases: se le pedirá la cuota de socio y se
          podrá inscribir más adelante.
        </p>
      )}
      {blocks.length > 0 && (
        <div aria-live="polite" className="flex flex-col gap-1 text-[13px]">
          {loading && <p className="text-ink-muted">Buscando los grupos…</p>}
          {resolution?.enrolments.map((e) => {
            const chosen = e.groupId in overrides ? overrides[e.groupId] : undefined;
            const special =
              chosen === undefined ? e.attendanceLabel : chosen ? attendanceText(chosen) : null;
            return (
              <div key={e.groupId} className="flex items-center gap-2">
                <p className="flex-1">
                  <span className="font-medium">{e.groupName}</span>
                  <span className="text-ink-muted"> · {e.slotLabel}</span>
                  {special && (
                    <span className="font-medium text-warning-fg">
                      {' '}
                      · horario especial: {special}
                    </span>
                  )}
                </p>
                {onEditAttendance && (
                  <button
                    type="button"
                    onClick={() => onEditAttendance(e.groupId)}
                    aria-label={`Horario especial en ${e.groupName}`}
                    title="Horario especial"
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted"
                  >
                    <Clock aria-hidden size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {resolution?.uncovered.map((u) => (
            <p key={u.label} className="font-medium text-danger-fg">
              Sin clase a esa hora: {u.label}
            </p>
          ))}
          {resolution?.choices.map((c) => (
            <p key={c.label} className="font-medium text-danger-fg">
              Hay clase en varias aulas el {c.label}: elige el aula.
            </p>
          ))}
          {resolution?.problems.map((p) => (
            <p key={p} className="font-medium text-danger-fg">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
