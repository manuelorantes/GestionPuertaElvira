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

export interface AuditChange {
  table: string;
  tableLabel: string;
  key: Record<string, unknown>;
  operation: 'I' | 'U' | 'D';
  fields: { field: string; before: unknown; after: unknown }[];
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

export function fetchAction(id: string): Promise<{ action: AuditAction; changes: AuditChange[] }> {
  return apiGet(`${BASE}/${id}`);
}

export function undoAction(id: string): Promise<void> {
  return apiSend('POST', `${BASE}/${id}/undo`);
}

export async function restoreToPoint(id: string): Promise<number> {
  return (await apiSend<{ reverted: number }>('POST', `${BASE}/${id}/restore`)).reverted;
}
