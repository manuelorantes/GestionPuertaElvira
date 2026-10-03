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

/** 4500 → «45 €»; 4050 → «40,50 €». */
export function formatCents(cents: number): string {
  return (cents % 100 === 0 ? WHOLE : DECIMAL).format(cents / 100).replace(/\s/g, ' ');
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
