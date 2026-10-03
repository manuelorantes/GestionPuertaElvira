import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

export function useSessions(month: string, teacherId: string) {
  return useQuery({
    queryKey: ['payroll-sessions', month, teacherId],
    queryFn: () => api.fetchSessions(month, teacherId),
  });
}

export function useSettlements(month: string) {
  return useQuery({
    queryKey: ['payroll-settlements', month],
    queryFn: () => api.fetchSettlements(month),
  });
}

export function useSettlementSheet(teacherId: string, month: string) {
  return useQuery({
    queryKey: ['payroll-sheet', teacherId, month],
    queryFn: () => api.fetchSettlementSheet(teacherId, month),
  });
}

export function useProfitability(month: string) {
  return useQuery({
    queryKey: ['payroll-profitability', month],
    queryFn: () => api.fetchProfitability(month),
  });
}

/** Mutación de Profesorado que refresca sesiones, liquidaciones y rentabilidad. */
export function usePayrollMutation<Variables, Result = void>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        [
          'payroll-sessions',
          'payroll-settlements',
          'payroll-sheet',
          'payroll-profitability',
          'dashboard',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ),
  });
}
