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
    mutationFn: (changes: api.RollCallChanges) => api.saveRollCall(groupId, date, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teacher-classes'] });
      void queryClient.invalidateQueries({ queryKey: ['teacher-roll-call', groupId, date] });
    },
  });
}

export function useTeacherPay() {
  return useQuery({ queryKey: ['teacher-pay'], queryFn: api.fetchPay });
}

export function useFridayList(dutyId: string, date: string) {
  return useQuery({
    queryKey: ['teacher-friday-list', dutyId, date],
    queryFn: () => api.fetchFridayList(dutyId, date),
  });
}

export function useShiftDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { dutyId: string; date: string }) =>
      api.markShiftDone(input.dutyId, input.date),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['teacher-classes'] }),
  });
}
