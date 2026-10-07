import { useState, type FormEvent } from 'react';

import { fiscalYearOf } from '@/features/accounting/categories';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import type { Teacher, Weekday } from '@/features/classes/api';
import { useGroups } from '@/features/classes/hooks';
import { planSubstitution, substituteTeacher } from '@/features/payroll/api';
import { useDuties, useHolidays, usePayrollMutation } from '@/features/payroll/hooks';
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

function jsDay(date: string): number {
  const [y = 2000, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function weekdayOf(date: string): Weekday | null {
  return WEEKDAY_IDS[jsDay(date)] ?? null;
}

/** 1 = lunes … 7 = domingo (como los turnos). */
function isoWeekdayOf(date: string): number {
  return jsDay(date) || 7;
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

type Mode = 'day' | 'period' | 'class';

const MODES: { id: Mode; label: string }[] = [
  { id: 'day', label: 'Un día' },
  { id: 'period', label: 'Periodo largo' },
  { id: 'class', label: 'Una sola clase' },
];

/**
 * Planifica sustituciones. Lo habitual es sustituir a un profesor por otro en todas sus clases y turnos de un día; para
 * una baja, un periodo largo (desde y hasta); para casos especiales, una sola clase o turno. Si quien sustituye ya tiene otra clase o un turno a esa hora, la API pide un
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
  const [mode, setMode] = useState<Mode>('day');
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
          {MODES.map((m) => (
            <ToggleButton key={m.id} pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </ToggleButton>
          ))}
        </div>
        {mode === 'class' ? (
          <ClassSubstitutionForm date={initialDate} teachers={teachers} onClose={onClose} />
        ) : (
          <TeacherSubstitutionForm
            key={mode}
            period={mode === 'period'}
            date={initialDate}
            teachers={teachers}
            onClose={onClose}
          />
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

/** Todas las clases y turnos de un profesor en un día (o un periodo) pasan a otro, salvo festivos. */
function TeacherSubstitutionForm({
  period,
  date,
  teachers,
  onClose,
}: FormProps & { period: boolean }) {
  const [absentId, setAbsentId] = useState('');
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [substituteId, setSubstituteId] = useState('');
  const [reason, setReason] = useState('');
  const groups = useGroups();
  const duties = useDuties();
  const holidays = useHolidays(fiscalYearOf(from.slice(0, 7)));
  const substitute = usePayrollMutation(substituteTeacher);
  const toast = useToast();
  const year = new Date().getFullYear();
  const active = teachers.filter((t) => t.active);
  const own = (groups.data ?? []).filter((g) => g.teacher.id === absentId);
  const ownDuties = (duties.data ?? []).filter((d) => d.teacherId === absentId);
  const holidayDates = new Set((holidays.data ?? []).map((h) => h.date));
  const until = period ? to : from;
  const classes = daysBetween(from, until)
    .filter((d) => !holidayDates.has(d))
    .reduce((count, d) => {
      const weekday = weekdayOf(d);
      return (
        count +
        own.filter((g) => weekday !== null && g.days.includes(weekday)).length +
        ownDuties.filter((duty) => duty.weekday === isoWeekdayOf(d)).length
      );
    }, 0);
  const needsReason = isReasonRequired(substitute.error);
  const ready = absentId !== '' && substituteId !== '' && until >= from && classes > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    void substitute
      .mutateAsync({
        teacherId: absentId,
        substituteId,
        from,
        to: until,
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
      {period ? (
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
      ) : (
        <DateField
          label="Día"
          value={from}
          onChange={setFrom}
          fromYear={year - 1}
          toYear={year + 1}
        />
      )}
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
          ? 'Sus clases y turnos se apuntarán solos a quien sustituye. Los festivos no cuentan.'
          : classes === 0
            ? period
              ? 'No tiene clases ni turnos esos días.'
              : 'No tiene clases ni turnos ese día.'
            : classes === 1
              ? 'Se sustituye 1 clase o turno (los festivos no cuentan).'
              : `Se sustituyen ${classes} clases y turnos (los festivos no cuentan).`}
      </p>
      <Actions
        onClose={onClose}
        disabled={!ready || (needsReason && reason.trim() === '')}
        busy={substitute.isPending}
      />
    </form>
  );
}

/** Una clase o un turno concreto de un día lo da otro profesor (casos especiales). */
function ClassSubstitutionForm({ date: initialDate, teachers, onClose }: FormProps) {
  const [date, setDate] = useState(initialDate);
  // «group:<id>» o «duty:<id>».
  const [target, setTarget] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState('');
  const groups = useGroups();
  const duties = useDuties();
  const plan = usePayrollMutation(planSubstitution);
  const toast = useToast();
  const year = new Date().getFullYear();
  const weekday = weekdayOf(date);
  const options = [
    ...(groups.data ?? [])
      .filter((g) => weekday !== null && g.days.includes(weekday))
      .map((g) => ({
        value: `group:${g.id}`,
        start: g.start,
        label: `${g.start}–${g.end} · ${g.name} · ${g.teacher.fullName}`,
        ownerId: g.teacher.id,
      })),
    ...(duties.data ?? [])
      .filter((d) => d.weekday === isoWeekdayOf(date))
      .map((d) => ({
        value: `duty:${d.id}`,
        start: d.start,
        label: `${d.start}–${d.end} · ${d.label} · ${d.teacherName}`,
        ownerId: d.teacherId,
      })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const chosen = options.find((o) => o.value === target);
  const candidates = teachers.filter((t) => t.active && t.id !== chosen?.ownerId);
  const needsReason = isReasonRequired(plan.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen || !teacherId) return;
    const [kind, id = ''] = chosen.value.split(':');
    const input = {
      groupId: kind === 'group' ? id : null,
      dutyId: kind === 'duty' ? id : null,
      date,
      teacherId,
      reason: reason.trim() || null,
    };
    void plan.mutateAsync(input).then(
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
          setTarget('');
        }}
        fromYear={year - 1}
        toYear={year + 1}
      />
      <Select
        label="Clase o turno"
        options={[
          {
            value: '',
            label: options.length === 0 ? 'Ese día no hay clases' : 'Elige la clase o el turno',
          },
          ...options.map((o) => ({ value: o.value, label: o.label })),
        ]}
        value={target}
        onChange={(value) => {
          setTarget(value);
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
        disabled={!chosen}
      />
      <ReasonField needsReason={needsReason} value={reason} onChange={setReason} />
      <p className="text-[13px] text-ink-muted">
        Ese día la sesión se apuntará sola a quien sustituye. Si ya tiene clase o turno a esa hora,
        es un caso especial: da las dos a la vez y no suma horas dobles.
      </p>
      <Actions
        onClose={onClose}
        disabled={!chosen || !teacherId || (needsReason && reason.trim() === '')}
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
