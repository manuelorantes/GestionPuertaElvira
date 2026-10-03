import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshClubData } from '@/shared/useRefreshClubData';

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

/** Grupos y profesores afectan a cuotas, horas propuestas, rentabilidad y resumen: se refresca todo. */
function useInvalidateClasses() {
  return useRefreshClubData();
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
    mutationFn: ({
      id,
      fullName,
      active,
      hourlyRate,
    }: {
      id: string;
      fullName: string;
      active: boolean;
      hourlyRate: string;
    }) => updateTeacher(id, fullName, active, hourlyRate),
    onSuccess: invalidate,
  });
}
