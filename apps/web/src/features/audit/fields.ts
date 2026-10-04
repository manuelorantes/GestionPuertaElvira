import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';

/** Nombres legibles de las columnas más habituales; el resto se muestra tal cual. */
const LABELS: Record<string, string> = {
  full_name: 'Nombre',
  name: 'Nombre',
  concept: 'Concepto',
  category: 'Categoría',
  method: 'Forma de pago',
  kind: 'Tipo',
  period: 'Mes',
  month: 'Mes',
  label: 'Clase o actividad',
  supplier: 'Proveedor',
  number: 'Número',
  receipt_number: 'Recibo',
  invoice_number: 'Factura',
  status: 'Estado',
  active: 'Activo',
  member: 'Socio',
  points: 'Puntos',
  minutes: 'Minutos',
  capacity: 'Plazas',
  classroom: 'Aula',
  level: 'Nivel',
  days: 'Días',
  guardians: 'Tutores',
  preferred_plan: 'Forma de pago preferida',
  paid_by: 'Pagada con el cobro',
  paid_on: 'Pagado el',
  reminded_on: 'Avisado el',
  entry_date: 'Fecha',
  invoice_date: 'Fecha de la factura',
  session_date: 'Fecha',
  birth_date: 'Nacimiento',
  joined_on: 'Alta',
  withdrawn_on: 'Baja',
  enrolled_on: 'Inscrito el',
  ends_on: 'Hasta',
  last_value: 'Último número',
  role: 'Rol',
  email: 'Email',
};

export function fieldLabel(field: string): string {
  if (LABELS[field]) return LABELS[field];
  if (field.endsWith('_cents')) return fieldLabel(field.slice(0, -6)).replace(/_/g, ' ');
  return field.replace(/_/g, ' ');
}

/** Importes en euros, fechas en formato español, sí/no; el resto como texto. */
export function fieldValue(field: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (field.endsWith('_cents') && typeof raw === 'number') return formatCents(raw);
  if (typeof raw === 'boolean') return raw ? 'Sí' : 'No';
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDate(raw);
  if (typeof raw === 'string') return raw;
  return JSON.stringify(raw);
}
