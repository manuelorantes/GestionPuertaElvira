import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import type { Teacher, Weekday } from '@/features/classes/api';
import { useGroups } from '@/features/classes/hooks';
import { planSubstitution } from '@/features/payroll/api';
import { usePayrollMutation } from '@/features/payroll/hooks';
import { todayIso } from '@/features/students/format';
import { ApiError } from '@/shared/api/client';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

/** Día de la semana de JavaScript (0 = domingo) → día de clase; sábado y domingo no tienen clase. */
const WEEKDAY_IDS: (Weekday | null)[] = [null, 'mon', 'tue', 'wed', 'thu', 'fri', null];

function weekdayOf(date: string): Weekday | null {
  const [y = 2000, m = 1, d = 1] = date.split('-').map(Number);
  return WEEKDAY_IDS[new Date(y, m - 1, d).getDay()] ?? null;
}

/**
 * Planifica una sustitución: día, clase de ese día y quién la da. Si esa persona ya tiene otra clase o un turno a esa
 * hora, la API pide un motivo (dará las dos a la vez y no suma horas dobles).
 */
export function SubstitutionDialog({
  date: initialDate,
  teachers,
  onClose,
}: {
  date: string;
  teachers: Teacher[];
  onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate || todayIso());
  const [groupId, setGroupId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState('');
  const groups = useGroups();
  const plan = usePayrollMutation(planSubstitution);
  const toast = useToast();
  const year = new Date().getFullYear();
  const weekday = weekdayOf(date);
  const options = (groups.data ?? [])
    .filter((g) => weekday !== null && g.days.includes(weekday))
    .sort((a, b) => a.start.localeCompare(b.start));
  const group = options.find((g) => g.id === groupId);
  const candidates = teachers.filter((t) => t.active && t.id !== group?.teacher.id);
  const needsReason = plan.error instanceof ApiError && plan.error.code === 'reason_required';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!groupId || !teacherId) return;
    void plan.mutateAsync({ groupId, date, teacherId, reason: reason.trim() || null }).then(
      () => {
        toast('Sustitución planificada');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="substitution-title">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="substitution-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Nueva sustitución
        </h2>
        {plan.isError &&
          (needsReason ? (
            <Alert tone="info">{apiErrorMessage(plan.error)}</Alert>
          ) : (
            <Alert>{apiErrorMessage(plan.error)}</Alert>
          ))}
        <DateField
          label="Día"
          value={date}
          onChange={(value) => {
            setDate(value);
            setGroupId('');
          }}
          fromYear={year - 1}
          toYear={year + 1}
        />
        <Select
          label="Clase"
          options={[
            {
              value: '',
              label: options.length === 0 ? 'Ese día no hay clases' : 'Elige la clase',
            },
            ...options.map((g) => ({
              value: g.id,
              label: `${g.start}–${g.end} · ${g.name} · ${g.teacher.fullName}`,
            })),
          ]}
          value={groupId}
          onChange={(value) => {
            setGroupId(value);
            setTeacherId('');
          }}
        />
        <Select
          label="La da"
          options={[
            { value: '', label: 'Elige quién sustituye' },
            ...candidates.map((t) => ({ value: t.id, label: t.fullName })),
          ]}
          value={teacherId}
          onChange={setTeacherId}
          disabled={!group}
        />
        <TextField
          label={
            needsReason ? 'Motivo (obligatorio: dará dos clases a la vez)' : 'Motivo (opcional)'
          }
          placeholder="Por ejemplo: Ana está en un torneo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-[13px] text-ink-muted">
          Ese día la sesión se apuntará sola a quien sustituye. Si ya tiene clase o turno a esa
          hora, es un caso especial: da las dos a la vez y no suma horas dobles.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!groupId || !teacherId || (needsReason && reason.trim() === '')}
            busy={plan.isPending}
            busyLabel="Guardando…"
          >
            Planificar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
