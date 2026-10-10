import type { Role } from '@/features/auth/api';
import { apiGet, apiSend } from '@/shared/api/client';

export interface ClubUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: string;
  /** Emails adicionales con los que también se entra en la cuenta. */
  otherEmails: string[];
  /** Profesor vinculado (profesorado o administración que da clases), o null. */
  teacher: { id: string; name: string } | null;
  /** Último inicio de sesión o actividad, o null si nunca ha entrado. */
  lastSeenAt: string | null;
}

export async function fetchUsers(): Promise<ClubUser[]> {
  return (await apiGet<{ items: ClubUser[] }>('/api/admin/users')).items;
}

/** Devuelve la contraseña temporal, que solo se muestra esta vez. */
export async function createUser(input: {
  email: string;
  fullName: string;
  role: Role;
  /** Profesor al que se vincula una cuenta de profesorado. */
  teacherId?: string | null;
}): Promise<string> {
  return (await apiSend<{ temporaryPassword: string }>('POST', '/api/admin/users', input))
    .temporaryPassword;
}

export async function resetPassword(id: string): Promise<string> {
  return (
    await apiSend<{ temporaryPassword: string }>('POST', `/api/admin/users/${id}/password-reset`)
  ).temporaryPassword;
}

export function setEnabled(id: string, enabled: boolean): Promise<void> {
  return apiSend('POST', `/api/admin/users/${id}/${enabled ? 'enable' : 'disable'}`);
}

export function changeRole(id: string, role: Role): Promise<void> {
  return apiSend('PUT', `/api/admin/users/${id}/role`, { role });
}

/** Vincula una cuenta de profesorado a un profesor, o la desvincula con null. */
export function linkTeacher(id: string, teacherId: string | null): Promise<void> {
  return apiSend('PUT', `/api/admin/users/${id}/teacher`, { teacherId });
}

/** Añade otro email con el que también se entra en la cuenta. */
export function addUserEmail(id: string, email: string): Promise<void> {
  return apiSend('POST', `/api/admin/users/${id}/emails`, { email });
}

export function removeUserEmail(id: string, email: string): Promise<void> {
  return apiSend('DELETE', `/api/admin/users/${id}/emails`, { email });
}
