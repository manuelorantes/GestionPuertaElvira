import { useState, type FormEvent } from 'react';

import type { ClassGroup, Weekday } from '@/features/classes/api';
import { WEEKDAYS } from '@/features/classes/schedule';
import type { Attendance } from '@/features/students/api';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { ToggleButton } from '@/shared/ui/ToggleButton';

interface EnrolmentDialogProps {
  title: string;
  confirmLabel: string;
  /** Grupos entre los que elegir; con uno solo y `fixedGroup`, no se puede cambiar. */
  groups: ClassGroup[];
  fixedGroup?: ClassGroup | undefined;
  /** Horario especial actual (al editar). */
  current?: Attendance | null;
  /** Con etiqueta, se elige desde qué día está en el grupo (por defecto hoy). */
  startLabel?: string;
  onClose: () => void;
  onConfirm: (groupId: string, attendance: Attendance | null, from: string) => Promise<unknown>;
}

/** Medias horas desde `from` hasta `to`, ambas incluidas. */
function halfHours(from: string, to: string): string[] {
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const label = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const out: string[] = [];
  for (let m = toMinutes(from); m <= toMinutes(to); m += 30) out.push(label(m));
  return out;
}

/**
 * Inscribir a un alumno en un grupo (o cambiar su horario en él), con la opción de un horario
 * especial: solo algunos días del grupo o solo parte de la hora.
 */
export function EnrolmentDialog({
  title,
  confirmLabel,
  groups,
  fixedGroup,
  current = null,
  startLabel,
  onClose,
  onConfirm,
}: EnrolmentDialogProps) {
  const [from, setFrom] = useState(todayIso());
  const [groupId, setGroupId] = useState(fixedGroup?.id ?? groups[0]?.id ?? '');
  const group = fixedGroup ?? groups.find((g) => g.id === groupId);
  const [special, setSpecial] = useState(current !== null);
  const [days, setDays] = useState<Weekday[]>(current?.days ?? group?.days ?? []);
  const [start, setStart] = useState(current?.start ?? group?.start ?? '');
  const [end, setEnd] = useState(current?.end ?? group?.end ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickGroup(id: string) {
    setGroupId(id);
    const next = groups.find((g) => g.id === id);
    setDays(next?.days ?? []);
    setStart(next?.start ?? '');
    setEnd(next?.end ?? '');
  }

  function toggleDay(day: Weekday) {
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));
  }

  const attendance: Attendance | null =
    special && group
      ? {
          days: WEEKDAYS.map((d) => d.id).filter((d) => group.days.includes(d) && days.includes(d)),
          start,
          end,
        }
      : null;
  const problem = !group
    ? 'Elige un grupo.'
    : startLabel && !from
      ? 'Indica desde qué día.'
      : attendance && attendance.days.length === 0
        ? 'Elige al menos un día del grupo.'
        : attendance && attendance.start >= attendance.end
          ? 'La hora de fin debe ser posterior a la de inicio.'
          : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!group || problem) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(group.id, attendance, from);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  }

  const hours = group ? halfHours(group.start, group.end) : [];

  return (
    <Dialog open onClose={onClose} labelledBy="enrolment-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="enrolment-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {title}
        </h2>
        {error && <Alert>{error}</Alert>}
        {fixedGroup ? (
          <p className="text-sm">
            <span className="font-medium">{fixedGroup.name}</span>
            <span className="text-ink-muted"> · {fixedGroup.slotLabel}</span>
          </p>
        ) : groups.length === 0 ? (
          <Alert tone="info">No hay grupos disponibles.</Alert>
        ) : (
          <Select
            label="Grupo"
            options={groups.map((g) => ({
              value: g.id,
              label: `${g.name} · ${g.slotLabel} · ${g.occupied}/${g.capacity}`,
            }))}
            value={groupId}
            onChange={pickGroup}
          />
        )}
        {group && startLabel && (
          <DateField
            label={startLabel}
            value={from}
            onChange={setFrom}
            fromYear={new Date().getFullYear() - 1}
            toYear={new Date().getFullYear()}
          />
        )}
        {group && (
          <>
            <Switch label="Horario especial" checked={special} onChange={setSpecial} />
            <p className="-mt-2 text-[13px] text-ink-muted">
              Solo algunos días del grupo, o solo parte de la hora: ocupa plaza esos días y paga las
              horas que hace.
            </p>
            {special && (
              <div className="flex flex-col gap-3 rounded-sm bg-surface-muted p-3">
                <div role="group" aria-label="Días" className="flex flex-wrap gap-2">
                  {WEEKDAYS.filter((d) => group.days.includes(d.id)).map((d) => (
                    <ToggleButton
                      key={d.id}
                      pressed={days.includes(d.id)}
                      onClick={() => toggleDay(d.id)}
                    >
                      {d.short}
                    </ToggleButton>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Empieza"
                    options={hours.slice(0, -1).map((h) => ({ value: h, label: h }))}
                    value={start}
                    onChange={setStart}
                  />
                  <Select
                    label="Termina"
                    options={hours.slice(1).map((h) => ({ value: h, label: h }))}
                    value={end}
                    onChange={setEnd}
                  />
                </div>
              </div>
            )}
          </>
        )}
        {problem && group && <p className="text-[13px] font-medium text-danger-fg">{problem}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} busyLabel="Guardando…" disabled={!group || !!problem}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
