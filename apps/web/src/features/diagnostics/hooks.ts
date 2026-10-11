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

/** Descartar o borrar: se refresca todo. */
export function useFindingDecision(decide: (id: string) => Promise<void>) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn: decide, onSuccess: refresh });
}

/**
 * Aceptar aplica un cambio en el club que puede arreglar o crear otros casos: se refresca todo y se vuelve a
 * diagnosticar en segundo plano (si falla, queda el botón «Diagnosticar»).
 */
export function useAcceptFinding() {
  const refresh = useRefreshClubData();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.acceptFinding,
    onSuccess: () => {
      void refresh();
      void api.runDiagnosis().then(
        () => queryClient.invalidateQueries({ queryKey: ['diagnostics'] }),
        () => undefined,
      );
    },
  });
}
