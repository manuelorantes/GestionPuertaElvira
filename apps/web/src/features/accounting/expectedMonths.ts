/** Meses del año en el orden de la temporada, de septiembre a agosto. */
export const SEASON_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
/** Por defecto, un gasto esperado se espera de septiembre a junio. */
export const DEFAULT_MONTHS = SEASON_ORDER.slice(0, 10);

const NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const monthOfYearName = (month: number): string => NAMES[month - 1] ?? '';

/** «Todo el año», «De septiembre a junio» o «Septiembre, octubre y junio». */
export function expectedMonthsLabel(months: number[]): string {
  const sorted = SEASON_ORDER.filter((m) => months.includes(m));
  if (sorted.length === 12) return 'Todo el año';
  const first = SEASON_ORDER.indexOf(sorted[0] ?? 0);
  const consecutive = sorted.every((m, i) => SEASON_ORDER[first + i] === m);
  const text =
    consecutive && sorted.length > 2
      ? `de ${monthOfYearName(sorted[0] ?? 0)} a ${monthOfYearName(sorted.at(-1) ?? 0)}`
      : sorted.length > 1
        ? `${sorted.slice(0, -1).map(monthOfYearName).join(', ')} y ${monthOfYearName(sorted.at(-1) ?? 0)}`
        : monthOfYearName(sorted[0] ?? 0);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
