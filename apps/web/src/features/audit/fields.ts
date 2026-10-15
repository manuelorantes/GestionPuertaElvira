import { formatCents, monthLabel } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { madridDateTime } from '@/shared/dateTime';

import type { AuditReference } from './api';
import { targetLink } from './targets';

/** Nombres legibles de las columnas; el resto se muestra tal cual (con espacios). */
const LABELS: Record<string, string> = {
  full_name: 'Nombre',
  name: 'Nombre',
  email: 'Email',
  contact_email: 'Email de contacto',
  national_id: 'DNI',
  own_phone: 'Teléfono propio',
  federation_licence: 'Licencia federativa',
  image_consent: 'Consentimiento de imagen',
  member_number: 'Número de socio',
  sibling_ids: 'Familia directa',
  birth_date: 'Nacimiento',
  joined_on: 'Alta',
  withdrawn_on: 'Baja',
  guardians: 'Tutores',
  student_id: 'Alumno',
  teacher_id: 'Profesor',
  group_id: 'Grupo',
  class_group_id: 'Grupo',
  user_id: 'Cuenta',
  taken_by_teacher: 'Pasada por',
  taken_by_user: 'Pasada por la cuenta',
  written_by_teacher: 'Escrito por',
  written_by_user: 'Escrito por la cuenta',
  created_by: 'Hecho por',
  paid_by: 'Pagada con el cobro',
  payment_id: 'Cobro',
  charge_id: 'Cuota',
  product_id: 'Producto',
  duty_id: 'Turno',
  concept: 'Concepto',
  category: 'Categoría',
  method: 'Forma de pago',
  kind: 'Tipo',
  period: 'Mes',
  periods: 'Meses',
  month: 'Mes',
  lines: 'Conceptos',
  invoice: 'Datos de la factura',
  label: 'Clase o actividad',
  supplier: 'Proveedor',
  number: 'Número',
  receipt_number: 'Recibo',
  invoice_number: 'Factura',
  status: 'Estado',
  active: 'Activo',
  member: 'Socio',
  preferred_plan: 'Forma de pago preferida',
  points: 'Puntos',
  delta: 'Puntos',
  reference: 'Referencia',
  note: 'Nota',
  body: 'Comentario',
  reason: 'Motivo',
  minutes: 'Tiempo',
  start_minutes: 'Empieza',
  end_minutes: 'Termina',
  attendance_days: 'Días de asistencia',
  attendance_start_minutes: 'Asiste desde',
  attendance_end_minutes: 'Asiste hasta',
  from_schedule: 'Del horario',
  source: 'Origen',
  weekday: 'Día de la semana',
  capacity: 'Plazas',
  classroom: 'Aula',
  level: 'Nivel',
  days: 'Días',
  paid_on: 'Pagado el',
  reminded_on: 'Avisado el',
  cancelled_on: 'Cancelada el',
  manual: 'Fijada a mano',
  base_cents: 'Importe antes de fijarla a mano',
  discount_percent: 'Descuento',
  entry_date: 'Fecha',
  invoice_date: 'Fecha de la factura',
  session_date: 'Fecha',
  substitution_date: 'Fecha',
  holiday_date: 'Fecha',
  roll_date: 'Fecha',
  class_date: 'Fecha',
  check_date: 'Fecha',
  movement_date: 'Fecha',
  taken_on: 'Fecha',
  bought_on: 'Fecha de compra',
  created_on: 'Apuntado el',
  ordered_on: 'Pedido el',
  delivered_on: 'Entregado el',
  closed_on: 'Cerrado el',
  enrolled_on: 'Inscrito el',
  ends_on: 'Hasta',
  returned_to_stock: 'Devuelto al stock',
  quantity: 'Cantidad',
  variant_label: 'Variante',
  detail: 'Detalle',
  fields: 'Opciones',
  data: 'Ajustes',
  last_value: 'Último número',
  prefix: 'Prefijo',
  season_year: 'Temporada',
  start_year: 'Temporada',
  role: 'Rol',
  must_change_password: 'Debe cambiar la contraseña',
  attachment_name: 'Documento',
  attachment_type: 'Tipo de documento',
  attachment_bytes: 'Tamaño del documento',
  mime_type: 'Tipo de imagen',
  total: 'Total',
  credit: 'Aplicado a cuotas',
  amount: 'Importe',
  price: 'Precio',
  cost: 'Coste',
  rate: 'Tarifa por hora',
  hourly_rate: 'Tarifa por hora',
  private_rate: 'Tarifa de particular',
  kept: 'Se mantiene',
  income: 'Ingresos',
  expense: 'Gastos',
};

