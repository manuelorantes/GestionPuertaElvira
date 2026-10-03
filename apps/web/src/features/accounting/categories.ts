export type EntryKind = 'income' | 'expense';

export const CATEGORIES: Record<EntryKind, { value: string; label: string }[]> = {
  expense: [
    { value: 'teachers', label: 'Profesores' },
    { value: 'rent', label: 'Alquiler' },
    { value: 'material', label: 'Material' },
    { value: 'federation', label: 'Federación' },
    { value: 'tournaments', label: 'Torneos' },
    { value: 'utilities', label: 'Suministros' },
    { value: 'other_expenses', label: 'Otros gastos' },
  ],
  income: [
    { value: 'fees', label: 'Cuotas' },
    { value: 'membership', label: 'Cuota de socio' },
    { value: 'grants', label: 'Subvenciones' },
    { value: 'tournament_income', label: 'Torneos' },
    { value: 'other_income', label: 'Otros ingresos' },
  ],
};

export const METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
];

const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Mismo criterio que la API: PDF o foto de hasta 10 MB. */
export function documentProblem(file: File): string | null {
  if (!DOCUMENT_TYPES.includes(file.type))
    return 'El documento debe ser un PDF o una foto (JPG, PNG o WEBP).';
  if (file.size > MAX_DOCUMENT_BYTES) return 'El documento no puede superar los 10 MB.';
  return null;
}

/** Temporada contable (septiembre a agosto) que contiene el mes. */
export function fiscalYearOf(month: string): number {
  const [year = 1970, number = 1] = month.split('-').map(Number);
  return number >= 9 ? year : year - 1;
}

export function fiscalYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}
