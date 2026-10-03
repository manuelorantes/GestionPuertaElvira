import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

export function useLedger(month: string) {
  return useQuery({ queryKey: ['ledger', month], queryFn: () => api.fetchLedger(month) });
}

export function useInvoices() {
  return useQuery({ queryKey: ['invoices'], queryFn: api.fetchInvoices });
}

export function useFiscalYear(startYear: number) {
  return useQuery({
    queryKey: ['fiscal-year', startYear],
    queryFn: () => api.fetchFiscalYear(startYear),
  });
}

/** Mutación de Contabilidad que refresca movimientos, facturas y el ejercicio. */
export function useAccountingMutation<Variables, Result = void>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        ['ledger', 'invoices', 'fiscal-year', 'dashboard'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
