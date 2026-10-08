import { apiGet, apiSend } from '@/shared/api/client';

/** Clase apuntada en las horas cuyo plazo para pasar lista acabó sin lista. */
export interface MissedRollCall {
  sessionId: string;
  groupId: string;
  date: string;
  label: string;
  teacherName: string;
  /** Su liquidación ya está pagada: la sesión no se puede quitar. */
  locked: boolean;
}

export async function fetchMissedRollCalls(): Promise<MissedRollCall[]> {
  return (await apiGet<{ items: MissedRollCall[] }>('/api/admin/attendance/pending')).items;
}

/** La clase se dio: cuenta y deja de salir en el aviso. */
export function confirmWithoutRollCall(groupId: string, date: string): Promise<void> {
  return apiSend('POST', `/api/admin/attendance/pending/${groupId}/${date}/confirm`);
}

/** Asistencia de un alumno en la temporada: clases con lista en las que estaba, a cuántas vino y sus faltas. */
export interface StudentAttendance {
  season: number;
  classes: number;
  attended: number;
  absences: { date: string; label: string }[];
}

export function fetchStudentAttendance(studentId: string): Promise<StudentAttendance> {
  return apiGet<StudentAttendance>(`/api/admin/students/${studentId}/attendance`);
}
