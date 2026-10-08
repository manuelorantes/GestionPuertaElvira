import { apiGet, apiSend } from '@/shared/api/client';

/** Lista pasada (o dada por buena), abierta (se puede pasar ya), aún no (no ha empezado) o sin pasar (acabó el plazo). */
type RollCallStatus = 'taken' | 'open' | 'upcoming' | 'missed';

/** Una clase (o turno) de la agenda del profesor, con su aula y los alumnos que van ese día. */
export interface TeacherClass {
  date: string;
  groupId: string | null;
  dutyId: string | null;
  label: string;
  start: string;
  end: string;
  minutes: number;
  /** La da sustituyendo a su titular. */
  substitution: boolean;
  classroom: string | null;
  students: number;
  /** null en los turnos, que no tienen lista. */
  rollCall: RollCallStatus | null;
}

export interface RollCall extends TeacherClass {
  list: { id: string; name: string; present: boolean }[];
}

export interface TeacherGroupRoster {
  groupId: string;
  name: string;
  days: string[];
  start: string;
  end: string;
  classroom: string;
  students: { id: string; name: string; days: string[] }[];
}

const BASE = '/api/teacher';

export async function fetchClasses(from: string, to: string): Promise<TeacherClass[]> {
  return (await apiGet<{ items: TeacherClass[] }>(`${BASE}/classes?from=${from}&to=${to}`)).items;
}

export async function fetchStudents(): Promise<TeacherGroupRoster[]> {
  return (await apiGet<{ items: TeacherGroupRoster[] }>(`${BASE}/students`)).items;
}

export function fetchRollCall(groupId: string, date: string): Promise<RollCall> {
  return apiGet<RollCall>(`${BASE}/roll-calls/${groupId}/${date}`);
}

/** Guarda la lista: los ausentes (el resto vino). */
export function saveRollCall(groupId: string, date: string, absent: string[]): Promise<void> {
  return apiSend('PUT', `${BASE}/roll-calls/${groupId}/${date}`, { absent });
}
