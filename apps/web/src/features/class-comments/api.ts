import { apiGet, apiSend } from '@/shared/api/client';

/** Comentario de una clase un día: de la clase en sí (sin alumno) o de un alumno de esa clase. */
export interface ClassComment {
  id: string;
  groupId: string;
  groupName: string;
  date: string;
  studentId: string | null;
  studentName: string | null;
  text: string;
  /** Profesor que lo escribió o, si fue administración, el nombre de su cuenta. */
  author: string;
  authorTeacherId: string | null;
  writtenAt: string;
  /** Solo en la lista del profesor: si es suyo y lo puede cambiar. */
  editable?: boolean;
}

export interface NewClassComment {
  studentId: string | null;
  text: string;
}

const items = async (path: string) => (await apiGet<{ items: ClassComment[] }>(path)).items;

// ---- Desde la lista del profesor ----------------------------------------------------------------

export function fetchRollCallComments(groupId: string, date: string): Promise<ClassComment[]> {
  return items(`/api/teacher/roll-calls/${groupId}/${date}/comments`);
}

export function addRollCallComment(
  groupId: string,
  date: string,
  comment: NewClassComment,
): Promise<{ id: string }> {
  return apiSend('POST', `/api/teacher/roll-calls/${groupId}/${date}/comments`, comment);
}

export function rewriteOwnComment(id: string, text: string): Promise<void> {
  return apiSend('PUT', `/api/teacher/comments/${id}`, { text });
}

export function removeOwnComment(id: string): Promise<void> {
  return apiSend('DELETE', `/api/teacher/comments/${id}`);
}

// ---- Desde administración -----------------------------------------------------------------------

export function fetchGroupComments(groupId: string, month: string): Promise<ClassComment[]> {
  return items(
    `/api/admin/attendance/groups/${groupId}/comments?month=${encodeURIComponent(month)}`,
  );
}

export function addGroupComment(
  groupId: string,
  comment: NewClassComment & { date: string },
): Promise<{ id: string }> {
  return apiSend('POST', `/api/admin/attendance/groups/${groupId}/comments`, comment);
}

export function rewriteComment(id: string, text: string): Promise<void> {
  return apiSend('PUT', `/api/admin/attendance/comments/${id}`, { text });
}

export function removeComment(id: string): Promise<void> {
  return apiSend('DELETE', `/api/admin/attendance/comments/${id}`);
}

export function fetchStudentComments(studentId: string): Promise<ClassComment[]> {
  return items(`/api/admin/students/${studentId}/class-comments`);
}
