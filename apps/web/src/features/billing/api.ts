import { apiGet, apiSend } from '@/shared/api/client';

export type ChargeStatus = 'paid' | 'due' | 'overdue' | 'upcoming';
export type ChargeKind = 'monthly' | 'membership';
export type PaymentMethod = 'cash' | 'transfer';
export type PreferredPlan = 'monthly' | 'three_months' | 'six_months' | 'rest_of_season';

export interface Charge {
  id: string;
  studentId: string;
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  kind: ChargeKind;
  period: string;
  amountCents: number;
  status: ChargeStatus;
  paymentId: string | null;
  receiptNumber: string | null;
  remindedOn: string | null;
}

export interface MonthlyCharges {
  month: string;
  label: string;
  items: Charge[];
  totals: {
    expectedCents: number;
    collectedCents: number;
    pendingCents: number;
    overdueCount: number;
  };
}

export interface PaymentRequest {
  studentId: string;
  kind: ChargeKind;
  months: number;
  method: PaymentMethod;
  date: string;
  prorate: boolean;
  /** Descuento especial: en porcentaje o en céntimos, con motivo. */
  specialDiscount: { percent: number | null; amountCents: number | null; concept: string } | null;
  /** Puntos a canjear (1 punto = 1 % de una cuota mensual; máximo 5; solo cuotas mensuales). */
  redeemPoints: number;
}

interface Line {
  label: string;
  amountCents: number;
}

export interface Quote {
  concept: string;
  periods: string[];
  lines: Line[];
  grossCents: number;
  discountPercent: number;
  totalCents: number;
}

export interface PaymentSummary {
  id: string;
  receiptNumber: string;
  paidOn: string;
  studentId: string;
  studentName: string;
  kind: ChargeKind;
  concept: string;
  method: PaymentMethod;
  totalCents: number;
  invoiceNumber: string | null;
}

interface Invoice {
  number: string;
  issuedOn: string;
  customerName: string;
  customerTaxId: string;
  customerAddress: string;
  vatPercent: number;
  baseCents: number;
  vatCents: number;
  totalCents: number;
}

export interface PaymentDetail extends PaymentSummary {
  methodLabel: string;
  guardianName: string;
  lines: Line[];
  periods: string[];
  invoice: Invoice | null;
  club: { name: string; taxId: string; address: string };
}

export interface Account {
  preferredPlan: PreferredPlan;
  member: boolean;
  privateRate: string | null;
  points: number;
  suggestedMonths: number;
  remainingMonths: number;
  weeklyHours: number;
  monthlyFeeCents: number;
  familyDiscount: boolean;
  hasPrivateLessons: boolean;
  membershipPaid: boolean;
  membershipFeeCents: number;
}

export interface BillingSettings {
  threeHours: string;
  twoHours: string;
  hourAndHalf: string;
  oneHour: string;
  membershipFee: string;
  familyPercent: number;
  threeMonthsPercent: number;
  sixMonthsPercent: number;
  seasonPercent: number;
  defaultPrivateRate: string;
  privateRates: Record<string, string>;
  clubName: string;
  clubTaxId: string;
  clubAddress: string;
}

const BASE = '/api/admin/billing';

export function fetchCharges(month: string): Promise<MonthlyCharges> {
  return apiGet(`${BASE}/charges?month=${month}`);
}

export function quotePayment(request: PaymentRequest): Promise<Quote> {
  return apiSend('POST', `${BASE}/quote`, request);
}

export async function registerPayment(request: PaymentRequest): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/payments`, request)).id;
}

export async function fetchPayments(studentId?: string): Promise<PaymentSummary[]> {
  const query = studentId ? `?studentId=${studentId}` : '';
  return (await apiGet<{ items: PaymentSummary[] }>(`${BASE}/payments${query}`)).items;
}

export function fetchPayment(id: string): Promise<PaymentDetail> {
  return apiGet(`${BASE}/payments/${id}`);
}

export function issueInvoice(
  id: string,
  customer: { name: string; taxId: string; address: string },
): Promise<void> {
  return apiSend('POST', `${BASE}/payments/${id}/invoice`, customer);
}

export function markReminded(chargeId: string): Promise<void> {
  return apiSend('POST', `${BASE}/charges/${chargeId}/reminded`);
}

export function fetchAccount(studentId: string): Promise<Account> {
  return apiGet(`${BASE}/accounts/${studentId}`);
}

export function updateAccount(
  studentId: string,
  account: { preferredPlan: PreferredPlan; member: boolean; privateRate: string | null },
): Promise<void> {
  return apiSend('PUT', `${BASE}/accounts/${studentId}`, account);
}

export async function adjustPoints(studentId: string, delta: number): Promise<number> {
  return (
    await apiSend<{ points: number }>('POST', `${BASE}/accounts/${studentId}/points`, { delta })
  ).points;
}

export function fetchSettings(): Promise<BillingSettings> {
  return apiGet(`${BASE}/settings`);
}

export function updateSettings(settings: BillingSettings): Promise<void> {
  return apiSend('PUT', `${BASE}/settings`, settings);
}
