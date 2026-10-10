import { apiGet, apiSend } from '@/shared/api/client';

/** `expected`: cuota prevista de un mes futuro (aún no existe; lo que se espera cobrar). */
export type ChargeStatus =
  'paid' | 'partial' | 'due' | 'overdue' | 'upcoming' | 'expected' | 'cancelled';
/** `material`: el cobro de un pedido de material deportivo. */
export type ChargeKind = 'monthly' | 'membership' | 'material';
export type PaymentMethod = 'cash' | 'card' | 'transfer';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Datáfono',
  transfer: 'Transferencia',
};
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
  /** Lo que tiene cubierto por los cobros del alumno. */
  coveredCents: number;
  /** Fijada a mano, con su motivo. */
  manual: boolean;
  note: string | null;
  /** Si se canceló lo pendiente: su importe sin cancelar y lo cancelado (0 si no). */
  fullAmountCents: number;
  cancelledCents: number;
  /** Concepto propio (el producto, en las de material). */
  concept: string | null;
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
  /** Descuento especial: en porcentaje o en céntimos, con motivo. */
  specialDiscount: { percent: number | null; amountCents: number | null; concept: string } | null;
  /** Puntos a canjear (1 punto = 1 % de una cuota mensual; máximo 5; solo cuotas mensuales). */
  redeemPoints: number;
  /** Solo en los cobros de material: el cobro del pedido que se paga. */
  chargeId?: string | null;
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
  /** Porcentaje del descuento familiar de sus cuotas mensuales (0 si no tiene). */
  familyPercent: number;
  hasPrivateLessons: boolean;
  membershipPaid: boolean;
  membershipFeeCents: number;
  /** Cuotas mensuales de la temporada con lo cubierto y lo que falta. */
  charges: AccountCharge[];
  /** Su cuota de socio de la temporada con lo pendiente, o null si no tiene. */
  membershipCharge: { id: string; pendingCents: number } | null;
  /** Lo que sobra de los cobros tras cubrir todas las cuotas. */
  balanceCents: number;
  /** Cobros de material con algo pendiente. */
  materialCharges: { id: string; concept: string; pendingCents: number }[];
  /** Todo lo que mueve en el club, por tipo: lo cobrado y lo pendiente. */
  totals: { kind: ChargeKind; paidCents: number; pendingCents: number }[];
}

export interface AccountCharge {
  id: string;
  period: string;
  amountCents: number;
  coveredCents: number;
  pendingCents: number;
  status: ChargeStatus;
  manual: boolean;
  note: string | null;
  /** Descuento por pago adelantado fijado en este mes (0 si no tiene). */
  discountPercent: number;
  /** Si se canceló (entera o la parte pendiente): su importe sin cancelar y lo cancelado. */
  fullAmountCents: number;
  cancelledCents: number;
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

export type ChargesKind = 'monthly' | 'membership';

/** Cuotas mensuales de un mes, o las cuotas de socio de la temporada de ese mes. */
export function fetchCharges(month: string, kind: ChargesKind): Promise<MonthlyCharges> {
  return apiGet(`${BASE}/charges?month=${month}&kind=${kind}`);
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

/** Cuota cancelada (entera o solo lo pendiente), en «Cuotas canceladas». */
export interface CancelledCharge {
  id: string;
  studentId: string;
  studentName: string;
  kind: ChargeKind;
  period: string;
  fullAmountCents: number;
  /** Lo que se conservó (lo cobrado) y lo cancelado. */
  keptCents: number;
  cancelledCents: number;
  cancelledOn: string;
}

export async function fetchCancelledCharges(): Promise<CancelledCharge[]> {
  return (await apiGet<{ items: CancelledCharge[] }>(`${BASE}/charges/cancelled`)).items;
}

/** Cancela lo pendiente de una cuota (entera, o lo que falta si está pagada en parte). */
export function cancelCharge(chargeId: string): Promise<void> {
  return apiSend('POST', `${BASE}/charges/${chargeId}/cancel`);
}

/** Vuelve a deberse entera. */
export function reactivateCharge(chargeId: string): Promise<void> {
  return apiSend('POST', `${BASE}/charges/${chargeId}/reactivate`);
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

export function fetchSettings(): Promise<BillingSettings> {
  return apiGet(`${BASE}/settings`);
}

export function updateSettings(settings: BillingSettings): Promise<void> {
  return apiSend('PUT', `${BASE}/settings`, settings);
}

export type ChargeScope = 'one' | 'rest';

/** Fija a mano el importe de una cuota: solo ese mes o ese y los siguientes de la temporada. */
export function adjustCharge(
  studentId: string,
  month: string,
  input: { amountCents: number; reason: string; scope: ChargeScope },
): Promise<void> {
  return apiSend('PUT', `${BASE}/accounts/${studentId}/charges/${month}`, input);
}

/** Devuelve la cuota al importe calculado con lo que hace hoy el alumno. */
export function resetCharge(studentId: string, month: string): Promise<void> {
  return apiSend('POST', `${BASE}/accounts/${studentId}/charges/${month}/reset`, {});
}

/** Fija el descuento por pago adelantado de una cuota; se recalcula con la cuota de hoy del alumno. */
export function setChargeDiscount(
  studentId: string,
  month: string,
  percent: number,
): Promise<void> {
  return apiSend('PUT', `${BASE}/accounts/${studentId}/charges/${month}/discount`, { percent });
}
