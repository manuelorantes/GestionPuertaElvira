import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTeacher,
  fetchGroup,
  fetchGroups,
  fetchTeachers,
  saveGroup,
  updateTeacher,
  type GroupPayload,
} from './api';

const GROUPS_KEY = ['groups'] as const;
const TEACHERS_KEY = ['teachers'] as const;

export function useGroups() {
  return useQuery({ queryKey: GROUPS_KEY, queryFn: fetchGroups });
}

export function useGroup(id: string) {
  return useQuery({ queryKey: [...GROUPS_KEY, id], queryFn: () => fetchGroup(id) });
}

export function useTeachers() {
  return useQuery({ queryKey: TEACHERS_KEY, queryFn: fetchTeachers });
}

function useInvalidateClasses() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
      queryClient.invalidateQueries({ queryKey: TEACHERS_KEY }),
    ]);
}

export function useSaveGroup() {
  const invalidate = useInvalidateClasses();
  return useMutation({
    mutationFn: ({ payload, id }: { payload: GroupPayload; id?: string }) => saveGroup(payload, id),
    onSuccess: invalidate,
  });
}

export function useCreateTeacher() {
  const invalidate = useInvalidateClasses();
  return useMutation({ mutationFn: createTeacher, onSuccess: invalidate });
}

export function useUpdateTeacher() {
  const invalidate = useInvalidateClasses();
  return useMutation({
    mutationFn: ({ id, fullName, active }: { id: string; fullName: string; active: boolean }) =>
      updateTeacher(id, fullName, active),
    onSuccess: invalidate,
  });
}