/** Columnas cuyo nombre depende de la tabla. */
const TABLE_LABELS: Record<string, string> = {
  'accounting_category.label': 'Nombre',
  'payroll_duty.label': 'Nombre',
  'equipment_order.note': 'Nota',
};

export function fieldLabel(field: string, table = ''): string {
  if (TABLE_LABELS[`${table}.${field}`]) return TABLE_LABELS[`${table}.${field}`] ?? field;
  if (LABELS[field]) return LABELS[field];
  if (field.endsWith('_cents')) return fieldLabel(field.slice(0, -6), table);
  return field.replace(/_/g, ' ');
}

const CATEGORIES: Record<string, string> = {
  teachers: 'Profesores',
  rent: 'Alquiler',
  material: 'Material',
  federation: 'Federación',
  tournaments: 'Torneos',
  utilities: 'Suministros',
  president: 'Presidente',
  cleaning: 'Limpieza',
  water: 'Agua',
  electricity: 'Electricidad',
  internet: 'Wifi',
  other_expenses: 'Otros gastos',
  fees: 'Cuotas',
  membership: 'Cuota de socio',
  material_sales: 'Venta de material',
  grants: 'Subvenciones',
  tournament_income: 'Torneos',
  other_income: 'Otros ingresos',
};

/** Valores en clave de cada columna, por tabla cuando la misma columna significa cosas distintas. */
const VALUES: Record<string, Record<string, string>> = {
  method: { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' },
  category: CATEGORIES,
  level: {
    beginner: 'Iniciación',
    intermediate: 'Intermedio',
    advanced: 'Avanzado',
    private_lesson: 'Particular',
  },
  classroom: { alfil: 'Alfil', caballo: 'Caballo', peon: 'Peón' },
  role: {
    superadministrator: 'Superadministración',
    administrator: 'Administración',
    teacher: 'Profesorado',
    assistant: 'Asistente',
  },
  preferred_plan: {
    monthly: 'Cada mes',
    three_months: 'Tres meses',
    six_months: 'Seis meses',
    rest_of_season: 'Resto de temporada',
  },
  'billing_payment.kind': { monthly: 'Cuotas', membership: 'Cuota de socio', material: 'Material' },
  'billing_charge.kind': {
    monthly: 'Cuota mensual',
    membership: 'Cuota de socio',
    material: 'Material',
  },
  'accounting_entry.kind': { income: 'Ingreso', expense: 'Gasto' },
  'accounting_category.kind': { income: 'Ingreso', expense: 'Gasto' },
  'points_movement.kind': {
    friday: 'Viernes',
    tournament: 'Foto de torneo',
    manual: 'Ajuste',
    redemption: 'Canje',
  },
  'payroll_duty.kind': { shift: 'Turno', fridays: 'Viernes (puntos)' },
  'attendance_roll_call.kind': { taken: 'Pasada', confirmed: 'Dada por buena' },
  'attendance_activity_check.kind': { done: 'Hecha', confirmed: 'Dada por buena' },
  'equipment_order.status': { reserved: 'Reservado', ordered: 'Pedido', cancelled: 'Cancelado' },
  'identity_user.status': { active: 'Activa', disabled: 'Desactivada' },
  'payroll_session.source': { manual: 'A mano', schedule: 'Del horario' },
};

const WEEKDAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MINUTE_FIELDS = /^(start|end|attendance_start|attendance_end)_minutes$/;

/** Un trozo del valor: texto y, si es un registro de la aplicación, adónde lleva. */
export interface ValuePart {
  text: string;
  to?: string;
}

function time(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Un objeto guardado como JSON: una línea de cobro («1,5 h semanales · 1 mes: 40 €»), un tutor, o sus pares. */
function objectText(value: Record<string, unknown>): string {
  if (typeof value.label === 'string' && typeof value.amountCents === 'number') {
    const minutes = typeof value.minutes === 'number' ? ` (${duration(value.minutes)})` : '';
    return `${value.label}${minutes}: ${formatCents(value.amountCents)}`;
  }
  if (typeof value.name === 'string' && 'phone' in value) {
    return value.phone ? `${value.name} (${String(value.phone)})` : value.name;
  }
  return Object.entries(value)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => {
      const text = typeof v === 'number' && /cents$/i.test(k) ? formatCents(v) : scalarText(k, v);
      return `${fieldLabel(k.replace(/([A-Z])/g, '_$1').toLowerCase())}: ${text}`;
    })
    .join(' · ');
}

function scalarText(field: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (typeof raw === 'boolean') return raw ? 'Sí' : 'No';
  if (typeof raw === 'number') {
    if (field.endsWith('_cents')) return formatCents(raw);
    if (field === 'discount_percent' || field === 'vatPercent') return `${raw} %`;
    if (field === 'delta') return raw > 0 ? `+${raw}` : String(raw);
    if (field === 'minutes') return duration(raw);
    if (MINUTE_FIELDS.test(field)) return time(raw);
    if (field === 'weekday') return WEEKDAYS[raw] ?? String(raw);
    if (field === 'start_year' || field === 'season_year')
      return `${raw}/${String((raw + 1) % 100).padStart(2, '0')}`;
    if (field === 'attachment_bytes') return `${Math.round(raw / 1024)} KB`;
    return String(raw);
  }
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDate(raw);
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return madridDateTime(raw);
    if (/^\d{4}-\d{2}$/.test(raw)) return monthLabel(raw);
    return raw;
  }
  if (isRecord(raw)) return objectText(raw);
  return JSON.stringify(raw);
}

