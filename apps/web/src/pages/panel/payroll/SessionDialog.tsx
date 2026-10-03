import { Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents } from '@/features/billing/money';
import type { Teacher } from '@/features/classes/api';
import { useGroups } from '@/features/classes/hooks';
import { recordSession, updateSession, type Session } from '@/features/payroll/api';
import { usePayrollMutation } from '@/features/payroll/hooks';
import { hoursLabel } from '@/features/payroll/hours';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

const OTHER = 'other';

interface SessionDialogProps {
  session: Session | null;
  teachers: Teacher[];
  onClose: () => void;
}

/** «Registrar horas» (nueva sesión) o «Editar sesión» (sustitución o cambio de horas). */
export function SessionDialog({ session, teachers, onClose }: SessionDialogProps) {
  const groups = useGroups();
  const [teacherId, setTeacherId] = useState(session?.teacherId ?? teachers[0]?.id ?? '');
  const [groupId, setGroupId] = useState(session?.groupId ?? '');
  const [activity, setActivity] = useState('');
  const [date, setDate] = useState(todayIso());
  const [minutes, setMinutes] = useState(session?.minutes ?? 60);
  const toast = useToast();
  const save = usePayrollMutation(async (): Promise<void> => {
    await (session
      ? updateSession(session.id, teacherId, minutes / 60)
      : recordSession({
          teacherId,
          date,
          groupId: groupId === OTHER || groupId === '' ? null : groupId,
          activity: groupId === OTHER ? activity.trim() : null,
          hours: minutes / 60,
        }));
  });
  const teacher = teachers.find((t) => t.id === teacherId);
  const rateCents = Math.round(Number(teacher?.hourlyRate ?? 0) * 100);
  const year = new Date().getFullYear();
  const title = session ? 'Editar sesión' : 'Registrar horas';
  const invalid =
    !teacherId || (!session && (groupId === '' || (groupId === OTHER && !activity.trim())));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    await save.mutateAsync(undefined).then(
      () => {
        toast(session ? 'Sesión actualizada' : 'Horas registradas');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="session-title">
      <form onSubmit={(event) => void submit(event)}>
        <h2
          id="session-title"
          className="border-b border-line px-6 py-5 font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {title}
        </h2>
        <div className="flex flex-col gap-4 p-6">
          {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
          {session && (
            <p className="text-sm text-ink-soft">
              {session.label} · {session.date.split('-').reverse().join('/')}
            </p>
          )}
          <Select
            label="Profesor"
            value={teacherId}
            onChange={setTeacherId}
            options={teachers.map((t) => ({ value: t.id, label: t.fullName }))}
          />
          {!session && (
            <>
              <Select
                label="Clase"
                value={groupId}
                onChange={setGroupId}
                options={[
                  { value: '', label: 'Elige una clase' },
                  ...(groups.data ?? []).map((g) => ({
                    value: g.id,
                    label: `${g.name} · ${g.slotLabel}`,
                  })),
                  { value: OTHER, label: 'Otra actividad' },
                ]}
              />
              {groupId === OTHER && (
                <TextField
                  label="Actividad"
                  placeholder="Torneo escolar"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                />
              )}
              <DateField
                label="Fecha"
                value={date}
                onChange={setDate}
                fromYear={year - 1}
                toYear={year + 1}
              />
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Horas</span>
            <div className="flex h-11 items-center rounded-sm border border-line-strong">
              <button
                type="button"
                aria-label="Menos horas"
                disabled={minutes <= 30}
                onClick={() => setMinutes(minutes - 30)}
                className="flex size-11 cursor-pointer items-center justify-center disabled:opacity-40"
              >
                <Minus aria-hidden size={16} />
              </button>
              <span aria-live="polite" className="flex-1 text-center font-semibold">
                {hoursLabel(minutes)}
              </span>
              <button
                type="button"
                aria-label="Más horas"
                disabled={minutes >= 720}
                onClick={() => setMinutes(minutes + 30)}
                className="flex size-11 cursor-pointer items-center justify-center disabled:opacity-40"
              >
                <Plus aria-hidden size={16} />
              </button>
            </div>
          </div>
          <p className="flex justify-between rounded-sm bg-sand px-4 py-3 text-sm">
            Coste a {formatCents(rateCents)}/h:{' '}
            {formatCents(Math.round((rateCents * minutes) / 60))}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid} busy={save.isPending} busyLabel="Guardando…">
            Guardar horas
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
