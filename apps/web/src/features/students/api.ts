import { apiGet, apiSend } from '@/shared/api/client';

/** `no_classes`: socios activos sin ningún grupo. */
export type StudentFilter = 'all' | 'active' | 'withdrawn' | 'siblings' | 'no_classes';

/** Datos esperados que pueden faltar en un alumno (ver Datos pendientes). */
export type MissingDatum = 'birth_date' | 'guardian' | 'guardian_phone' | 'phone' | 'email';

export interface StudentSummary {
  id: string;
  fullName: string;
  /** null si no consta la fecha de nacimiento. */
  age: number | null;
  status: 'active' | 'withdrawn';
  groups: { id: string; name: string; slotLabel: string }[];
  hasSiblings: boolean;
}

interface Guardian {
  name: string;
  phone: string | null;
}

export interface StudentDetail {
  id: string;
  fullName: string;
  birthDate: string | null;
  age: number | null;
  nationalId: string | null;
  contactEmail: string | null;
  guardians: Guardian[];
  ownPhone: string | null;
  federationLicence: string | null;
  imageConsent: boolean;
  missingData: MissingDatum[];
  joinedOn: string;
  withdrawnOn: string | null;
  status: 'active' | 'withdrawn';
  groups: { id: string; name: string; slotLabel: string; teacherName: string; classroom: string }[];
  siblings: { id: string; fullName: string }[];
}

export interface StudentPayload {
  fullName: string;
  /** null si no se sabe. */
  birthDate: string | null;
  nationalId: string | null;
  contactEmail: string | null;
  guardians: Guardian[];
  ownPhone: string | null;
  federationLicence: string | null;
  imageConsent: boolean;
}

export interface Registration extends StudentPayload {
  groupIds: string[];
  siblingIds: string[];
}

export async function fetchStudents(
  filter: StudentFilter,
  search: string,
): Promise<{ items: StudentSummary[]; total: number }> {
  const query = `filter=${filter}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`;
  return apiGet(`/api/admin/students?${query}`);
}

export interface PendingStudent {
  id: string;
  fullName: string;
  missing: MissingDatum[];
}

/** Alumnos activos a los que falta algún dato esperado. */
export function fetchPendingData(): Promise<{ items: PendingStudent[] }> {
  return apiGet('/api/admin/students/pending-data');
}

export function fetchStudent(id: string): Promise<StudentDetail> {
  return apiGet(`/api/admin/students/${id}`);
}

export async function registerStudent(
  registration: Registration,
  confirmOverCapacity: boolean,
): Promise<string> {
  return (
    await apiSend<{ id: string }>('POST', '/api/admin/students', {
      ...registration,
      confirmOverCapacity,
    })
  ).id;
}

export function updateStudent(id: string, payload: StudentPayload): Promise<void> {
  return apiSend('PUT', `/api/admin/students/${id}`, payload);
}

export function withdrawStudent(id: string, date: string): Promise<void> {
  return apiSend('POST', `/api/admin/students/${id}/withdrawal`, { date });
}

export function addGroup(id: string, groupId: string, confirmOverCapacity: boolean): Promise<void> {
  return apiSend('POST', `/api/admin/students/${id}/enrolments`, { groupId, confirmOverCapacity });
}

export function removeGroup(id: string, groupId: string): Promise<void> {
  return apiSend('DELETE', `/api/admin/students/${id}/enrolments/${groupId}`);
}

export function moveGroup(
  id: string,
  fromGroupId: string,
  toGroupId: string,
  confirmOverCapacity: boolean,
): Promise<void> {
  return apiSend('POST', `/api/admin/students/${id}/enrolments/${fromGroupId}/move`, {
    toGroupId,
    confirmOverCapacity,
  });
}

export function linkSibling(id: string, siblingId: string): Promise<void> {
  return apiSend('POST', `/api/admin/students/${id}/siblings`, { siblingId });
}

export function unlinkSibling(id: string, siblingId: string): Promise<void> {
  return apiSend('DELETE', `/api/admin/students/${id}/siblings/${siblingId}`);
}
