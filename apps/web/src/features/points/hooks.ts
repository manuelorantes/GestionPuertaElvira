import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

import * as api from './api';

export function useStudentPoints(month: string) {
  return useQuery({
    queryKey: ['points-students', month],
    queryFn: () => api.fetchStudentPoints(month),
    placeholderData: keepPreviousData,
  });
}

export function useMovements(filter: Parameters<typeof api.fetchMovements>[0]) {
  return useQuery({
    queryKey: ['points-movements', filter],
    queryFn: () => api.fetchMovements(filter),
    placeholderData: keepPreviousData,
  });
}

export function useFridays(month: string) {
  return useQuery({
    queryKey: ['points-fridays', month],
    queryFn: () => api.fetchFridays(month),
    placeholderData: keepPreviousData,
  });
}

export function usePhotos(month: string) {
  return useQuery({
    queryKey: ['points-photos', month],
    queryFn: () => api.fetchPhotos(month),
    placeholderData: keepPreviousData,
  });
}

/** Cualquier cambio de puntos afecta a saldos, viernes, torneos, movimientos y a la cuenta de cobro del alumno. */
export function usePointsMutation<TInput, TResult>(action: (input: TInput) => Promise<TResult>) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn: action, onSuccess: refresh });
}
