import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { currentMonth, monthLabel } from '@/features/billing/money';
import { SeasonMonths } from '@/features/billing/SeasonMonths';
import { hoursLabel } from '@/features/payroll/hours';
import { formatDate } from '@/features/students/format';
import type { TeacherSession, TeacherSubstitution } from '@/features/teacher-space/api';
import { dayLabel } from '@/features/teacher-space/dates';
import { useTeacherHours } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import { SessionsCalendar } from '../payroll/SessionsCalendar';

const TH = 'px-4 py-2.5 font-semibold';
const TD = 'px-4 py-2.5';

const sessionLabel = (s: TeacherSession) => (s.substitution ? `(Sustitución) ${s.label}` : s.label);

type SessionColumn = 'date' | 'label' | 'hours';
const SESSION_COLUMNS: Record<SessionColumn, SortColumn<TeacherSession>> = {
  date: { label: 'Fecha', name: 'fecha', value: (s) => s.date },
  label: { label: 'Clase o actividad', name: 'clase o actividad', value: sessionLabel },
  hours: { label: 'Horas', name: 'horas', value: (s) => s.minutes },
};

/** «Sustituiste a Carlos en Adultos I» o «Te sustituyó Ana en Iniciación A». */
const substitutionNote = (s: TeacherSubstitution) =>
  s.role === 'gave'
    ? `Sustituiste a ${s.otherName} en ${s.label}`
    : `Te sustituyó ${s.otherName} en ${s.label}`;

/** Lo que cuentan las sesiones del mes (como en la liquidación): de sus clases y de sustitución. */
function monthTotal(sessions: TeacherSession[]): { own: number; substitution: number } {
  return sessions.reduce(
    (sum, s) => ({
      own: sum.own + (s.substitution ? 0 : s.countedMinutes),
      substitution: sum.substitution + (s.substitution ? s.countedMinutes : 0),
    }),
    { own: 0, substitution: 0 },
  );
}

/**
 * Mis horas: las clases que he dado en un mes, en el mismo calendario que ve administración en mi ficha (mis clases en
 * verde, las sustituciones en negro; lo que aún me queda por dar, en sus tonos claros), los días en que sustituí a
 * alguien o me sustituyeron, y la lista de sesiones.
 */
export function TeacherHoursPage() {
  const [month, setMonth] = useState(currentMonth());
  const hours = useTeacherHours(month);
  const sessions = hours.data?.sessions ?? [];
  const substitutions = hours.data?.substitutions ?? [];
  const total = monthTotal(sessions);
  // De lo más reciente a lo más antiguo, salvo que se elija otra columna.
  const { header, apply } = useTableSort(SESSION_COLUMNS, { key: 'date', descending: true });
  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
        Mis horas
      </h1>
      <SeasonMonths month={month} selected={month} label="Mes" onChange={setMonth} />
      {hours.isPending ? (
        <p className="text-ink-muted">Cargando…</p>
      ) : hours.isError ? (
        <Alert>{apiErrorMessage(hours.error)}</Alert>
      ) : (
        <>
          <section aria-label="Total del mes" className="grid grid-cols-3 gap-3">
            {[
              [`Horas de ${monthLabel(month).toLowerCase()}`, total.own + total.substitution],
              ['De mis clases', total.own],
              ['De sustitución', total.substitution],
            ].map(([label, minutes], index) => (
              <Card key={label} className="px-4 py-3">
                <p className="text-[13px] text-ink-muted">{label}</p>
                <p className="font-display text-2xl font-bold">{hoursLabel(Number(minutes))}</p>
                {index === 0 && (
                  <p className="text-[13px] text-ink-muted">
                    {sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}
                  </p>
                )}
              </Card>
            ))}
          </section>
          <Card className="overflow-x-auto pb-4">
            <SessionsCalendar
              month={month}
              sessions={sessions}
              upcoming={hours.data?.upcoming ?? []}
              viewer="teacher"
            />
            {substitutions.length > 0 && (
              <div className="px-5 pt-4">
                <h2 className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                  Sustituciones
                </h2>
                <ul aria-label="Sustituciones del mes" className="mt-2 flex flex-col gap-1 text-sm">
                  {substitutions.map((s) => (
                    <li key={`${s.date}-${s.role}-${s.label}`}>
                      <span className="font-medium">{dayLabel(s.date)}</span> ·{' '}
                      {substitutionNote(s)}
                      {s.reason && <span className="text-ink-muted"> ({s.reason})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card className="overflow-x-auto">
            {sessions.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-ink-muted">
                Sin clases dadas en {monthLabel(month).toLowerCase()}.
              </p>
            ) : (
              <table className="w-full min-w-[480px] text-left text-sm">
                <caption className="sr-only">
                  Clases dadas en {monthLabel(month).toLowerCase()}
                </caption>
                <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
                  <tr>
                    {(Object.keys(SESSION_COLUMNS) as SessionColumn[]).map((key) => (
                      <th key={key} scope="col" className={TH}>
                        {header(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {apply(sessions).map((s) => (
                    <tr key={s.id} className="border-b border-line-soft last:border-b-0">
                      <td className={TD}>{formatDate(s.date)}</td>
                      <td className={TD}>{sessionLabel(s)}</td>
                      <td className={TD}>{hoursLabel(s.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
