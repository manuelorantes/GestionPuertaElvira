import { apiGet, apiSend, apiUpload } from '@/shared/api/client';

import type { EntryKind } from './categories';
import type { Share } from './periodShares';

export interface LedgerItem {
  source: 'payment' | 'settlement' | 'advance' | 'invoice' | 'manual';
  sourceId: string;
  date: string;
  kind: EntryKind;
  concept: string;
  category: string;
  method: string;
  amountCents: number;
  /** El alumno de un cobro; el resto de movimientos no tiene. */
  studentId: string | null;
  /** Primer mes al que corresponde («AAAA-MM»). */
  period: string;
  /** Lo que corresponde a cada mes. */
  shares: Share[];
  /** Un cobro, liquidación o anticipo corregido en contabilidad (su recibo o nómina siguen igual). */
  corrected: boolean;
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
  period: string;
  shares: Share[];
}

export interface FiscalYear {
  startYear: number;
  label: string;
  openingCents: number;
  /** Ingresos, gastos y resultado por los meses a los que corresponde; `accumulatedCents`, el saldo al acabar el mes. */
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
  /** Lo que entró y salió de verdad: lo que el cierre pasa a la siguiente temporada. */
  cashResultCents: number;
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
  /** Mes al que corresponde; sin él, el de la fecha. */
  period: string | null;
  /** Lo que corresponde a cada mes, si son varios. */
  shares?: Share[];
}

const BASE = '/api/admin/accounting';

export function fetchLedger(month: string): Promise<Ledger> {
  return apiGet(`${BASE}/ledger?month=${month}`);
}

/** Un apunte manual: lo justo para abrir el libro donde está. */
export interface ManualEntry {
  id: string;
  date: string;
  kind: EntryKind;
  concept: string;
  category: string;
  method: string;
  amountCents: number;
  period: string;
  shares: Share[];
}

export function fetchEntry(id: string): Promise<ManualEntry> {
  return apiGet(`${BASE}/entries/${id}`);
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

/** Edita un movimiento del libro (en cobros y liquidaciones, solo como sale en contabilidad). */
export function editMovement(input: {
  source: string;
  sourceId: string;
  month: string;
  concept: string;
  category: string;
  method: string;
  amount: string;
  period: string;
  shares?: Share[];
}): Promise<void> {
  return apiSend('PUT', `${BASE}/movements`, input);
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

/** Lo que superadministración corrige de una factura; el pago solo cuenta si está pagada. */
export interface InvoiceAmendment {
  date: string;
  number: string;
  supplier: string;
  concept: string;
  category: string;
  amount: string;
  period: string;
  shares?: Share[];
  paidOn: string | null;
  method: string | null;
}

export function amendInvoice(input: { id: string; amendment: InvoiceAmendment }): Promise<void> {
  return apiSend('PUT', `${BASE}/invoices/${input.id}`, input.amendment);
}

export function deleteInvoice(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/invoices/${id}`);
}

export function attachmentUrl(id: string): string {
  return `${BASE}/invoices/${id}/attachment`;
}

/** Una categoría del libro: de serie o creada por el club (`custom`, se puede renombrar). */
export interface Category {
  code: string;
  kind: EntryKind;
  label: string;
  custom: boolean;
}

export async function fetchCategories(): Promise<Category[]> {
  return (await apiGet<{ items: Category[] }>(`${BASE}/categories`)).items;
}

export function addCategory(input: { kind: EntryKind; label: string }): Promise<Category> {
  return apiSend('POST', `${BASE}/categories`, input);
}

export function renameCategory(input: { code: string; label: string }): Promise<void> {
  return apiSend('PUT', `${BASE}/categories/${input.code}`, { label: input.label });
}

export function removeCategory(code: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/categories/${code}`);
}

/** Categorías que cuentan como ingresos y gastos «del mes» en el resumen. */
export async function fetchMonthlyCategories(): Promise<string[]> {
  return (await apiGet<{ categories: string[] }>(`${BASE}/monthly-categories`)).categories;
}

export function saveMonthlyCategories(categories: string[]): Promise<void> {
  return apiSend('PUT', `${BASE}/monthly-categories`, { categories });
}

export function closeSeason(startYear: number): Promise<void> {
  return apiSend('POST', `${BASE}/years/${startYear}/closing`);
}

/** Lo que tiene el club hoy, y dónde: banco (cuenta y tarjeta) y caja (efectivo). */
export interface Balances {
  clubCents: number;
  bankCents: number;
  cashCents: number;
}

export type Account = 'bank' | 'cash';

/** Traspaso de dinero entre caja y banco: no cambia lo que tiene el club. */
export interface Transfer {
  id: string;
  date: string;
  from: Account;
  to: Account;
  fromLabel: string;
  toLabel: string;
  amountCents: number;
  note: string;
}

export function fetchBalances(): Promise<Balances> {
  return apiGet(`${BASE}/balances`);
}

export async function fetchTransfers(): Promise<Transfer[]> {
  return (await apiGet<{ items: Transfer[] }>(`${BASE}/transfers`)).items;
}

export async function recordTransfer(input: {
  date: string;
  from: Account;
  to: Account;
  amount: string;
  note: string;
}): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/transfers`, input)).id;
}

export function deleteTransfer(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/transfers/${id}`);
}

