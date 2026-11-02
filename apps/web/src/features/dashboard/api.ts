import type { LedgerItem } from '@/features/accounting/api';
import type { Charge } from '@/features/billing/api';
import { apiGet } from '@/shared/api/client';

interface MonthBars {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

/**
 * Un mes de «Cuotas vs gastos fijos»: además, las cuotas del mes que faltan por cobrar (pendientes o aún por emitir) y
 * lo que costará el profesorado según el horario.
 */
interface MonthFeeBars extends MonthBars {
  expectedCents: number;
  expectedExpenseCents: number;
}

export interface Dashboard {
  month: string;
  today: string;
  /** Saldo del club: el acumulado del ejercicio hasta el mes en curso, desde el saldo arrastrado. */
  balanceCents: number;
  /** Ingresos menos gastos del ejercicio hasta el mes en curso. */
  seasonResultCents: number;
  /** Lo que falta por cobrar de las cuotas del mes. */
  pendingCents: number;
  /** Cuotas de socio de la temporada sin cobrar, aparte de las del mes. */
  membershipPendingCents: number;
  /** Socios de alta hoy. */
  activeStudents: number;
  /** Cuántos más (o menos) que al empezar el mes: altas menos bajas. */
  studentsChange: number;
  /** Socios de alta hoy que están en al menos una clase. */
  studentsInClasses: number;
  /** Cuántos más (o menos) que al empezar el mes. */
  inClassesChange: number;
  /** Lo que entra y sale cada mes, por fecha. */
  cashChart: MonthBars[];
  /** Cuotas vs gastos fijos: lo que corresponde a cada mes, con las categorías «del mes» de Contabilidad. */
  monthChart: MonthFeeBars[];
  occupancy: {
    percent: number;
    fullGroups: number;
    emptiest: {
      id: string;
      name: string;
      teacherName: string;
      occupied: number;
      capacity: number;
    }[];
  };
  overdue: Charge[];
  latest: Omit<LedgerItem, 'categoryLabel' | 'methodLabel'>[];
}

export function fetchDashboard(): Promise<Dashboard> {
  return apiGet('/api/admin/dashboard');
}

/** Una línea de lo que suma una parte de una barra de «Cuotas vs gastos fijos». */
/** Adónde lleva una línea del detalle de «Cuotas vs gastos fijos». */
export type FeesVsFixedLink =
  | { kind: 'receipt'; paymentId: string }
  | { kind: 'fee'; studentId: string; month: string }
  /** `month`: el de la fecha del movimiento, donde sale en Movimientos. */
  | { kind: 'movement'; sourceId: string; month: string }
  | { kind: 'teacher'; teacherId: string; month: string }
  | { kind: 'expected'; expenseId: string; month: string }
  | { kind: 'ledger'; month: string };

export interface FeesVsFixedItem {
  concept: string;
  detail: string;
  date: string | null;
  /** Lo que suma a la barra (negativo en lo que la descuenta). */
  amountCents: number;
  /** El importe entero, si la línea es solo una parte. */
  totalCents: number | null;
  link: FeesVsFixedLink;
}

export interface FeesVsFixedMonth extends MonthFeeBars {
  parts: Record<'income' | 'expected' | 'expense' | 'expectedExpense', FeesVsFixedItem[]>;
}

/** La temporada en curso de «Cuotas vs gastos fijos», con lo que suma cada parte de cada mes. */
export function fetchFeesVsFixed(): Promise<{ month: string; months: FeesVsFixedMonth[] }> {
  return apiGet('/api/admin/dashboard/fees-vs-fixed');
}
