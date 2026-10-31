import type { RollCall } from '@/features/teacher-space/api';
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
  /** Otra cuenta ya la dio por buena (y cuenta para las horas): quién y qué día; null si nadie. */
  validation: { by: string | null; on: string } | null;
}

export async function fetchMissedRollCalls(): Promise<MissedRollCall[]> {
  return (await apiGet<{ items: MissedRollCall[] }>('/api/admin/attendance/pending')).items;
}

/** La clase o actividad se dio (o, si otra cuenta ya la dio por buena, vista): deja de salir en mi aviso. */
export function confirmWithoutRollCall(item: MissedRollCall): Promise<void> {
  return item.dutyId !== null
    ? apiSend(
        'POST',
        `/api/admin/attendance/pending/activities/${item.dutyId}/${item.date}/confirm`,
      )
    : apiSend('POST', `/api/admin/attendance/pending/${item.groupId}/${item.date}/confirm`);
}

/** La lista de una clase tal y como la ve superadministración: la de quien la da ese día. */
export interface StaffRollCall extends RollCall {
  groupId: string;
  teacher: { id: string; name: string };
}

/** Superadministración: la lista de la clase de cualquier grupo un día en que la hay. */
export function fetchStaffRollCall(groupId: string, date: string): Promise<StaffRollCall> {
  return apiGet<StaffRollCall>(`/api/admin/roll-calls/${groupId}/${date}`);
}

/** Superadministración guarda la lista (sin plazo); apunta la clase en las horas del profesor si no lo estaba. */
export function saveStaffRollCall(
  groupId: string,
  date: string,
  marks: { absent: string[]; guests: string[] },
): Promise<void> {
  return apiSend('PUT', `/api/admin/roll-calls/${groupId}/${date}`, marks);
}

/** Asistencia de un alumno en la temporada: clases con lista en las que estaba, a cuántas vino y sus faltas. */
export interface StudentAttendance {
  season: number;
  classes: number;
  attended: number;
  absences: { date: string; label: string }[];
  /** Clases de otros grupos a las que vino (asistencia especial; no cuentan en el porcentaje). */
  specials: { date: string; label: string }[];
}

export function fetchStudentAttendance(studentId: string): Promise<StudentAttendance> {
  return apiGet<StudentAttendance>(`/api/admin/students/${studentId}/attendance`);
}

/**
 * Un alumno un día: vino, faltó, sin saber (no hay lista), vino sin tocarle (asistencia especial) o null si ese día no
 * le tocaba.
 */
export type AttendanceMark = 'present' | 'absent' | 'unknown' | 'special' | null;

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
    /** Estuvo inscrito algún día del mes (si no, solo vino en asistencia especial). */
    member: boolean;
  }[];
}

export function fetchGroupAttendance(groupId: string, month: string): Promise<GroupAttendance> {
  return apiGet<GroupAttendance>(
    `/api/admin/attendance/groups/${groupId}?month=${encodeURIComponent(month)}`,
  );
}
