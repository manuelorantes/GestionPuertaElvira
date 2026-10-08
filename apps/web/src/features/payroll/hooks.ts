import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

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

export function useTeacherReport(teacherId: string) {
  return useQuery({
    queryKey: ['payroll-teacher', teacherId],
    queryFn: () => api.fetchTeacherReport(teacherId),
  });
}

export function useProfitability(month: string) {
  return useQuery({
    queryKey: ['payroll-profitability', month],
    queryFn: () => api.fetchProfitability(month),
  });
}

export function useHolidays(season: number) {
  return useQuery({
    queryKey: ['payroll-holidays', season],
    queryFn: () => api.fetchHolidays(season),
  });
}

export function useSubstitutions(month: string) {
  return useQuery({
    queryKey: ['payroll-substitutions', month],
    queryFn: () => api.fetchSubstitutions(month),
  });
}

export function useDuties() {
  return useQuery({ queryKey: ['payroll-duties'], queryFn: api.fetchDuties });
}

/** Mutación de Profesorado que refresca sesiones, liquidaciones y rentabilidad. */
export function usePayrollMutation<Variables, Result = void>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn, onSuccess: refresh });
}
