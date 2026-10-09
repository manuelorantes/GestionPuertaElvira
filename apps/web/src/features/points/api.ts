import { apiGet, apiSend } from '@/shared/api/client';

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

export interface Tournament {
  id: string;
  name: string;
  date: string;
  pointsPerPhoto: number;
  photos: number;
}

export interface TournamentDetail extends Tournament {
  students: { id: string; name: string; memberNumber: number | null; sent: boolean }[];
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

export async function fetchTournaments(month: string): Promise<Tournament[]> {
  return (await apiGet<{ items: Tournament[] }>(`${BASE}/tournaments?month=${month}`)).items;
}

export function fetchTournament(id: string): Promise<TournamentDetail> {
  return apiGet<TournamentDetail>(`${BASE}/tournaments/${id}`);
}

export async function saveTournament(
  input: { name: string; date: string; pointsPerPhoto: number },
  id?: string,
): Promise<string> {
  if (id) {
    await apiSend('PUT', `${BASE}/tournaments/${id}`, input);
    return id;
  }
  return (await apiSend<{ id: string }>('POST', `${BASE}/tournaments`, input)).id;
}

export function deleteTournament(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/tournaments/${id}`);
}

export function markTournamentPhoto(id: string, studentId: string, sent: boolean): Promise<void> {
  return apiSend('PUT', `${BASE}/tournaments/${id}/students/${studentId}`, { sent });
}
