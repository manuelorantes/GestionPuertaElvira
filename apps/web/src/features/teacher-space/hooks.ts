import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

export function useTeacherClasses(from: string, to: string) {
  return useQuery({
    queryKey: ['teacher-classes', from, to],
    queryFn: () => api.fetchClasses(from, to),
  });
}

export function useTeacherGroups() {
  return useQuery({ queryKey: ['teacher-groups'], queryFn: api.fetchGroups });
}

export function useTeacherGroupAttendance(groupId: string, month: string) {
  return useQuery({
    queryKey: ['teacher-group-attendance', groupId, month],
    queryFn: () => api.fetchTeacherGroupAttendance(groupId, month),
  });
}

/** Los comentarios del grupo: las últimas 4 semanas y, con `fetchNextPage`, las 4 anteriores. */
export function useTeacherGroupComments(groupId: string) {
  return useInfiniteQuery({
    queryKey: ['teacher-group-comments', groupId],
    queryFn: ({ pageParam }) => api.fetchTeacherGroupComments(groupId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
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
