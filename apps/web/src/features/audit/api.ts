import { apiGet, apiSend } from '@/shared/api/client';

export interface AuditAction {
  id: string;
  seq: number;
  kind: 'change' | 'security' | 'undo' | 'restore';
  userId: string | null;
  userName: string;
  label: string;
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
}

const BASE = '/api/admin/audit/actions';

export function fetchActions(userId: string, before?: number): Promise<AuditPage> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (before) params.set('before', String(before));
  const query = params.toString();
  return apiGet(`${BASE}${query ? `?${query}` : ''}`);
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
