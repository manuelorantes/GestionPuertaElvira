import { apiGet, apiSend } from '@/shared/api/client';

export interface Session {
  id: string;
  date: string;
  teacherId: string;
  teacherName: string;
  groupId: string | null;
  label: string;
  minutes: number;
  costCents: number;
  fromSchedule: boolean;
  locked: boolean;
}

export interface Settlement {
  teacherId: string;
  teacherName: string;
  month: string;
  minutes: number;
  rateCents: number;
  amountCents: number;
  lines: { label: string; minutes: number; amountCents: number }[];
  status: 'pending' | 'paid';
  paidOn: string | null;
}

export interface SettlementSheet extends Settlement {
  club: { name: string; taxId: string; address: string };
}

export interface ProfitabilityRow {
  teacherId: string;
  teacherName: string;
  groups: string[];
  minutes: number;
  rateCents: number;
  costCents: number;
  incomeCents: number;
  marginCents: number;
  incomePerHourCents: number | null;
  occupied: number;
  capacity: number;
}

export interface SessionPayload {
  teacherId: string;
  date: string;
  groupId: string | null;
  activity: string | null;
  hours: number;
}

const BASE = '/api/admin/payroll';

export async function fetchSessions(month: string, teacherId: string): Promise<Session[]> {
  const teacher = teacherId ? `&teacherId=${teacherId}` : '';
  return (await apiGet<{ items: Session[] }>(`${BASE}/sessions?month=${month}${teacher}`)).items;
}

export async function fetchSettlements(month: string): Promise<Settlement[]> {
  return (await apiGet<{ items: Settlement[] }>(`${BASE}/settlements?month=${month}`)).items;
}

export function fetchSettlementSheet(teacherId: string, month: string): Promise<SettlementSheet> {
  return apiGet(`${BASE}/settlements/${teacherId}/${month}`);
}

export async function fetchProfitability(month: string): Promise<ProfitabilityRow[]> {
  return (await apiGet<{ items: ProfitabilityRow[] }>(`${BASE}/profitability?month=${month}`))
    .items;
}

export async function recordSession(payload: SessionPayload): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/sessions`, payload)).id;
}

export function updateSession(id: string, teacherId: string, hours: number): Promise<void> {
  return apiSend('PUT', `${BASE}/sessions/${id}`, { teacherId, hours });
}

export function deleteSession(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/sessions/${id}`);
}

export async function markHoliday(date: string): Promise<number> {
  return (await apiSend<{ removed: number }>('POST', `${BASE}/holidays`, { date })).removed;
}

export function paySettlement(teacherId: string, month: string): Promise<void> {
  return apiSend('POST', `${BASE}/settlements/${teacherId}/${month}/payment`);
}

export async function payAllSettlements(month: string): Promise<number> {
  return (await apiSend<{ paid: number }>('POST', `${BASE}/settlements/${month}/payment`)).paid;
}
