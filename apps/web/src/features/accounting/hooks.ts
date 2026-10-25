import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

import * as api from './api';

export function useLedger(month: string) {
  return useQuery({
    queryKey: ['ledger', month],
    queryFn: () => api.fetchLedger(month),
    placeholderData: keepPreviousData,
  });
}

/** El apunte al que apunta un enlace, o nada si no hay enlace. */
export function useEntry(id: string | null) {
  return useQuery({
    queryKey: ['accounting-entry', id],
    queryFn: () => api.fetchEntry(id ?? ''),
    enabled: id !== null,
  });
}

export function useInvoices() {
  return useQuery({ queryKey: ['invoices'], queryFn: api.fetchInvoices });
}

export function useFiscalYear(startYear: number) {
  return useQuery({
    queryKey: ['fiscal-year', startYear],
    // Al cambiar de mes se sigue viendo el anterior hasta que llega el nuevo.
    placeholderData: keepPreviousData,
    queryFn: () => api.fetchFiscalYear(startYear),
  });
}

/** Las categorías del libro (de serie y del club). */
export function useCategories() {
  return useQuery({ queryKey: ['accounting-categories'], queryFn: api.fetchCategories });
}

/** Las de un tipo, como opciones de un desplegable. */
export function useCategoryOptions(kind: 'income' | 'expense', except: string[] = []) {
  return (useCategories().data ?? [])
    .filter((c) => c.kind === kind && !except.includes(c.code))
    .map((c) => ({ value: c.code, label: c.label }));
}

/** Saldos del club, del banco y de caja. */
export function useBalances() {
  return useQuery({ queryKey: ['accounting-balances'], queryFn: api.fetchBalances });
}

export function useTransfers() {
  return useQuery({ queryKey: ['accounting-transfers'], queryFn: api.fetchTransfers });
}

export function useMonthlyCategories() {
  return useQuery({ queryKey: ['monthly-categories'], queryFn: api.fetchMonthlyCategories });
}

/** Mutación de Contabilidad que refresca movimientos, facturas y el ejercicio. */
export function useAccountingMutation<Variables, Result = void>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn, onSuccess: refresh });
}
