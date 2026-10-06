import { ApiError, apiGet, apiSend } from '@/shared/api/client';

export type Role = 'superadministrator' | 'administrator' | 'teacher' | 'assistant';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

interface UserEnvelope {
  user: SessionUser;
}

/** Usuario de la sesión actual, o null si no hay sesión. */
export async function fetchSession(): Promise<SessionUser | null> {
  try {
    return (await apiGet<UserEnvelope>('/api/auth/me')).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function login(email: string, password: string): Promise<SessionUser> {
  return (await apiSend<UserEnvelope>('POST', '/api/auth/login', { email, password })).user;
}

export function logout(): Promise<void> {
  return apiSend('POST', '/api/auth/logout');
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiSend('PUT', '/api/auth/password', { currentPassword, newPassword });
}

export const ROLE_LABEL: Record<Role, string> = {
  superadministrator: 'Superadministración',
  administrator: 'Administración',
  teacher: 'Profesorado',
  assistant: 'Asistente',
};
