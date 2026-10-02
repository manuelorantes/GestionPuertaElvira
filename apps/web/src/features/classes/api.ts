import { apiGet, apiSend } from '@/shared/api/client';

export type Level =
  'beginner' | 'intermediate' | 'advanced' | 'juniors' | 'adults' | 'private_lesson';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export type WeeklyPlan =
  'one_hour' | 'hour_and_half' | 'two_hours' | 'three_hours' | 'private_lesson';

export interface ClassGroup {
  id: string;
  name: string;
  level: Level;
  teacher: { id: string; fullName: string };
  days: Weekday[];
  start: string;
  end: string;
  slotLabel: string;
  classroom: 1 | 2;
  capacity: number;
  occupied: number;
  weeklyPlan: WeeklyPlan;
}

export interface Teacher {
  id: string;
  fullName: string;
  active: boolean;
  groupCount: number;
}

export interface GroupPayload {
  name: string;
  level: Level;
  teacherId: string;
  days: Weekday[];
  start: string;
  end: string;
  classroom: 1 | 2;
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

export function updateTeacher(id: string, fullName: string, active: boolean): Promise<unknown> {
  return apiSend('PUT', `/api/admin/teachers/${id}`, { fullName, active });
}

export interface ClassGroupDetail extends ClassGroup {
  students: { id: string; fullName: string; age: number }[];
}

export function fetchGroup(id: string): Promise<ClassGroupDetail> {
  return apiGet(`/api/admin/groups/${id}`);
}
