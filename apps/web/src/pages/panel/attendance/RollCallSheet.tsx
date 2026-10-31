import { Check, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { classroomLabel } from '@/features/classes/classrooms';
import type { RollCall, RosterStudent } from '@/features/teacher-space/api';
import { dayLabel } from '@/features/teacher-space/dates';
import { Card } from '@/shared/ui/Card';
import { Combobox } from '@/shared/ui/Combobox';

import type { RollCallMarks } from './useRollCallMarks';

/**
 * Las piezas de una lista de clase que comparten el profesor y superadministración: la cabecera, los alumnos de ese día
 * (se marca a quien ha venido) y la asistencia especial (alumnos de otras clases que han venido).
 */

/** Día, hora, aula y nombre de la clase; `children` va debajo (p. ej. quién la da). */
export function RollCallHeading({ data, children }: { data: RollCall; children?: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-ink-muted">
        {dayLabel(data.date)} · {data.start}–{data.end}
        {data.classroom ? ` · ${classroomLabel(data.classroom)}` : ''}
      </p>
      <h1 className="font-display text-[26px] leading-tight font-bold tracking-[0.04em] text-ink-strong uppercase">
        {data.label}
      </h1>
      {children}
    </div>
  );
}

interface StudentExtras {
  /** Botones junto a cada alumno (p. ej. comentar). */
  actions?: (student: RosterStudent) => ReactNode;
  /** Lo que va debajo de cada alumno (p. ej. sus comentarios). */
  details?: (student: RosterStudent) => ReactNode;
}

/** Los alumnos de ese día: se marca a quien ha venido. */
export function RollCallStudents({
  data,
  marks,
  editable,
  actions,
  details,
}: { data: RollCall; marks: RollCallMarks; editable: boolean } & StudentExtras) {
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-line px-4 py-3 text-sm text-ink-muted">
        {marks.present} de {data.list.length} {data.list.length === 1 ? 'alumno' : 'alumnos'} ·
        marca a quien ha venido
      </p>
      {data.list.length === 0 ? (
        <p className="px-4 py-6 text-center text-ink-muted">No hay alumnos ese día.</p>
      ) : (
        <ul aria-label="Alumnos">
          {data.list.map((student) => {
            const here = !marks.absent.has(student.id);
            return (
              <li key={student.id} className="border-b border-line-soft last:border-b-0">
                <div className="flex items-center pr-2">
                  <label className="flex min-h-14 flex-1 cursor-pointer items-center gap-3 px-4">
                    <input
                      type="checkbox"
                      checked={here}
                      disabled={!editable}
                      onChange={() => marks.toggle(student.id)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex size-7 shrink-0 items-center justify-center rounded-sm border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 ${
                        here ? 'border-brand bg-brand text-surface-raised' : 'border-line-strong'
                      }`}
                    >
                      {here && <Check size={18} strokeWidth={3} />}
                    </span>
                    <span className={`flex-1 ${here ? '' : 'text-ink-muted line-through'}`}>
                      {student.name}
                    </span>
                    {!here && <span className="text-[13px] text-ink-muted">No vino</span>}
                  </label>
                  {actions?.(student)}
                </div>
                <div className="px-4 pb-3 empty:hidden">{details?.(student)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Asistencia especial: alumnos de otras clases que han venido, para añadirlos (buscándolos) y quitarlos. */
export function SpecialAttendance({
  data,
  marks,
  editable,
  actions,
  details,
}: { data: RollCall; marks: RollCallMarks; editable: boolean } & StudentExtras) {
  const [picked, setPicked] = useState('');
  const chosen = new Set(marks.guests.map((g) => g.id));
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          Asistencia especial
        </h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Alumnos que no son de esta clase y han venido (a recuperar, por ejemplo).
        </p>
      </div>
      {marks.guests.length > 0 && (
        <ul aria-label="Asistencia especial" className="divide-y divide-line-soft">
          {marks.guests.map((g) => (
            <li key={g.id}>
              <div className="flex min-h-12 items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border-2 border-brand bg-brand text-surface-raised">
                  <Check aria-hidden size={18} strokeWidth={3} />
                </span>
                <span className="flex-1">
                  {g.name} <span className="font-semibold text-brand">*</span>
                </span>
                {editable && (
                  <button
                    type="button"
                    aria-label={`Quitar a ${g.name} de la asistencia especial`}
                    onClick={() => marks.removeGuest(g.id)}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                  >
                    <X aria-hidden size={16} />
                  </button>
                )}
                {actions?.(g)}
              </div>
              {details?.(g)}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <Combobox
          label="Añadir alumno de otra clase"
          placeholder="Escribe para buscar…"
          emptyText="Ningún alumno coincide"
          options={data.others
            .filter((s) => !chosen.has(s.id))
            .map((s) => ({ value: s.id, label: s.name }))}
          value={picked}
          onChange={(id) => {
            const student = data.others.find((s) => s.id === id);
            if (student) marks.addGuest(student);
            setPicked('');
          }}
        />
      )}
    </Card>
  );
}
