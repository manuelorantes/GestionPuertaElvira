import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

export function useStudents(filter: api.StudentFilter, search: string) {
  return useQuery({
    queryKey: ['students', filter, search],
    queryFn: () => api.fetchStudents(filter, search),
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: () => api.fetchStudent(id ?? ''),
    enabled: Boolean(id),
  });
}

/** Mutación de Alumnado que refresca listas, fichas y ocupación de grupos. */
export function useStudentMutation<Variables, Result = void>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        ['students', 'student', 'groups'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
