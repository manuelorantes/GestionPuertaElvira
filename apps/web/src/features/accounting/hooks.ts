import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

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
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn, onSuccess: refresh });
}