/** Gasto que el club espera cada mes (alquiler, limpieza…), con lo que suele costar. */
export interface ExpectedExpense {
  id: string;
  concept: string;
  category: string;
  categoryLabel: string;
  amountCents: number;
  /** Meses del año (1 a 12) en que se espera, de septiembre a agosto. */
  months: number[];
  /** Mes («AAAA-MM») desde el que se espera. */
  since: string;
}

export interface ExpectedExpenseInput {
  concept: string;
  category: string;
  amount: string;
  months: number[];
}

/** Un gasto esperado en un mes: pendiente, pagado (con lo que costó) o «No hay este mes». */
export interface ExpectedMonth {
  expenseId: string;
  concept: string;
  category: string;
  categoryLabel: string;
  period: string;
  expectedCents: number;
  status: 'pending' | 'paid' | 'skipped';
  paidCents: number | null;
  entryId: string | null;
  paidOn: string | null;
}

export async function fetchExpectedExpenses(): Promise<ExpectedExpense[]> {
  return (await apiGet<{ items: ExpectedExpense[] }>(`${BASE}/expected`)).items;
}

export async function defineExpectedExpense(input: ExpectedExpenseInput): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/expected`, input)).id;
}

export function reviseExpectedExpense(input: { id: string } & ExpectedExpenseInput): Promise<void> {
  const { id, ...body } = input;
  return apiSend('PUT', `${BASE}/expected/${id}`, body);
}

export function removeExpectedExpense(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/expected/${id}`);
}

export async function fetchExpectedMonth(month: string): Promise<ExpectedMonth[]> {
  return (
    await apiGet<{ items: ExpectedMonth[] }>(
      `${BASE}/expected/month?month=${encodeURIComponent(month)}`,
    )
  ).items;
}

export async function payExpected(input: {
  id: string;
  month: string;
  date: string;
  method: string;
  amount: string;
  period: string;
  shares?: Share[];
}): Promise<string> {
  const { id, month, ...body } = input;
  return (
    await apiSend<{ id: string }>('POST', `${BASE}/expected/${id}/months/${month}/payment`, body)
  ).id;
}

export function skipExpected(input: { id: string; month: string }): Promise<void> {
  return apiSend('POST', `${BASE}/expected/${input.id}/months/${input.month}/skip`);
}

export function restoreExpected(input: { id: string; month: string }): Promise<void> {
  return apiSend('DELETE', `${BASE}/expected/${input.id}/months/${input.month}/skip`);
}
