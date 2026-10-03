import { CalendarX, Lock, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents, monthLabel } from '@/features/billing/money';
import type { Teacher } from '@/features/classes/api';
import { deleteSession, type Session } from '@/features/payroll/api';
import { usePayrollMutation, useSessions } from '@/features/payroll/hooks';
import { hoursLabel } from '@/features/payroll/hours';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Select } from '@/shared/ui/Select';
import { useToast } from '@/shared/ui/Toast';

import { HolidayDialog } from './HolidayDialog';
import { SessionDialog } from './SessionDialog';

const ICON_BUTTON =
  'flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted';

interface SessionsTabProps {
  month: string;
  teachers: Teacher[];
  teacherId: string;
  onTeacherChange: (id: string) => void;
}

export function SessionsTab({ month, teachers, teacherId, onTeacherChange }: SessionsTabProps) {
  const sessions = useSessions(month, teacherId);
  const [editing, setEditing] = useState<Session | null>(null);
  const [removing, setRemoving] = useState<Session | null>(null);
  const [holiday, setHoliday] = useState(false);
  const remove = usePayrollMutation(deleteSession);
  const toast = useToast();
  const items = sessions.data ?? [];
  const summer = ['07', '08'].includes(month.slice(5));

  function renderBody() {
    if (sessions.isPending) return <p className="p-5 text-ink-muted">Cargando sesiones…</p>;
    if (sessions.isError)
      return (
        <div className="p-5">
          <Alert>{apiErrorMessage(sessions.error)}</Alert>
        </div>
      );
    if (items.length === 0)
      return (
        <p className="px-5 py-12 text-center text-ink-muted">
          {summer ? 'En julio y agosto no hay clases.' : 'No hay sesiones registradas este mes.'}
        </p>
      );
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Sesiones de {monthLabel(month).toLowerCase()}</caption>
          <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {['Fecha', 'Profesor', 'Clase', 'Horas'].map((h) => (
                <th key={h} scope="col" className="px-5 py-3 font-semibold">
                  {h}
                </th>
              ))}
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Coste
              </th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-line-soft last:border-b-0">
                <td className="px-5 py-2.5 text-ink-muted">{formatDate(s.date)}</td>
                <td className="px-5 py-2.5 font-medium">{s.teacherName}</td>
                <td className="px-5 py-2.5">{s.label}</td>
                <td className="px-5 py-2.5">{hoursLabel(s.minutes)}</td>
                <td className="px-5 py-2.5 text-right font-medium">{formatCents(s.costCents)}</td>
                <td className="px-5 py-2.5">
                  {s.locked ? (
                    <span className="flex items-center justify-end gap-1 text-[13px] text-ink-muted">
                      <Lock aria-hidden size={14} />
                      Pagada
                    </span>
                  ) : (
                    <span className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label={`Editar sesión del ${formatDate(s.date)}`}
                        onClick={() => setEditing(s)}
                        className={ICON_BUTTON}
                      >
                        <Pencil aria-hidden size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar sesión del ${formatDate(s.date)}`}
                        onClick={() => setRemoving(s)}
                        className={ICON_BUTTON}
                      >
                        <Trash2 aria-hidden size={16} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const totalMinutes = items.reduce((sum, s) => sum + s.minutes, 0);
  const totalCost = items.reduce((sum, s) => sum + s.costCents, 0);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Select
            label="Profesor"
            value={teacherId}
            onChange={onTeacherChange}
            options={[
              { value: '', label: 'Todos' },
              ...teachers.map((t) => ({ value: t.id, label: t.fullName })),
            ]}
          />
        </div>
        <p className="flex-1 text-sm text-ink-muted">
          {items.length} sesiones · {hoursLabel(totalMinutes)} · {formatCents(totalCost)}
        </p>
        <Button variant="secondary" onClick={() => setHoliday(true)} className="shrink-0">
          <CalendarX aria-hidden size={18} />
          Marcar festivo
        </Button>
      </div>
      {renderBody()}
      {editing && (
        <SessionDialog session={editing} teachers={teachers} onClose={() => setEditing(null)} />
      )}
      {holiday && <HolidayDialog onClose={() => setHoliday(false)} />}
      {removing && (
        <ConfirmDialog
          title="Quitar sesión"
          message={`Se quitará la sesión de ${removing.label} del ${formatDate(removing.date)} (${removing.teacherName}).`}
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
                toast('Sesión quitada');
                setRemoving(null);
              },
              () => undefined,
            )
          }
        />
      )}
    </Card>
  );
}
