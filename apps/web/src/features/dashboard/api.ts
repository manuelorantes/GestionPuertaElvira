import type { LedgerItem } from '@/features/accounting/api';
import type { Charge } from '@/features/billing/api';
import { apiGet } from '@/shared/api/client';

interface MonthBars {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

/**
 * Un mes de «Cuotas vs gastos fijos»: además, las cuotas que aún se emitirán a los alumnos matriculados y lo que
 * costará el profesorado según el horario.
 */
interface MonthFeeBars extends MonthBars {
  expectedCents: number;
  expectedExpenseCents: number;
}

export interface Dashboard {
  month: string;
  today: string;
  collectedCents: number;
  expectedCents: number;
  pendingCents: number;
  /** Cuotas de socio de la temporada sin cobrar, aparte de las del mes. */
  membershipPendingCents: number;
  expensesCents: number;
  activeStudents: number;
  registeredStudents: number;
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
