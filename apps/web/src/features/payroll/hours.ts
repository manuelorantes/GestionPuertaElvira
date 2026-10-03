/** 90 → «1,5 h». */
export function hoursLabel(minutes: number): string {
  return `${String(Math.round((minutes / 60) * 100) / 100).replace('.', ',')} h`;
}
