import { apiGet, apiSend } from '@/shared/api/client';

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'private_lesson';
/** Las tres aulas del club, con nombre de pieza. */
export type Classroom = 'alfil' | 'caballo' | 'peon';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export type WeeklyPlan =
  'one_hour' | 'hour_and_half' | 'two_hours' | 'three_hours' | 'private_lesson';

export interface ClassGroup {
  id: string;
  name: string;
  /** false cuando el nombre es el de por defecto (día, hora, nivel y aula). */
  customName: boolean;
  level: Level;
  teacher: { id: string; fullName: string };
  days: Weekday[];
  start: string;
  end: string;
  slotLabel: string;
  classroom: Classroom;
  capacity: number;
  /** Plazas ocupadas el día más lleno. */
  occupied: number;
  /** Plazas ocupadas cada día del grupo. */
  occupancyByDay: Partial<Record<Weekday, number>>;
  weeklyPlan: WeeklyPlan;
}

export interface Teacher {
  id: string;
  fullName: string;
  active: boolean;
  groupCount: number;
  hourlyRate: string;
}

export interface GroupPayload {
  /** Vacío = nombre por defecto. */
  name: string;
  level: Level;
  teacherId: string;
  days: Weekday[];
  start: string;
  end: string;
  classroom: Classroom;
  capacity: number;
}

export async function fetchGroups(): Promise<ClassGroup[]> {
  return (await apiGet<{ items: ClassGroup[] }>('/api/admin/groups')).items;
}

export async function fetchTeachers(): Promise<Teacher[]> {
  return (await apiGet<{ items: Teacher[] }>('/api/admin/teachers')).items;
}

export function saveGroup(payload: GroupPayload, id?: string): Promise<unknown> {
  return id
    ? apiSend('PUT', `/api/admin/groups/${id}`, payload)
    : apiSend('POST', '/api/admin/groups', payload);
}

export function createTeacher(fullName: string): Promise<unknown> {
  return apiSend('POST', '/api/admin/teachers', { fullName });
}

export function updateTeacher(
  id: string,
  fullName: string,
  active: boolean,
  hourlyRate: string,
): Promise<unknown> {
  return apiSend('PUT', `/api/admin/teachers/${id}`, { fullName, active, hourlyRate });
}

export interface ClassGroupDetail extends ClassGroup {
  students: { id: string; fullName: string; age: number | null; attendanceLabel: string | null }[];
}

export function fetchGroup(id: string): Promise<ClassGroupDetail> {
  return apiGet(`/api/admin/groups/${id}`);
}
