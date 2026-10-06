import { apiSend } from '@/shared/api/client';

export interface Candidate {
  id: string;
  fullName: string;
}

/** Una fila de la hoja ya leída y casada con los alumnos existentes. */
export interface PreviewRow {
  line: number;
  fullName: string;
  birthDate: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  email: string | null;
  membershipCents: number | null;
  kitCents: number | null;
  federationCents: number | null;
  monthlyCents: Record<string, number>;
  warnings: string[];
  match: Candidate | null;
  suggestions: Candidate[];
  /** Lo escrito en las columnas de grupo y el grupo encontrado (null si no se encontró o es ambiguo). */
  groups: { text: string; groupId: string | null }[];
}

type DecisionAction = 'link' | 'create' | 'skip';

export interface Decision {
  line: number;
  action: DecisionAction;
  studentId?: string;
  groupIds?: string[];
  fullName?: string;
  birthDate?: string;
  guardianName?: string;
  guardianPhone?: string;
  email?: string;
  /** Crear aunque haya un alumno parecido (ya avisado). */
  confirmDuplicate?: boolean;
}

/** Resultado de importar una fila. */
export interface ImportResult {
  line: number;
  action: DecisionAction;
  studentId: string | null;
  studentName: string;
  payments: number;
  member: boolean;
  entries: number;
}

export async function previewImport(text: string): Promise<PreviewRow[]> {
  return (await apiSend<{ rows: PreviewRow[] }>('POST', '/api/admin/import/preview', { text }))
    .rows;
}

/** Importa una sola fila: cada una es su propia acción del historial. */
export function importRow(text: string, row: Decision): Promise<ImportResult> {
  return apiSend('POST', '/api/admin/import/rows', { text, row });
}
