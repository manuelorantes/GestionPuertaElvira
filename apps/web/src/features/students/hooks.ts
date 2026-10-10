import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

import * as api from './api';

export function useStudents(filter: api.StudentFilter, search: string) {
  return useQuery({
    queryKey: ['students', filter, search],
    queryFn: () => api.fetchStudents(filter, search),
  });
}

/** Solo con nombre y algún apellido: con una palabra no hay con qué comparar. */
export function useSimilarStudents(fullName: string) {
  const name = fullName.trim().replace(/\s+/g, ' ');
  return useQuery({
    queryKey: ['students', 'similar', name.toLowerCase()],
    queryFn: () => api.fetchSimilarStudents(name),
    enabled: name.includes(' '),
  });
}

export function usePendingData(enabled = true) {
  return useQuery({
    queryKey: ['students', 'pending-data'],
    queryFn: api.fetchPendingData,
    enabled,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: () => api.fetchStudent(id ?? ''),
    enabled: Boolean(id),
  });
}

/** Quién se queda sin familia directa en el club (y sin descuento familiar) si el alumno se da de baja. */
export function useFamilyLeftAlone(id: string) {
  return useQuery({
    queryKey: ['student', id, 'family-left-alone'],
    queryFn: () => api.fetchFamilyLeftAlone(id),
  });
}

/** Mutación de Alumnado que refresca listas, fichas y ocupación de grupos. */
export function useStudentMutation<Variables, Result = void>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn, onSuccess: refresh });
}
