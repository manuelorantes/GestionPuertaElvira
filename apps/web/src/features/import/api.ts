import { apiSend } from '@/shared/api/client';

interface Candidate {
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
}

export interface ImportResult {
  created: number;
  linked: number;
  skipped: number;
  payments: number;
  members: number;
  entries: number;
}

export async function previewImport(text: string): Promise<PreviewRow[]> {
  return (await apiSend<{ rows: PreviewRow[] }>('POST', '/api/admin/import/preview', { text }))
    .rows;
}

export function applyImport(text: string, rows: Decision[]): Promise<ImportResult> {
  return apiSend('POST', '/api/admin/import/apply', { text, rows });
}
