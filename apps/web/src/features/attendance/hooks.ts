import { useMutation, useQuery } from '@tanstack/react-query';

import { deleteSession } from '@/features/payroll/api';
import { useRefreshClubData } from '@/shared/useRefreshClubData';

import { confirmWithoutRollCall, fetchMissedRollCalls, type MissedRollCall } from './api';

export function useMissedRollCalls(enabled = true) {
  return useQuery({ queryKey: ['missed-roll-calls'], queryFn: fetchMissedRollCalls, enabled });
}

/** Quitar la sesión (no se dio) o darla por buena (se dio): cambian horas, liquidaciones y el aviso. */
export function useSettleMissedRollCall() {
  const refresh = useRefreshClubData();
  return useMutation({
    mutationFn: ({ item, given }: { item: MissedRollCall; given: boolean }) =>
      given ? confirmWithoutRollCall(item.groupId, item.date) : deleteSession(item.sessionId),
    onSuccess: refresh,
  });
}
