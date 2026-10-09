import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import type { Teacher } from '@/features/classes/api';
import { deleteDuty, saveDuty, type Duty } from '@/features/payroll/api';
import { useDuties, usePayrollMutation } from '@/features/payroll/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { TeacherLink } from './TeacherLink';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Medias horas de 09:00 a 22:00. */
const TIMES = Array.from({ length: 27 }, (_, i) => {
  const minutes = 9 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const ROW_ACTION =
  'flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted';

const KINDS = [
  { value: 'shift', label: 'Turno (el encargado confirma «Turno hecho»)' },
  { value: 'fridays', label: 'Viernes (el encargado pasa la lista de los viernes de los puntos)' },
];
const KIND_LABEL: Record<Duty['kind'], string> = { shift: 'Turno', fridays: 'Viernes (puntos)' };

/**
 * Actividades del club con un encargado fijo semanal: cuentan como horas cada semana. Si mientras tanto da una clase,
 * esas horas no se suman dos veces. Su encargado las confirma («Turno hecho» o, la de los viernes, pasando la lista).
 */
export function DutiesTab({ teachers }: { teachers: Teacher[] }) {
  const duties = useDuties();
  const [editing, setEditing] = useState<Duty | 'new' | null>(null);
  const [removing, setRemoving] = useState<Duty | null>(null);
  const remove = usePayrollMutation(deleteDuty);
  const toast = useToast();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-muted">
          Cada semana, el día y la franja de cada actividad se apuntan solos como horas de su
          encargado, que la confirma desde su espacio: «Turno hecho» o, en la de los viernes,
          marcando quién viene. Si no la confirma, sale en «Listas sin pasar». Si tiene clase a la
          vez, las horas no se suman dos veces.
        </p>
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden size={16} />
          Nueva actividad
        </Button>
      </div>
      {duties.isError && <Alert>{apiErrorMessage(duties.error)}</Alert>}
      <Card className="overflow-x-auto">
        {(duties.data ?? []).length === 0 ? (
          <p className="px-5 py-10 text-center text-ink-muted">Todavía no hay actividades.</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Actividades del club</caption>
            <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              <tr>
                {['Día', 'Franja', 'Actividad', 'Tipo', 'Encargado'].map((h) => (
                  <th key={h} scope="col" className="px-5 py-3 font-semibold">
                    {h}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(duties.data ?? []).map((d) => (
                <tr key={d.id} className="border-b border-line-soft last:border-b-0">
                  <td className="px-5 py-3 font-medium">{DAYS[d.weekday - 1]}</td>
                  <td className="px-5 py-3">
                    {d.start}–{d.end}
                  </td>
                  <td className="px-5 py-3">{d.label}</td>
                  <td className="px-5 py-3 text-ink-muted">{KIND_LABEL[d.kind]}</td>
                  <td className="px-5 py-3">
                    <TeacherLink id={d.teacherId} name={d.teacherName} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Editar la actividad del ${DAYS[d.weekday - 1]?.toLowerCase()}`}
                        onClick={() => setEditing(d)}
                        className={ROW_ACTION}
                      >
                        <Pencil aria-hidden size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar la actividad del ${DAYS[d.weekday - 1]?.toLowerCase()}`}
                        onClick={() => setRemoving(d)}
                        className={ROW_ACTION}
                      >
                        <Trash2 aria-hidden size={15} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <DutyDialog
          duty={editing === 'new' ? null : editing}
          teachers={teachers}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Quitar turno"
          message={`Se quitará la actividad ${removing.label.toLowerCase()} del ${DAYS[removing.weekday - 1]?.toLowerCase()} (${removing.start}–${removing.end}). Las horas ya apuntadas no cambian.`}
          confirmLabel="Quitar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            void remove.mutateAsync(removing.id).then(
              () => {
                toast('Turno quitado');
                setRemoving(null);
              },
              () => undefined,
            )
          }
        />
      )}
    </div>
  );
}

function DutyDialog({
  duty,
  teachers,
  onClose,
}: {
  duty: Duty | null;
  teachers: Teacher[];
  onClose: () => void;
}) {
  const [teacherId, setTeacherId] = useState(duty?.teacherId ?? '');
  const [weekday, setWeekday] = useState(String(duty?.weekday ?? 5));
  const [start, setStart] = useState(duty?.start ?? '17:00');
  const [end, setEnd] = useState(duty?.end ?? '20:00');
  const [label, setLabel] = useState(duty?.label ?? 'Encargado del club');
  const [kind, setKind] = useState<Duty['kind']>(duty?.kind ?? 'shift');
  const save = usePayrollMutation(saveDuty);
  const toast = useToast();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!teacherId) return;
    void save
      .mutateAsync({
        id: duty?.id ?? null,
        duty: {
          teacherId,
          weekday: Number(weekday),
          start,
          end,
          label: label.trim() || null,
          kind,
        },
      })
      .then(
        () => {
          toast(duty ? 'Actividad cambiada' : 'Actividad creada');
          onClose();
        },
        () => undefined,
      );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="duty-title">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 id="duty-title" className="font-display text-2xl font-bold tracking-[0.04em] uppercase">
          {duty ? 'Editar actividad' : 'Nueva actividad'}
        </h2>
        {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
        <TextField label="Actividad" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Select
          label="Tipo"
          options={KINDS}
          value={kind}
          onChange={(value) => {
            setKind(value as Duty['kind']);
            if (value === 'fridays' && label === 'Encargado del club') setLabel('Viernes');
          }}
        />
        <Select
          label="Día"
          options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))}
          value={weekday}
          onChange={setWeekday}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Empieza"
            options={TIMES.map((t) => ({ value: t, label: t }))}
            value={start}
            onChange={setStart}
          />
          <Select
            label="Termina"
            options={TIMES.map((t) => ({ value: t, label: t }))}
            value={end}
            onChange={setEnd}
          />
        </div>
        <Select
          label="Profesor"
          options={[
            { value: '', label: 'Elige quién' },
            ...teachers.filter((t) => t.active).map((t) => ({ value: t.id, label: t.fullName })),
          ]}
          value={teacherId}
          onChange={setTeacherId}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!teacherId} busy={save.isPending} busyLabel="Guardando…">
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
