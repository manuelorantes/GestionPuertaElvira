/**
 * Semanas del mes para un calendario que empieza en lunes: cada día como «AAAA-MM-DD» o null fuera del mes.
 * `weekLength` 5 deja solo de lunes a viernes; 7, la semana entera.
 */
export function monthWeeks(month: string, weekLength: 5 | 7): (string | null)[][] {
  const [year = 2000, number = 1] = month.split('-').map(Number);
  const days = new Date(year, number, 0).getDate();
  const emptyWeek = () => Array<string | null>(weekLength).fill(null);
  const rows: (string | null)[][] = [];
  let row = emptyWeek();
  for (let day = 1; day <= days; day++) {
    const weekday = (new Date(year, number - 1, day).getDay() + 6) % 7; // 0 = lunes
    if (weekday >= weekLength) continue;
    row[weekday] = `${month}-${String(day).padStart(2, '0')}`;
    if (weekday === weekLength - 1) {
      rows.push(row);
      row = emptyWeek();
    }
  }
  if (row.some((d) => d !== null)) rows.push(row);
  return rows;
}
