import { useState, type FormEvent } from 'react';

import { fiscalYearOf } from '@/features/accounting/categories';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import type { Teacher, Weekday } from '@/features/classes/api';
import { useGroups } from '@/features/classes/hooks';
import { planSubstitution, substituteTeacher } from '@/features/payroll/api';
import { useHolidays, usePayrollMutation } from '@/features/payroll/hooks';
import { todayIso } from '@/features/students/format';
import { ApiError } from '@/shared/api/client';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

/** Día de la semana de JavaScript (0 = domingo) → día de clase; sábado y domingo no tienen clase. */
const WEEKDAY_IDS: (Weekday | null)[] = [null, 'mon', 'tue', 'wed', 'thu', 'fri', null];

function weekdayOf(date: string): Weekday | null {
  const [y = 2000, m = 1, d = 1] = date.split('-').map(Number);
  return WEEKDAY_IDS[new Date(y, m - 1, d).getDay()] ?? null;
}

/** Días «AAAA-MM-DD» de `from` a `to`, ambos incluidos (vacío si están al revés). */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const [y = 2000, m = 1, d = 1] = from.split('-').map(Number);
  for (let day = new Date(y, m - 1, d); days.length < 400; day.setDate(day.getDate() + 1)) {
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    if (iso > to) break;
    days.push(iso);
  }
  return days;
}

type Mode = 'teacher' | 'class';

/**
 * Planifica sustituciones. Lo habitual es sustituir a un profesor por otro en todas sus clases de unos días; para
 * casos especiales, una sola clase. Si quien sustituye ya tiene otra clase o un turno a esa hora, la API pide un
 * motivo (dará las dos a la vez y no suma horas dobles).
 */
