import { CalendarOff, Plus, Trash2, UserRoundCog } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { fiscalYearLabel, fiscalYearOf } from '@/features/accounting/categories';
import { monthLabel } from '@/features/billing/money';
import type { Teacher } from '@/features/classes/api';
import {
  cancelSubstitution,
  removeHoliday,
  type Holiday,
  type Substitution,
} from '@/features/payroll/api';
import { useHolidays, usePayrollMutation, useSubstitutions } from '@/features/payroll/hooks';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';

import { HolidayDialog } from './HolidayDialog';
import { SubstitutionDialog } from './SubstitutionDialog';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

/** Semanas (de lunes a viernes) del mes: cada día como «AAAA-MM-DD» o null fuera del mes. */
function weeks(month: string): (string | null)[][] {
  const [year = 2000, number = 1] = month.split('-').map(Number);
  const days = new Date(year, number, 0).getDate();
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [null, null, null, null, null];
  for (let day = 1; day <= days; day++) {
    const weekday = (new Date(year, number - 1, day).getDay() + 6) % 7; // 0 = lunes
    if (weekday > 4) continue;
    row[weekday] = `${month}-${String(day).padStart(2, '0')}`;
    if (weekday === 4) {
      rows.push(row);
      row = [null, null, null, null, null];
    }
  }
  if (row.some((d) => d !== null)) rows.push(row);
  return rows;
}

/** Calendario de sustituciones planificadas y festivos (sin horas automáticas). */
export function SubstitutionsTab({ month, teachers }: { month: string; teachers: Teacher[] }) {
  const season = fiscalYearOf(month);
  const substitutions = useSubstitutions(month);
  const holidays = useHolidays(season);
  const [planning, setPlanning] = useState<string | null>(null);
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [cancelling, setCancelling] = useState<Substitution | null>(null);
  const [removing, setRemoving] = useState<Holiday | null>(null);
  const cancel = usePayrollMutation(cancelSubstitution);
  const remove = usePayrollMutation(removeHoliday);
  const toast = useToast();
  const byDate = new Map<string, Substitution[]>();
  for (const s of substitutions.data ?? []) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const holidayOn = new Map((holidays.data ?? []).map((h) => [h.date, h.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Las horas se apuntan solas al acabar cada clase, para quien la dé ese día. Los festivos no
          cuentan.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setAddingHoliday(true)}>
            <CalendarOff aria-hidden size={16} />
            Añadir festivo
          </Button>
          <Button onClick={() => setPlanning('')}>
            <Plus aria-hidden size={16} />
            Nueva sustitución
          </Button>
        </div>
      </div>
      {substitutions.isError && <Alert>{apiErrorMessage(substitutions.error)}</Alert>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-left text-sm">
          <caption className="sr-only">Sustituciones de {monthLabel(month).toLowerCase()}</caption>
          <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="px-3 py-3 font-semibold">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks(month).map((week, index) => (
              <tr key={index} className="border-b border-line-soft align-top last:border-b-0">
                {week.map((date, i) => (
                  <td
                    key={date ?? `vacío-${i}`}
                    className="h-24 border-r border-line-soft p-2 last:border-r-0"
                  >
                    {date && (
                      <div className="flex h-full flex-col gap-1">
                        <span className="flex items-center justify-between text-[13px] text-ink-muted">
                          {Number(date.slice(8))}
                          <button
                            type="button"
                            aria-label={`Nueva sustitución el ${formatDate(date)}`}
                            onClick={() => setPlanning(date)}
                            className="flex size-6 cursor-pointer items-center justify-center rounded-sm opacity-60 hover:bg-surface-muted hover:opacity-100"
                          >
                            <Plus aria-hidden size={13} />
                          </button>
                        </span>
                        {holidayOn.has(date) && (
                          <span className="rounded-sm bg-danger-bg px-1.5 py-0.5 text-[12px] font-medium text-danger-fg">
                            Festivo · {holidayOn.get(date)}
                          </span>
                        )}
                        {(byDate.get(date) ?? []).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setCancelling(s)}
                            title={s.reason ?? undefined}
                            className="cursor-pointer rounded-sm bg-brand-soft px-1.5 py-1 text-left text-[12px] leading-tight text-brand-strong hover:ring-1 hover:ring-brand"
                          >
                            <span className="block font-semibold">
                              {s.start} · {s.groupName}
                            </span>
                            <span className="block">
                              <UserRoundCog aria-hidden size={11} className="mr-1 inline" />
                              {s.substituteName} por {s.teacherName}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-display text-xl font-semibold tracking-[0.04em] uppercase">
          Festivos {fiscalYearLabel(season)}
        </h2>
        {(holidays.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">No hay festivos apuntados esta temporada.</p>
        ) : (
          <ul aria-label="Festivos de la temporada" className="grid gap-x-6 sm:grid-cols-2">
            {(holidays.data ?? []).map((h) => (
              <li
                key={h.date}
                className="flex items-center gap-2 border-b border-line-soft py-1.5 text-sm"
              >
                <span className="w-24 shrink-0 text-ink-muted">{formatDate(h.date)}</span>
                <span className="flex-1">{h.name}</span>
                <button
                  type="button"
                  aria-label={`Quitar el festivo ${h.name}`}
                  onClick={() => setRemoving(h)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {planning !== null && (
        <SubstitutionDialog date={planning} teachers={teachers} onClose={() => setPlanning(null)} />
      )}
      {addingHoliday && <HolidayDialog onClose={() => setAddingHoliday(false)} />}
      {cancelling && (
        <ConfirmDialog
          title="Anular sustitución"
          message={`${cancelling.substituteName} ya no sustituirá a ${cancelling.teacherName} en «${cancelling.groupName}» el ${formatDate(cancelling.date)}.${cancelling.reason ? ` Motivo: ${cancelling.reason}.` : ''}`}
          confirmLabel="Anular"
          busy={cancel.isPending}
          error={cancel.isError ? apiErrorMessage(cancel.error) : null}
          onCancel={() => {
            cancel.reset();
            setCancelling(null);
          }}
          onConfirm={() =>
            void cancel.mutateAsync(cancelling.id).then(
              () => {
                toast('Sustitución anulada');
                setCancelling(null);
              },
              () => undefined,
            )
          }
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Quitar festivo"
          message={`El ${formatDate(removing.date)} (${removing.name}) volverá a ser un día con clase: sus horas se apuntarán solas si aún no ha pasado.`}
          confirmLabel="Quitar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            void remove.mutateAsync(removing.date).then(
              () => {
                toast('Festivo quitado');
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
