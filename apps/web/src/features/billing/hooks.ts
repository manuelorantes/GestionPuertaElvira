import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

export function useMonthlyCharges(month: string) {
  return useQuery({ queryKey: ['charges', month], queryFn: () => api.fetchCharges(month) });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        ['charges', 'payments', 'payment', 'account', 'billing-settings'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
