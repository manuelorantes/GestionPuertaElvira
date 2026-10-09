import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

const KEY = 'class-comments';

export function useRollCallComments(groupId: string, date: string) {
  return useQuery({
    queryKey: [KEY, 'roll-call', groupId, date],
    queryFn: () => api.fetchRollCallComments(groupId, date),
  });
}

export function useGroupComments(groupId: string, month: string) {
  return useQuery({
    queryKey: [KEY, 'group', groupId, month],
    queryFn: () => api.fetchGroupComments(groupId, month),
    enabled: groupId !== '',
  });
}

export function useStudentComments(studentId: string) {
  return useQuery({
    queryKey: [KEY, 'student', studentId],
    queryFn: () => api.fetchStudentComments(studentId),
  });
}

/** Escribir, cambiar o quitar un comentario: se guarda al momento y se refrescan todas las listas de comentarios. */
export function useCommentChange<TInput>(action: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
