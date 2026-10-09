import { apiGet, apiSend } from '@/shared/api/client';

/** Clase apuntada en las horas cuyo plazo para pasar lista acabó sin lista. */
export interface MissedRollCall {
  sessionId: string;
  /** La clase, o null si es una actividad del club. */
  groupId: string | null;
  /** La actividad del club, o null si es una clase. */
  dutyId: string | null;
  date: string;
  label: string;
  teacherName: string;
  /** Su liquidación ya está pagada: la sesión no se puede quitar. */
  locked: boolean;
}

export async function fetchMissedRollCalls(): Promise<MissedRollCall[]> {
  return (await apiGet<{ items: MissedRollCall[] }>('/api/admin/attendance/pending')).items;
}

/** La clase o actividad se dio: cuenta y deja de salir en el aviso. */
export function confirmWithoutRollCall(item: MissedRollCall): Promise<void> {
  return item.dutyId !== null
    ? apiSend(
        'POST',
        `/api/admin/attendance/pending/activities/${item.dutyId}/${item.date}/confirm`,
      )
    : apiSend('POST', `/api/admin/attendance/pending/${item.groupId}/${item.date}/confirm`);
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

/** Un alumno un día: vino, faltó, sin saber (no hay lista) o null si ese día no le tocaba. */
export type AttendanceMark = 'present' | 'absent' | 'unknown' | null;

/** Asistencia de un grupo en un mes: los días de clase hasta hoy y, por alumno, si vino a cada uno. */
export interface GroupAttendance {
  groupId: string;
  name: string;
  month: string;
  days: { date: string; status: 'taken' | 'confirmed' | 'pending' | 'holiday' }[];
  students: {
    id: string;
    name: string;
    marks: AttendanceMark[];
    attended: number;
    classes: number;
  }[];
}

export function fetchGroupAttendance(groupId: string, month: string): Promise<GroupAttendance> {
  return apiGet<GroupAttendance>(
    `/api/admin/attendance/groups/${groupId}?month=${encodeURIComponent(month)}`,
  );
}
