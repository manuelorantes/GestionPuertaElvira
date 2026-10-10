import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

import * as api from './api';

export function useDiagnostics(status: api.FindingStatus) {
  return useQuery({
    queryKey: ['diagnostics', status],
    queryFn: () => api.fetchDiagnostics(status),
    placeholderData: keepPreviousData,
  });
}

/** Diagnosticar solo crea hallazgos: basta con recargar la pestaña. */
export function useRunDiagnosis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.runDiagnosis,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['diagnostics'] }),
  });
}

/** Aceptar aplica un cambio en el club: se refresca todo. */
export function useFindingDecision(decide: (id: string) => Promise<void>) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn: decide, onSuccess: refresh });
}
