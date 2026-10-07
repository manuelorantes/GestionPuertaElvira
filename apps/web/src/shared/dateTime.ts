const MADRID = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fecha y hora del club (Madrid), sea cual sea la zona del navegador: «07/10/2026 08:40». */
export function madridDateTime(iso: string): string {
  return MADRID.format(new Date(iso)).replace(',', '');
}