/**
 * Lo que se enseña de un valor guardado: importes en euros, fechas y meses en español, horas, días de la semana,
 * valores en clave traducidos, listas desplegadas y, para lo que apunta a otro registro, su nombre con enlace.
 */
export function fieldValue(
  field: string,
  raw: unknown,
  table = '',
  references: Record<string, AuditReference> = {},
): ValuePart[] {
  if (raw === null || raw === undefined || raw === '') return [{ text: '—' }];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [{ text: '—' }];
    return raw.flatMap((item) => fieldValue(field, item, table, references));
  }
  if (typeof raw === 'string') {
    const ref = references[raw];
    if (ref) {
      return [
        ref.target ? { text: ref.label, to: targetLink(ref.target).to } : { text: ref.label },
      ];
    }
    const known = VALUES[`${table}.${field}`] ?? VALUES[field];
    if (known?.[raw]) return [{ text: known[raw] }];
  }
  if (typeof raw === 'number' && (field === 'days' || field === 'attendance_days')) {
    return [{ text: WEEKDAYS[raw] ?? String(raw) }];
  }
  return [{ text: scalarText(field, raw) }];
}

/** En altas y bajas, lo vacío no cuenta nada. */
/** «Efectivo», «Tarjeta»…: la forma de pago de un cobro. */
export function paymentMethodLabel(method: string): string {
  return VALUES.method?.[method] ?? method;
}

export function isEmptyValue(raw: unknown): boolean {
  return (
    raw === null || raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0)
  );
}
