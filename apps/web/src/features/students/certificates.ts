import { useMutation, useQuery } from '@tanstack/react-query';

import { apiGet, apiSend, apiUpload } from '@/shared/api/client';
import { useRefreshClubData } from '@/shared/useRefreshClubData';

/** La firma escaneada (solo para quien gestiona el club): se pinta tal cual en el certificado. */
export const SIGNATURE_URL = '/api/admin/students/certificate-signature';

export interface CertificateSigner {
  name: string;
  role: string;
}

/** Lo que se propone al emitir: sus datos, el curso y el horario de hoy, Granada y el firmante por defecto. */
export interface CertificateDraft {
  studentName: string;
  nationalId: string | null;
  memberSince: string;
  season: string;
  schedule: string;
  place: string;
  issuedOn: string;
  signer: CertificateSigner;
  signatureAvailable: boolean;
}

export interface CertificatePayload {
  nationalId: string;
  season: string;
  schedule: string;
  place: string;
  issuedOn: string;
  signerName: string;
  signerRole: string;
  signed: boolean;
}

/** Un certificado emitido, tal como se certificó. */
export interface IssuedCertificate {
  id: string;
  studentName: string;
  nationalId: string;
  season: string;
  schedule: string;
  memberSince: string;
  place: string;
  issuedOn: string;
  signer: CertificateSigner;
  signed: boolean;
  issuedByName: string | null;
  createdAt: string;
}

export interface PrintableCertificate extends IssuedCertificate {
  club: { name: string; taxId: string; address: string };
}

export interface CertificateSettings {
  signerName: string;
  signerRole: string;
  signatureAvailable: boolean;
}

const base = (studentId: string) => `/api/admin/students/${studentId}/certificates`;

/** El mismo firmante sin mirar espacios ni mayúsculas (como la API). */
export function sameSigner(a: CertificateSigner, b: CertificateSigner): boolean {
  const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(a.name) === norm(b.name) && norm(a.role) === norm(b.role);
}

export function useCertificateDraft(studentId: string) {
  return useQuery({
    queryKey: ['student', studentId, 'certificates', 'draft'],
    queryFn: () => apiGet<CertificateDraft>(`${base(studentId)}/draft`),
    // Siempre lo de hoy: la fecha, el horario y la firma pueden haber cambiado.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCertificates(studentId: string) {
  return useQuery({
    queryKey: ['student', studentId, 'certificates'],
    queryFn: async () => (await apiGet<{ items: IssuedCertificate[] }>(base(studentId))).items,
  });
}

export function useCertificate(studentId: string, id: string | null) {
  return useQuery({
    queryKey: ['student', studentId, 'certificates', id],
    queryFn: () => apiGet<PrintableCertificate>(`${base(studentId)}/${id}`),
    enabled: id !== null,
  });
}

export function useIssueCertificate(studentId: string) {
  const refresh = useRefreshClubData();
  return useMutation({
    mutationFn: (payload: CertificatePayload) =>
      apiSend<PrintableCertificate>('POST', base(studentId), payload),
    onSuccess: refresh,
  });
}

export function useCertificateSettings() {
  return useQuery({
    queryKey: ['certificate-settings'],
    queryFn: () => apiGet<CertificateSettings>('/api/admin/students/certificate-settings'),
  });
}

export function useCertificateSettingsMutation<Variables>(
  mutationFn: (variables: Variables) => Promise<void>,
) {
  const refresh = useRefreshClubData();
  return useMutation({ mutationFn, onSuccess: refresh });
}

export function saveCertificateSigner(signer: CertificateSigner): Promise<void> {
  return apiSend('PUT', '/api/admin/students/certificate-settings', {
    signerName: signer.name,
    signerRole: signer.role,
  });
}

export function uploadSignature(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload(SIGNATURE_URL, form);
}

export function removeSignature(): Promise<void> {
  return apiSend('DELETE', SIGNATURE_URL);
}
