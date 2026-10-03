import { apiGet, apiSend, apiUpload } from '@/shared/api/client';

import type { EntryKind } from './categories';

export interface LedgerItem {
  source: 'payment' | 'settlement' | 'invoice' | 'manual';
  sourceId: string;
  date: string;
  kind: EntryKind;
  concept: string;
  category: string;
  method: string;
  amountCents: number;
  categoryLabel: string;
  methodLabel: string;
}

export interface Ledger {
  month: string;
  incomeCents: number;
  expenseCents: number;
  expensesByCategory: { category: string; label: string; amountCents: number }[];
  items: LedgerItem[];
}

export interface Invoice {
  id: string;
  date: string;
  number: string;
  supplier: string;
  concept: string;
  category: string;
  categoryLabel: string;
  amountCents: number;
  paidOn: string | null;
  method: string | null;
  attachmentName: string | null;
}

export interface FiscalYear {
  startYear: number;
  label: string;
  openingCents: number;
  months: {
    month: string;
    incomeCents: number;
    expenseCents: number;
    resultCents: number;
    accumulatedCents: number;
  }[];
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
  canClose: boolean;
  closedOn: string | null;
}

export interface EntryPayload {
  date: string;
  kind: EntryKind;
  concept: string;
  category: string;
  method: string;
  amount: string;
}

const BASE = '/api/admin/accounting';

export function fetchLedger(month: string): Promise<Ledger> {
  return apiGet(`${BASE}/ledger?month=${month}`);
}

export async function fetchInvoices(): Promise<Invoice[]> {
  return (await apiGet<{ items: Invoice[] }>(`${BASE}/invoices`)).items;
}

export function fetchFiscalYear(startYear: number): Promise<FiscalYear> {
  return apiGet(`${BASE}/years/${startYear}`);
}

export async function recordEntry(entry: EntryPayload): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/entries`, entry)).id;
}

export function deleteEntry(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/entries/${id}`);
}

export async function registerInvoice(form: FormData): Promise<string> {
  return (await apiUpload<{ id: string }>(`${BASE}/invoices`, form)).id;
}

export function payInvoice(id: string, date: string, method: string): Promise<void> {
  return apiSend('POST', `${BASE}/invoices/${id}/payment`, { date, method });
}

export function deleteInvoice(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/invoices/${id}`);
}

export function attachmentUrl(id: string): string {
  return `${BASE}/invoices/${id}/attachment`;
}

export function closeSeason(startYear: number): Promise<void> {
  return apiSend('POST', `${BASE}/years/${startYear}/closing`);
}
