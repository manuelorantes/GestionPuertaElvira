import { apiGet, apiSend, apiUpload } from '@/shared/api/client';

export type PointsKind = 'friday' | 'tournament' | 'manual' | 'redemption';

export interface StudentPoints {
  id: string;
  name: string;
  memberNumber: number | null;
  /** Saldo del mes consultado. */
  points: number;
  seasonEarned: number;
  seasonRedeemed: number;
}

export interface PointMovement {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  delta: number;
  kind: PointsKind;
  concept: string;
  by: string | null;
}

export interface FridayGrid {
  month: string;
  fridays: { date: string; holiday: string | null }[];
  students: { id: string; name: string; memberNumber: number | null; present: string[] }[];
}

/** Una foto con la equipación oficial en un torneo (cada una da sus puntos en el mes de la foto). */
export interface TournamentPhoto {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  note: string | null;
  points: number;
}

const BASE = '/api/admin/points';

export async function fetchStudentPoints(month: string): Promise<StudentPoints[]> {
  return (await apiGet<{ items: StudentPoints[] }>(`${BASE}/students?month=${month}`)).items;
}

export async function fetchMovements(filter: {
  month?: string;
  kind?: PointsKind;
  student?: string;
}): Promise<PointMovement[]> {
  const query = new URLSearchParams(
    Object.entries(filter).filter((e): e is [string, string] => e[1] !== undefined),
  ).toString();
  return (await apiGet<{ items: PointMovement[] }>(`${BASE}/movements?${query}`)).items;
}

export function adjustPoints(studentId: string, delta: number, note: string): Promise<void> {
  return apiSend('POST', `${BASE}/adjustments`, { studentId, delta, note });
}

export function fetchFridays(month: string): Promise<FridayGrid> {
  return apiGet<FridayGrid>(`${BASE}/fridays?month=${month}`);
}

export function markFriday(date: string, studentId: string, present: boolean): Promise<void> {
  return apiSend('PUT', `${BASE}/fridays/${date}/students/${studentId}`, { present });
}

export async function fetchPhotos(month: string): Promise<TournamentPhoto[]> {
  return (await apiGet<{ items: TournamentPhoto[] }>(`${BASE}/photos?month=${month}`)).items;
}

/** La imagen de una foto (la sirve la API con la sesión). */
export function photoUrl(id: string): string {
  return `${BASE}/photos/${id}/file`;
}

export async function addPhoto(input: {
  studentId: string;
  date: string;
  note: string;
  file: Blob;
}): Promise<string> {
  const form = new FormData();
  form.append('studentId', input.studentId);
  form.append('date', input.date);
  form.append('note', input.note);
  form.append('file', input.file, 'foto.jpg');
  return (await apiUpload<{ id: string }>(`${BASE}/photos`, form)).id;
}

export function deletePhoto(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/photos/${id}`);
}
