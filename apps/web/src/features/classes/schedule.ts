import type { ClassGroup, Weekday } from './api';

export const WEEKDAYS: { id: Weekday; short: string; long: string }[] = [
  { id: 'mon', short: 'Lun', long: 'Lunes' },
  { id: 'tue', short: 'Mar', long: 'Martes' },
  { id: 'wed', short: 'Mié', long: 'Miércoles' },
  { id: 'thu', short: 'Jue', long: 'Jueves' },
  { id: 'fri', short: 'Vie', long: 'Viernes' },
];

const OPENING = 16 * 60;
const CLOSING = 21 * 60;
export const HALF_HOUR_ROWS = (CLOSING - OPENING) / 30;

export function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Horas en medias horas entre `from` y `to`, ambas incluidas. */
export function halfHours(from: string, to: string): string[] {
  const times: string[] = [];
  for (let minutes = toMinutes(from); minutes <= toMinutes(to); minutes += 30)
    times.push(fromMinutes(minutes));
  return times;
}

export const HOUR_MARKS = ['16:00', '17:00', '18:00', '19:00', '20:00'];

/** Filas (1-based, fin exclusivo) del bloque en la rejilla de medias horas. */
export function gridRows(start: string, end: string): { rowStart: number; rowEnd: number } {
  return {
    rowStart: (toMinutes(start) - OPENING) / 30 + 1,
    rowEnd: (toMinutes(end) - OPENING) / 30 + 1,
  };
}

export function groupsOn(day: Weekday, groups: ClassGroup[]): ClassGroup[] {
  return groups.filter((group) => group.days.includes(day));
}

export function weeklyHours(days: number, start: string, end: string): number {
  return Math.max(0, ((toMinutes(end) - toMinutes(start)) / 60) * days);
}

export function formatHours(hours: number): string {
  return `${String(hours).replace('.', ',')} h semanales`;
}

/** «Lun y Mié · 17:00–18:00»: días y franja de un horario especial. */
export function attendanceText(attendance: {
  days: Weekday[];
  start: string;
  end: string;
}): string {
  const days = WEEKDAYS.filter((d) => attendance.days.includes(d.id)).map((d) => d.short);
  const list =
    days.length > 1 ? `${days.slice(0, -1).join(', ')} y ${days.at(-1)}` : (days[0] ?? '');
  return `${list} · ${attendance.start}–${attendance.end}`;
}
