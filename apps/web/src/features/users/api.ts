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
