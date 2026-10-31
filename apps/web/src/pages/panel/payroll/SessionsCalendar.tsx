import { monthLabel } from '@/features/billing/money';
import { LEVELS } from '@/features/classes/levels';
import type { Session } from '@/features/payroll/api';
import { monthWeeks } from '@/features/payroll/calendar';
import { hoursLabel } from '@/features/payroll/hours';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Sus clases, con el verde de intermedio; las sustituciones que dio, con el negro de avanzado. */
const KINDS = {
  own: { legend: 'Sus clases', suffix: 'de sus clases', className: LEVELS.intermediate.className },
  substitution: {
    legend: 'Sustituciones',
    suffix: 'de sustitución',
    className: LEVELS.advanced.className,
  },
} as const;
type Kind = keyof typeof KINDS;

type DayMinutes = Record<Kind, number>;

/** Lo que cuenta de cada sesión, sumado por día y por si la dio como suya o sustituyendo. */
function minutesByDay(sessions: Session[]): Map<string, DayMinutes> {
  const byDay = new Map<string, DayMinutes>();
  for (const s of sessions) {
    const day = byDay.get(s.date) ?? { own: 0, substitution: 0 };
    day[s.substitution ? 'substitution' : 'own'] += s.countedMinutes;
    byDay.set(s.date, day);
  }
  return byDay;
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/**
 * Calendario del mes con las horas que dio cada día. Las clases en las que le sustituyeron no están entre sus
 * sesiones, así que ese día sale vacío. Sábado y domingo solo aparecen si ese mes dio algo en fin de semana.
 */
export function SessionsCalendar({ month, sessions }: { month: string; sessions: Session[] }) {
  const byDay = minutesByDay(sessions);
  const weekLength = sessions.some((s) => isWeekend(s.date)) ? 7 : 5;
  return (
    <div className="px-5 pt-4">
      <table className="w-full table-fixed border border-line-soft text-left text-sm">
        <caption className="sr-only">
          Calendario de clases dadas en {monthLabel(month).toLowerCase()}
        </caption>
        <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {WEEKDAYS.slice(0, weekLength).map((d) => (
              <th key={d} scope="col" className="px-2 py-2 font-semibold">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month, weekLength).map((week, index) => (
            <tr key={index} className="border-b border-line-soft align-top last:border-b-0">
              {week.map((date, i) => (
                <td
                  key={date ?? `vacío-${i}`}
                  className="h-16 border-r border-line-soft p-1.5 last:border-r-0"
                >
                  {date && <CalendarDay date={date} minutes={byDay.get(date)} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul
        aria-label="Leyenda del calendario"
        className="mt-2 flex flex-wrap gap-4 text-[13px] text-ink-muted"
      >
        {Object.values(KINDS).map((k) => (
          <li key={k.legend} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-3 rounded-sm border ${k.className}`} />
            {k.legend}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarDay({ date, minutes }: { date: string; minutes: DayMinutes | undefined }) {
  const kinds = (Object.keys(KINDS) as Kind[]).filter((k) => (minutes?.[k] ?? 0) > 0);
  return (
    <div className="flex h-full flex-col gap-1">
      <span className="text-[13px] text-ink-muted">
        <span className="sr-only">Día</span> {Number(date.slice(8))}
        <span className="sr-only">:</span>
      </span>
      {kinds.map((kind) => (
        <span
          key={kind}
          data-kind={kind}
          className={`rounded-sm border px-1 py-0.5 text-[12px] leading-tight font-semibold whitespace-nowrap sm:px-1.5 ${KINDS[kind].className}`}
        >
          {hoursLabel(minutes?.[kind] ?? 0)} <span className="sr-only">{KINDS[kind].suffix}</span>
        </span>
      ))}
    </div>
  );
}
