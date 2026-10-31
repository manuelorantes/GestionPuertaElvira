import { apiGet, apiSend } from '@/shared/api/client';

/** La parte de la aplicación a la que pertenece una acción; por ella se filtra el historial. */
export type AuditCategory =
  | 'students'
  | 'groups'
  | 'charges'
  | 'payments'
  | 'attendance'
  | 'points'
  | 'teachers'
  | 'payroll'
  | 'accounting'
  | 'equipment'
  | 'system';

export interface AuditAction {
  id: string;
  seq: number;
  kind: 'change' | 'security' | 'undo' | 'restore';
  category: AuditCategory;
  userId: string | null;
  userName: string;
  label: string;
  /** A quién o a qué afectó («Cuota de octubre 2026 · Martina López Herrera»); null si no se sabe decir. */
  detail: string | null;
  occurredAt: string;
  changeCount: number;
  affected: string[];
  reverts: string | null;
  undoable: boolean;
}

/** Dónde se ve en la aplicación lo que tocó un cambio. */
export type AuditTarget =
  | { kind: 'payment' | 'student' | 'group' | 'teacher'; id: string }
  | { kind: 'charges' | 'ledger' | 'settlement'; month: string }
  | { kind: 'hours'; month: string; teacherId: string }
  | { kind: 'invoices' | 'billing-settings' };

interface AuditChange {
  table: string;
  tableLabel: string;
  /** Cómo se llama lo tocado («R-2026-0401 · Martina López Herrera»); null si basta con la tabla. */
  title: string | null;
  key: Record<string, unknown>;
  operation: 'I' | 'U' | 'D';
  fields: { field: string; before: unknown; after: unknown }[];
  /** null si no hay dónde ir (registro borrado, cuentas de usuario…). */
  target: AuditTarget | null;
}

/** Un registro que mencionan los campos de un detalle: su nombre y dónde verlo. */
export interface AuditReference {
  kind:
    'student' | 'teacher' | 'group' | 'user' | 'payment' | 'charge' | 'product' | 'order' | 'duty';
  label: string;
  target: AuditTarget | null;
}

export interface AuditDetail {
  action: AuditAction;
  changes: AuditChange[];
  /** Por identificador, lo que mencionan los cambios. */
  references: Record<string, AuditReference>;
}

export interface AuditPage {
  items: AuditAction[];
  people: { id: string; name: string }[];
  /** Las categorías con acciones (sin contar el filtro por categoría), en su orden, y cuántas hay de cada. */
  categories: { category: AuditCategory; count: number }[];
}

/** Una sección del historial: solo las acciones que tocaron lo suyo. */
export type AuditSection = 'students' | 'payments' | 'attendance';
export type AuditPeriod = 'today' | 'week' | 'month' | 'all';

export interface AuditQuery {
  userId?: string;
  section?: AuditSection;
  period?: AuditPeriod;
  /** Solo estas categorías (vacío o sin él: todas). */
  categories?: AuditCategory[];
}

/** Un cobro tal como lo registró (o lo quitó, al deshacer) una acción: el importe lleva el signo. */
export interface AuditPayment extends AuditAction {
  paymentId: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  concept: string;
  method: string;
  totalCents: number;
}

export interface AuditPaymentsPage {
  items: AuditPayment[];
  /** Suma de todo el periodo, no solo de lo cargado. */
  totalCents: number;
}

/** Una nota de una clase tal como está ahora. */
interface AuditClassNote {
  id: string;
  studentName: string | null;
  text: string;
  author: string;
}

/** Una clase (grupo y día) con todo lo que el historial registró de ella y sus notas. */
export interface AuditClass {
  groupId: string | null;
  label: string;
  date: string;
  actions: AuditAction[];
  notes: AuditClassNote[];
}

const BASE = '/api/admin/audit/actions';

function url(query: AuditQuery, before: number | undefined): string {
  const params = new URLSearchParams();
  if (query.userId) params.set('userId', query.userId);
  if (query.section) params.set('section', query.section);
  if (query.period) params.set('period', query.period);
  for (const category of query.categories ?? []) params.append('category', category);
  if (before) params.set('before', String(before));
  const search = params.toString();
  return `${BASE}${search ? `?${search}` : ''}`;
}

export function fetchActions(query: AuditQuery, before?: number): Promise<AuditPage> {
  return apiGet(url(query, before));
}

export function fetchPayments(period: AuditPeriod, before?: number): Promise<AuditPaymentsPage> {
  return apiGet(url({ section: 'payments', period }, before));
}

export function fetchClasses(period: AuditPeriod): Promise<{ items: AuditClass[] }> {
  return apiGet(url({ section: 'attendance', period }, undefined));
}

export function fetchAction(id: string): Promise<AuditDetail> {
  return apiGet(`${BASE}/${id}`);
}

export function undoAction(id: string): Promise<void> {
  return apiSend('POST', `${BASE}/${id}/undo`);
}

export async function restoreToPoint(id: string): Promise<number> {
  return (await apiSend<{ reverted: number }>('POST', `${BASE}/${id}/restore`)).reverted;
}
