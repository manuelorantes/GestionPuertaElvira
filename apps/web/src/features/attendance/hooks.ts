import { useMutation, useQuery } from '@tanstack/react-query';

import { deleteSession } from '@/features/payroll/api';
import { useRefreshClubData } from '@/shared/useRefreshClubData';

import {
  confirmWithoutRollCall,
  fetchGroupAttendance,
  fetchMissedRollCalls,
  fetchStaffRollCall,
  fetchStudentAttendance,
  type MissedRollCall,
  saveStaffRollCall,
} from './api';

export function useMissedRollCalls(enabled = true) {
  return useQuery({ queryKey: ['missed-roll-calls'], queryFn: fetchMissedRollCalls, enabled });
}

/** Quitar la sesión (no se dio) o darla por buena (se dio): cambian horas, liquidaciones y el aviso. */
export function useSettleMissedRollCall() {
  const refresh = useRefreshClubData();
  return useMutation({
    mutationFn: ({ item, given }: { item: MissedRollCall; given: boolean }) =>
      given ? confirmWithoutRollCall(item) : deleteSession(item.sessionId),
    onSuccess: refresh,
  });
}

export function useStaffRollCall(groupId: string, date: string) {
  return useQuery({
    queryKey: ['staff-roll-call', groupId, date],
    queryFn: () => fetchStaffRollCall(groupId, date),
  });
}

/** Pasar la lista cambia la asistencia, el aviso de listas sin pasar y, si no estaba apuntada, las horas. */
export function useSaveStaffRollCall(groupId: string, date: string) {
  const refresh = useRefreshClubData();
  return useMutation({
    mutationFn: (marks: { absent: string[]; guests: string[] }) =>
      saveStaffRollCall(groupId, date, marks),
    onSuccess: refresh,
  });
}

export function useStudentAttendance(studentId: string) {
  return useQuery({
    queryKey: ['student-attendance', studentId],
    queryFn: () => fetchStudentAttendance(studentId),
  });
}

export function useGroupAttendance(groupId: string, month: string) {
  return useQuery({
    queryKey: ['group-attendance', groupId, month],
    queryFn: () => fetchGroupAttendance(groupId, month),
    enabled: groupId !== '',
  });
}
