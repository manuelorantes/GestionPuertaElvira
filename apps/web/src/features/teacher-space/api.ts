import { apiGet } from '@/shared/api/client';

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