export function SubstitutionDialog({
  date,
  teachers,
  onClose,
}: {
  date: string;
  teachers: Teacher[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('teacher');
  const initialDate = date || todayIso();

  return (
    <Dialog open onClose={onClose} labelledBy="substitution-title">
      <div className="flex flex-col gap-4 p-6">
        <h2
          id="substitution-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Nueva sustitución
        </h2>
        <div role="group" aria-label="Qué se sustituye" className="flex flex-wrap gap-2">
          <ToggleButton pressed={mode === 'teacher'} onClick={() => setMode('teacher')}>
            Un profesor
          </ToggleButton>
          <ToggleButton pressed={mode === 'class'} onClick={() => setMode('class')}>
            Una sola clase
          </ToggleButton>
        </div>
        {mode === 'teacher' ? (
          <TeacherSubstitutionForm date={initialDate} teachers={teachers} onClose={onClose} />
        ) : (
          <ClassSubstitutionForm date={initialDate} teachers={teachers} onClose={onClose} />
        )}
      </div>
    </Dialog>
  );
}

interface FormProps {
  date: string;
  teachers: Teacher[];
  onClose: () => void;
}

/** Todas las clases de un profesor en unos días pasan a otro (salvo festivos). */
function TeacherSubstitutionForm({ date, teachers, onClose }: FormProps) {
  const [absentId, setAbsentId] = useState('');
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [substituteId, setSubstituteId] = useState('');
  const [reason, setReason] = useState('');
  const groups = useGroups();
  const holidays = useHolidays(fiscalYearOf(from.slice(0, 7)));
  const substitute = usePayrollMutation(substituteTeacher);
  const toast = useToast();
  const year = new Date().getFullYear();
  const active = teachers.filter((t) => t.active);
  const own = (groups.data ?? []).filter((g) => g.teacher.id === absentId);
  const holidayDates = new Set((holidays.data ?? []).map((h) => h.date));
  const classes = daysBetween(from, to)
    .filter((d) => !holidayDates.has(d))
    .reduce((count, d) => {
      const weekday = weekdayOf(d);
      return count + own.filter((g) => weekday !== null && g.days.includes(weekday)).length;
    }, 0);
  const needsReason = isReasonRequired(substitute.error);
  const ready = absentId !== '' && substituteId !== '' && to >= from && classes > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    void substitute
      .mutateAsync({
        teacherId: absentId,
        substituteId,
        from,
        to,
        reason: reason.trim() || null,
      })
      .then(
        (created) => {
          toast(created === 1 ? '1 clase sustituida' : `${created} clases sustituidas`);
          onClose();
        },
        () => undefined,
      );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <ErrorAlert error={substitute.error} needsReason={needsReason} />
      <Select
        label="Falta"
        options={[
          { value: '', label: 'Elige a quién se sustituye' },
          ...active.map((t) => ({ value: t.id, label: t.fullName })),
        ]}
        value={absentId}
        onChange={(value) => {
          setAbsentId(value);
          if (value === substituteId) setSubstituteId('');
        }}
      />
      <div className="flex flex-col gap-4">
        <DateField
          label="Desde"
          value={from}
          onChange={(value) => {
            setFrom(value);
            if (to < value) setTo(value);
          }}
          fromYear={year - 1}
          toYear={year + 1}
        />
        <DateField
          label="Hasta"
          value={to}
          onChange={setTo}
          fromYear={year - 1}
          toYear={year + 1}
        />
      </div>
      <Select
        label="Le sustituye"
        options={[
          { value: '', label: 'Elige quién sustituye' },
          ...active
            .filter((t) => t.id !== absentId)
            .map((t) => ({ value: t.id, label: t.fullName })),
        ]}
        value={substituteId}
        onChange={setSubstituteId}
        disabled={absentId === ''}
      />
      <ReasonField needsReason={needsReason} value={reason} onChange={setReason} />
      <p className="text-[13px] text-ink-muted">
        {absentId === ''
          ? 'Sus clases de esos días se apuntarán solas a quien sustituye. Los festivos no cuentan.'
          : classes === 0
            ? 'No tiene clases esos días.'
            : classes === 1
              ? 'Se sustituye 1 clase (los festivos no cuentan).'
              : `Se sustituyen ${classes} clases (los festivos no cuentan).`}
      </p>
      <Actions
        onClose={onClose}
        disabled={!ready || (needsReason && reason.trim() === '')}
        busy={substitute.isPending}
      />
    </form>
  );
}

/** Una clase concreta de un día la da otro profesor (casos especiales). */
function ClassSubstitutionForm({ date: initialDate, teachers, onClose }: FormProps) {
  const [date, setDate] = useState(initialDate);
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
  const needsReason = isReasonRequired(plan.error);

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
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <ErrorAlert error={plan.error} needsReason={needsReason} />
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
      <ReasonField needsReason={needsReason} value={reason} onChange={setReason} />
      <p className="text-[13px] text-ink-muted">
        Ese día la sesión se apuntará sola a quien sustituye. Si ya tiene clase o turno a esa hora,
        es un caso especial: da las dos a la vez y no suma horas dobles.
      </p>
      <Actions
        onClose={onClose}
        disabled={!groupId || !teacherId || (needsReason && reason.trim() === '')}
        busy={plan.isPending}
      />
    </form>
  );
}

function isReasonRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'reason_required';
}

function ErrorAlert({ error, needsReason }: { error: unknown; needsReason: boolean }) {
  if (error === null) return null;
  return needsReason ? (
    <Alert tone="info">{apiErrorMessage(error)}</Alert>
  ) : (
    <Alert>{apiErrorMessage(error)}</Alert>
  );
}

function ReasonField({
  needsReason,
  value,
  onChange,
}: {
  needsReason: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      label={needsReason ? 'Motivo (obligatorio: dará dos clases a la vez)' : 'Motivo (opcional)'}
      placeholder="Por ejemplo: Ana está en un torneo"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Actions({
  onClose,
  disabled,
  busy,
}: {
  onClose: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" disabled={disabled} busy={busy} busyLabel="Guardando…">
        Planificar
      </Button>
    </div>
  );
}
