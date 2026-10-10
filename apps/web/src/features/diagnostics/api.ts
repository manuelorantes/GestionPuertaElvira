import { apiGet, apiSend } from '@/shared/api/client';

export type FindingStatus = 'open' | 'accepted' | 'dismissed' | 'resolved';
export type Severity = 'money' | 'club' | 'form';
type EntityKind = 'student' | 'entry' | 'invoice' | 'teacher' | 'receipt' | 'club';

export interface Finding {
  id: string;
  rule: string;
  ruleTitle: string;
  severity: Severity;
  entity: { kind: EntityKind; id: string; label: string };
  explanation: string;
  proposal: string;
  hasFix: boolean;
  status: FindingStatus;
  detectedAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  closedBy: string | null;
}

export interface DiagnosisRun {
  startedAt: string;
  finishedAt: string;
  launchedBy: string;
  openCount: number;
  newCount: number;
  resolvedCount: number;
}

export interface Diagnosis {
  run: DiagnosisRun | null;
  items: Finding[];
}

export function fetchDiagnostics(status: FindingStatus): Promise<Diagnosis> {
  return apiGet(`/api/admin/diagnostics?status=${status}`);
}

export function runDiagnosis(): Promise<DiagnosisRun> {
  return apiSend('POST', '/api/admin/diagnostics/run');
}

export function acceptFinding(id: string): Promise<void> {
  return apiSend('POST', `/api/admin/diagnostics/findings/${id}/accept`);
}

export function dismissFinding(id: string): Promise<void> {
  return apiSend('POST', `/api/admin/diagnostics/findings/${id}/dismiss`);
}
