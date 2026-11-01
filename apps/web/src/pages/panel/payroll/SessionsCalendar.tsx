import { monthLabel } from '@/features/billing/money';
import { LEVELS } from '@/features/classes/levels';
import type { Session, UpcomingSession } from '@/features/payroll/api';
import { monthWeeks } from '@/features/payroll/calendar';
import { hoursLabel } from '@/features/payroll/hours';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Quien mira el calendario: administración (la ficha del profesor) o el propio profesor (Mis horas). */
export type CalendarViewer = 'staff' | 'teacher';

/**
 * Sus clases, con el verde de intermedio; las sustituciones que dio, con el negro de avanzado. Lo que aún le queda por
 * dar, en los tonos claros de lo previsto (como en la gráfica de cuotas y gastos): el verde de iniciación y el gris.
 */
const KINDS = {
  own: { className: LEVELS.intermediate.className },
  substitution: { className: LEVELS.advanced.className },
  upcomingOwn: { className: LEVELS.beginner.className },
  upcomingSubstitution: { className: 'bg-ink-muted text-paper border-ink-muted' },
} as const;
type Kind = keyof typeof KINDS;
const UPCOMING_KINDS: readonly Kind[] = ['upcomingOwn', 'upcomingSubstitution'];

const WORDING: Record<CalendarViewer, Record<Kind, { legend: string; suffix: string }>> = {
  staff: {
    own: { legend: 'Sus clases', suffix: 'de sus clases' },
    substitution: { legend: 'Sustituciones', suffix: 'de sustitución' },
    upcomingOwn: { legend: 'Sus clases previstas', suffix: 'previstas de sus clases' },
    upcomingSubstitution: { legend: 'Sustituciones previstas', suffix: 'previstas de sustitución' },
  },
  teacher: {
    own: { legend: 'Mis clases', suffix: 'de mis clases' },
    substitution: { legend: 'Sustituciones', suffix: 'de sustitución' },
    upcomingOwn: { legend: 'Mis clases previstas', suffix: 'previstas de mis clases' },
    upcomingSubstitution: { legend: 'Sustituciones previstas', suffix: 'previstas de sustitución' },
  },
};

/** Lo que el calendario necesita de cada sesión. */
type CalendarSession = Pick<Session, 'date' | 'substitution' | 'countedMinutes'>;

type DayMinutes = Record<Kind, number>;

/**
 * Lo que cuenta de cada sesión, sumado por día y por si la dio como suya o sustituyendo; y aparte, lo que aún le
 * queda por dar, también sin contar dos veces lo que se pisa.
 */
function minutesByDay(
  sessions: CalendarSession[],
  upcoming: UpcomingSession[],
): Map<string, DayMinutes> {
  const byDay = new Map<string, DayMinutes>();
  const add = (date: string, kind: Kind, minutes: number) => {
    const day = byDay.get(date) ?? {
      own: 0,
      substitution: 0,
      upcomingOwn: 0,
      upcomingSubstitution: 0,
    };
    day[kind] += minutes;
    byDay.set(date, day);
  };
  for (const s of sessions) add(s.date, s.substitution ? 'substitution' : 'own', s.countedMinutes);
  for (const u of upcoming) {
    add(u.date, u.substitution ? 'upcomingSubstitution' : 'upcomingOwn', u.countedMinutes);
  }
  return byDay;
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/**
 * Calendario del mes con las horas que dio cada día y, en tonos claros, las que aún le quedan por dar según el
 * horario. Las clases en las que le sustituyeron no están entre sus sesiones, así que ese día sale vacío. Sábado y
 * domingo solo aparecen si ese mes tiene algo en fin de semana.
 */
export function SessionsCalendar({
  month,
  sessions,
  upcoming = [],
  viewer = 'staff',
}: {
  month: string;
  sessions: CalendarSession[];
  upcoming?: UpcomingSession[];
  viewer?: CalendarViewer;
}) {
  const byDay = minutesByDay(sessions, upcoming);
  const wording = WORDING[viewer];
  const weekLength = [...sessions, ...upcoming].some((s) => isWeekend(s.date)) ? 7 : 5;
  // Lo previsto solo sale en la leyenda cuando el mes tiene algo por dar.
  const legend = (Object.keys(KINDS) as Kind[]).filter(
    (kind) => !UPCOMING_KINDS.includes(kind) || upcoming.length > 0,
  );
  return (
    <div className="px-5 pt-4">
      <table className="w-full table-fixed border border-line-soft text-left text-sm">
        <caption className="sr-only">
          Calendario de clases de {monthLabel(month).toLowerCase()}
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
                  {date && <CalendarDay date={date} minutes={byDay.get(date)} wording={wording} />}
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
        {legend.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-3 rounded-sm border ${KINDS[kind].className}`} />
            {wording[kind].legend}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarDay({
  date,
  minutes,
  wording,
}: {
  date: string;
  minutes: DayMinutes | undefined;
  wording: (typeof WORDING)[CalendarViewer];
}) {
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
          {hoursLabel(minutes?.[kind] ?? 0)} <span className="sr-only">{wording[kind].suffix}</span>
        </span>
      ))}
    </div>
  );
}
