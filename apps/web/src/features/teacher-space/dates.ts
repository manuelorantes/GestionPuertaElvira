import { todayIso } from '@/features/students/format';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** Lunes y domingo de la semana de un día. */
export function weekOf(iso: string = todayIso()): { from: string; to: string } {
  const offset = (fromIso(iso).getDay() + 6) % 7;
  const from = addDays(iso, -offset);
  return { from, to: addDays(from, 6) };
}

/** «Lunes 12/10». */
export function dayLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${DAYS[fromIso(iso).getDay()] ?? ''} ${day}/${month}`;
}
