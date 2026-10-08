import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

export function useTeacherClasses(from: string, to: string) {
  return useQuery({
    queryKey: ['teacher-classes', from, to],
    queryFn: () => api.fetchClasses(from, to),
  });
}

export function useTeacherStudents() {
  return useQuery({ queryKey: ['teacher-students'], queryFn: api.fetchStudents });
}

export function useRollCall(groupId: string, date: string) {
  return useQuery({
    queryKey: ['teacher-roll-call', groupId, date],
    queryFn: () => api.fetchRollCall(groupId, date),
  });
}

export function useSaveRollCall(groupId: string, date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (absent: string[]) => api.saveRollCall(groupId, date, absent),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teacher-classes'] });
      void queryClient.invalidateQueries({ queryKey: ['teacher-roll-call', groupId, date] });
    },
  });
}
