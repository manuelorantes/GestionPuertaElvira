import { apiGet, apiSend } from '@/shared/api/client';

export type StudentFilter = 'all' | 'active' | 'withdrawn' | 'siblings';

export interface StudentSummary {
  id: string;
  fullName: string;
  age: number;
  status: 'active' | 'withdrawn';
  groups: { id: string; name: string; slotLabel: string }[];
  hasSiblings: boolean;
}

interface Guardian {
  name: string;
  phone: string;
}

export interface StudentDetail {
  id: string;
  fullName: string;
  birthDate: string;
  age: number;
  nationalId: string | null;
  contactEmail: string | null;
  guardians: Guardian[];
  ownPhone: string | null;
  federationLicence: string | null;
  imageConsent: boolean;
  joinedOn: string;
  withdrawnOn: string | null;
  status: 'active' | 'withdrawn';
  groups: { id: string; name: string; slotLabel: string; teacherName: string; classroom: string }[];
  siblings: { id: string; fullName: string }[];
}

export interface StudentPayload {
  fullName: string;
  birthDate: string;
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
