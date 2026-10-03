import type { LedgerItem } from '@/features/accounting/api';
import type { Charge } from '@/features/billing/api';
import { apiGet } from '@/shared/api/client';

export interface Dashboard {
  month: string;
  today: string;
  collectedCents: number;
  expectedCents: number;
  pendingCents: number;
  expensesCents: number;
  activeStudents: number;
  registeredStudents: number;
  chart: { month: string; incomeCents: number; expenseCents: number }[];
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
