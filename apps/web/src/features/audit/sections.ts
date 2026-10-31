import type { AuditCategory, AuditPeriod, AuditSection } from './api';

/** Cómo se llama cada categoría del historial: las secciones de la aplicación. */
export const CATEGORY_NAMES: Record<AuditCategory, string> = {
  students: 'Alumnos',
  groups: 'Grupos',
  charges: 'Cuotas',
  payments: 'Cobros',
  attendance: 'Asistencia',
  points: 'Puntos',
  teachers: 'Profesorado',
  payroll: 'Nóminas',
  accounting: 'Contabilidad',
  equipment: 'Material',
  system: 'Cuentas y sistema',
};

/** Una pestaña del historial: la general (todo) o una sección. Su `id` va en la URL (?seccion=). */
interface AuditTab {
  id: string;
  label: string;
  section: AuditSection | null;
}

export const TABS: AuditTab[] = [
  { id: 'general', label: 'General', section: null },
  { id: 'alumnos', label: 'Alumnos', section: 'students' },
  { id: 'pagos', label: 'Pagos', section: 'payments' },
  { id: 'asistencia', label: 'Asistencia y notas', section: 'attendance' },
];

export function tabFrom(id: string | null): AuditTab {
  return TABS.find((t) => t.id === id) ?? (TABS[0] as AuditTab);
}

/** Los periodos de las secciones, con su `id` en la URL (?periodo=). «Hoy» es el de por defecto. */
export const PERIODS: readonly { id: string; value: AuditPeriod; label: string }[] = [
  { id: 'hoy', value: 'today', label: 'Hoy' },
  { id: 'semana', value: 'week', label: 'Esta semana' },
  { id: 'mes', value: 'month', label: 'Este mes' },
  { id: 'todo', value: 'all', label: 'Todo' },
];

export function periodFrom(id: string | null): AuditPeriod {
  return PERIODS.find((p) => p.id === id)?.value ?? 'today';
}

export function periodId(period: AuditPeriod): string {
  return PERIODS.find((p) => p.value === period)?.id ?? 'hoy';
}

/** «hoy», «esta semana», «este mes»; vacío para todo. */
export function periodPhrase(period: AuditPeriod): string {
  return period === 'all'
    ? ''
    : (PERIODS.find((p) => p.value === period)?.label ?? '').toLowerCase();
}

const NOTHING: Record<AuditSection, { some: string; none: string }> = {
  students: { some: 'cambios de alumnos', none: 'Todavía no hay cambios de alumnos registrados.' },
  payments: { some: 'cobros', none: 'Todavía no hay cobros registrados.' },
  attendance: {
    some: 'clases con lista o notas',
    none: 'Todavía no hay clases con lista o notas.',
  },
};

/** Qué decir cuando una sección no tiene nada en el periodo. */
export function emptyMessage(section: AuditSection, period: AuditPeriod): string {
  const words = NOTHING[section];
  return period === 'all' ? words.none : `No hay ${words.some} ${periodPhrase(period)}.`;
}
