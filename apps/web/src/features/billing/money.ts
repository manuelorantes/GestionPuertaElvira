import { fiscalYearOf } from '@/features/accounting/categories';

const euros = (digits: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const WHOLE = euros(0);
const DECIMAL = euros(2);

const MONTHS = [
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

/** 4500 → «45 €»; 4050 → «40,50 €»; −1125 → «−11,25 €» (signo menos tipográfico). */
export function formatCents(cents: number): string {
  return (cents % 100 === 0 ? WHOLE : DECIMAL)
    .format(cents / 100)
    .replace(/\s/g, ' ')
    .replace('-', '−');
}

function parts(month: string): [number, number] {
  const [year, number] = month.split('-').map(Number);
  return [year ?? 1970, number ?? 1];
}

/** «2026-10» → «octubre». */
export function monthName(month: string): string {
  return MONTHS[parts(month)[1] - 1] ?? month;
}

/** «2026-10» → «Octubre 2026». */
export function monthLabel(month: string): string {
  const name = monthName(month);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${parts(month)[0]}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, number] = parts(month);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function reminderText(charge: {
  guardianName: string;
  studentName: string;
  period: string;
  amountCents: number;
}): string {
  const first = (name: string) => name.split(' ')[0] ?? name;
  return `Hola ${first(charge.guardianName)}, te escribimos del Club Ajedrez Puerta Elvira. Nos consta pendiente la cuota de ${monthName(charge.period)} de ${first(charge.studentName)} (${formatCents(charge.amountCents)}). Puedes pagarla por transferencia o en efectivo en el club. ¡Gracias!`;
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/34${phone.replace(/\s/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Meses de clase de la temporada de `month` (de septiembre a junio). */
export function seasonMonths(month: string): string[] {
  const start = fiscalYearOf(month);
  return [9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map(
    (m) => `${m >= 9 ? start : start + 1}-${String(m).padStart(2, '0')}`,
  );
}

/** «40,50» o «40.5» → 4050; null si no es un importe válido (hasta dos decimales, sin signo). */
export function centsFromText(value: string): number | null {
  const normalised = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  return Math.round(Number(normalised) * 100);
}

/** 4050 → «40,50»; 4500 → «45» (para rellenar un campo de importe). */
export function centsToText(cents: number): string {
  return (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)).replace('.', ',');
}
