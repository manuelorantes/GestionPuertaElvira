import { useState } from 'react';
import { Link } from 'react-router';

import type { AttendanceMark, GroupAttendance } from '@/features/attendance/api';
import { useGroupAttendance } from '@/features/attendance/hooks';
import { monthLabel } from '@/features/billing/money';
import { SortHeader } from '@/shared/ui/SortHeader';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const weekday = (iso: string) => WEEKDAYS[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];

const DAY_NOTE: Record<GroupAttendance['days'][number]['status'], string | null> = {
  taken: null,
  confirmed: 'Sin lista',
  pending: 'Sin lista',
  holiday: 'Festivo',
};

const MARK: Record<
  Exclude<AttendanceMark, null>,
  { symbol: string; label: string; className: string }
> = {
  present: { symbol: '✓', label: 'vino', className: 'font-semibold text-success-fg' },
  absent: { symbol: '✗', label: 'faltó', className: 'font-semibold text-danger-fg' },
  unknown: { symbol: '?', label: 'sin lista', className: 'text-ink-muted' },
};

type Student = GroupAttendance['students'][number];
type SortKey = 'name' | 'percent';

const percent = (s: Student) =>
  s.classes === 0 ? null : Math.round((s.attended / s.classes) * 100);

/**
 * Asistencia de un grupo en un mes: un alumno por fila, un día de clase por columna (✓ vino, ✗ faltó, ? sin lista,
 * vacío si ese día no le tocaba) y el porcentaje de las clases con lista. Se ordena por nombre o por porcentaje.
 */
export function GroupAttendanceTable({ groupId, month }: { groupId: string; month: string }) {
  const attendance = useGroupAttendance(groupId, month);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'name',
    descending: false,
  });
  const data = attendance.data;
  if (!data)
    return (
      <p className="text-sm text-ink-muted">
        {attendance.isError ? 'No se ha podido cargar la asistencia.' : 'Cargando asistencia…'}
      </p>
    );
  if (data.days.length === 0)
    return (
      <p className="text-sm text-ink-muted">
        En {monthLabel(month).toLowerCase()} aún no ha habido clases de este grupo.
      </p>
    );
  if (data.students.length === 0)
    return <p className="text-sm text-ink-muted">Nadie estaba inscrito esos días.</p>;

  const sorted = [...data.students].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'es');
    if (sort.key === 'name') return sort.descending ? -byName : byName;
    // Sin clases con lista, al final.
    const [pa, pb] = [percent(a), percent(b)];
    if (pa === null || pb === null) return pa === pb ? byName : pa === null ? 1 : -1;
    return (sort.descending ? pb - pa : pa - pb) || byName;
  });
  const header = (key: SortKey, label: string, name: string) => (
    <SortHeader
      label={label}
      name={name}
      active={sort.key === key}
      descending={sort.descending}
      onSort={() =>
        setSort((current) => ({
          key,
          descending: current.key === key ? !current.descending : key === 'percent',
        }))
      }
    />
  );

  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Asistencia de {data.name} en {monthLabel(month).toLowerCase()}
        </caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            <th scope="col" className="py-2 pr-3 font-semibold">
              {header('name', 'Alumno', 'alumno')}
            </th>
            {data.days.map((d) => (
              <th key={d.date} scope="col" className="px-2 py-2 text-center font-semibold">
                <span className="block text-[11px] font-normal tracking-normal normal-case">
                  {weekday(d.date)}
                </span>
                {dayMonth(d.date)}
                {DAY_NOTE[d.status] && (
                  <span className="block text-[11px] font-normal tracking-normal normal-case">
                    {DAY_NOTE[d.status]}
                  </span>
                )}
              </th>
            ))}
            <th scope="col" className="py-2 pl-3 text-right font-semibold">
              {header('percent', '%', 'porcentaje de asistencia')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const p = percent(s);
            return (
              <tr key={s.id} className="border-b border-line-soft last:border-b-0">
                <th scope="row" className="py-2 pr-3 font-medium">
                  <Link to={`/panel/alumnos/${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                </th>
                {s.marks.map((m, i) => {
                  const day = data.days[i];
                  return (
                    <td key={day?.date ?? i} className="px-2 py-2 text-center">
                      {m && (
                        <span
                          aria-label={`${s.name} ${MARK[m].label} el ${dayMonth(day?.date ?? '')}`}
                          title={MARK[m].label}
                          className={MARK[m].className}
                        >
                          {MARK[m].symbol}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td
                  className={`py-2 pl-3 text-right tabular-nums ${p !== null && p < 75 ? 'font-semibold text-danger-fg' : ''}`}
                  title={
                    p === null ? 'Sin clases con lista' : `Vino a ${s.attended} de ${s.classes}`
                  }
                >
                  {p === null ? '—' : `${p} %`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[13px] text-ink-muted">
        ✓ vino · ✗ faltó · ? sin lista pasada · en blanco, ese día no le tocaba. El porcentaje
        cuenta solo las clases con lista; por debajo del 75 % sale en rojo.
      </p>
    </div>
  );
}
