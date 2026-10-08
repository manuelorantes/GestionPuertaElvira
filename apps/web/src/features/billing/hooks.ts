import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

import * as api from './api';

export function useMonthlyCharges(month: string, kind: api.ChargesKind) {
  return useQuery({
    queryKey: ['charges', month, kind],
    // Al cambiar de mes se sigue viendo el anterior hasta que llega el nuevo.
    placeholderData: keepPreviousData,
    queryFn: () => api.fetchCharges(month, kind),
  });
}

export function usePayments(studentId?: string) {
  return useQuery({
    queryKey: ['payments', studentId ?? 'all'],
    queryFn: () => api.fetchPayments(studentId),
  });
}

export function usePayment(id: string) {
  return useQuery({ queryKey: ['payment', id], queryFn: () => api.fetchPayment(id) });
}

export function useAccount(studentId: string) {
  return useQuery({ queryKey: ['account', studentId], queryFn: () => api.fetchAccount(studentId) });
}

export function useBillingSettings() {
  return useQuery({ queryKey: ['billing-settings'], queryFn: api.fetchSettings });
}

/** Mutación de Cobros que refresca cuotas, cobros, recibos, fichas y ajustes. */
export function useBillingMutation<Variables, Result = void>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn, onSuccess: refresh });
}
