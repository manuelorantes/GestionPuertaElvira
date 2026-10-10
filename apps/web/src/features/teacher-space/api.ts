import type { GroupAttendance } from '@/features/attendance/api';
import type { ClassComment } from '@/features/class-comments/api';
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
  /** Actividad del club: turno normal o la de los viernes (null en las clases). */
  activity: 'shift' | 'fridays' | null;
  classroom: string | null;
  students: number;
  /** null en los turnos, que no tienen lista. */
  rollCall: RollCallStatus | null;
}

export interface RosterStudent {
  id: string;
  name: string;
}

export interface RollCall extends TeacherClass {
  /** Aún no se puede pasar, está en plazo o es una lista pasada (se cambia confirmándolo). */
  period: 'upcoming' | 'open' | 'past';
  list: { id: string; name: string; present: boolean }[];
  /** Alumnos de fuera de la clase que vinieron (asistencia especial). */
  guests: RosterStudent[];
  /** Alumnos del club que se pueden añadir como asistencia especial. */
  others: RosterStudent[];
}

/** Quién falta de la lista, quién vino de fuera y, en una lista pasada, la confirmación de cambiarla. */
export interface RollCallChanges {
  absent: string[];
  guests: string[];
  past: boolean;
}

/** Uno de sus grupos (o de los que sustituye esa semana), con sus alumnos y su asistencia de la temporada. */
export interface TeacherGroup {
  groupId: string;
  name: string;
  days: string[];
  start: string;
  end: string;
  classroom: string;
  /** Lo ve porque sustituye en él a 7 días o menos. */
  substitution: boolean;
  /** `attended` de `classes`: clases con lista pasada de la temporada en ese grupo. */
  students: { id: string; name: string; days: string[]; attended: number; classes: number }[];
}

/** Comentarios de 4 en 4 semanas hacia atrás; `nextBefore` es null al llegar al principio de la temporada. */
export interface TeacherGroupComments {
  items: ClassComment[];
  nextBefore: string | null;
}

const BASE = '/api/teacher';

export async function fetchClasses(from: string, to: string): Promise<TeacherClass[]> {
  return (await apiGet<{ items: TeacherClass[] }>(`${BASE}/classes?from=${from}&to=${to}`)).items;
}

export async function fetchGroups(): Promise<TeacherGroup[]> {
  return (await apiGet<{ items: TeacherGroup[] }>(`${BASE}/groups`)).items;
}

export function fetchTeacherGroupAttendance(
  groupId: string,
  month: string,
): Promise<GroupAttendance> {
  return apiGet<GroupAttendance>(`${BASE}/groups/${groupId}/attendance?month=${month}`);
}

export function fetchTeacherGroupComments(
  groupId: string,
  before: string | null,
): Promise<TeacherGroupComments> {
  const query = before === null ? '' : `?before=${before}`;
  return apiGet<TeacherGroupComments>(`${BASE}/groups/${groupId}/comments${query}`);
}

export function fetchRollCall(groupId: string, date: string): Promise<RollCall> {
  return apiGet<RollCall>(`${BASE}/roll-calls/${groupId}/${date}`);
}

/** Guarda la lista: los ausentes (el resto vino) y la asistencia especial. */
export function saveRollCall(
  groupId: string,
  date: string,
  changes: RollCallChanges,
): Promise<void> {
  return apiSend('PUT', `${BASE}/roll-calls/${groupId}/${date}`, changes);
}

export interface TeacherPayMonth {
  month: string;
  minutes: number;
  amountCents: number;
  advancesCents: number;
  toPayCents: number;
  status: 'paid' | 'pending' | 'none';
  paidOn: string | null;
}

export interface TeacherPayStatus {
  season: number;
  months: TeacherPayMonth[];
  totals: { minutes: number; amountCents: number; receivedCents: number; owedCents: number };
}

export function fetchPay(): Promise<TeacherPayStatus> {
  return apiGet<TeacherPayStatus>(`${BASE}/pay`);
}

/** El encargado de un turno confirma que lo hizo. */
export function markShiftDone(dutyId: string, date: string): Promise<void> {
  return apiSend('POST', `${BASE}/activities/${dutyId}/${date}/done`);
}

/** La lista de los viernes del encargado: propuestos (marcados si ya vinieron) y todos para el buscador. */
export interface FridayList extends TeacherClass {
  list: { id: string; name: string; present: boolean }[];
  everyone: { id: string; name: string }[];
}

export function fetchFridayList(dutyId: string, date: string): Promise<FridayList> {
  return apiGet<FridayList>(`${BASE}/fridays/${dutyId}/${date}`);
}

export function markFriday(
  dutyId: string,
  date: string,
  studentId: string,
  present: boolean,
): Promise<void> {
  return apiSend('PUT', `${BASE}/fridays/${dutyId}/${date}/students/${studentId}`, { present });
}
