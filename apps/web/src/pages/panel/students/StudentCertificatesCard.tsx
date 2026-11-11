import { FileText } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { periodLabel, useCertificates } from '@/features/students/certificates';
import { formatDate } from '@/features/students/format';
import { Card } from '@/shared/ui/Card';

import { SavedCertificateDialog } from './CertificateDialog';

/** Tarjeta «Certificados emitidos» de la ficha: el registro de los certificados, y cada uno se vuelve a imprimir. */
export function StudentCertificatesCard({
  studentId,
  title,
}: {
  studentId: string;
  title: (text: string) => ReactNode;
}) {
  const certificates = useCertificates(studentId);
  const [open, setOpen] = useState<string | null>(null);
  const items = certificates.data ?? [];

  return (
    <Card className="p-4">
      {title('Certificados emitidos')}
      {certificates.isPending && <p className="text-sm text-ink-muted">Cargando…</p>}
      {certificates.isError && (
        <p className="text-sm text-ink-muted">No se han podido cargar sus certificados.</p>
      )}
      {certificates.isSuccess && items.length === 0 && (
        <p className="text-sm text-ink-muted">Sin certificados emitidos.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Certificados emitidos" className="flex flex-col divide-y divide-line-soft">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c.id)}
                className="flex w-full cursor-pointer items-center gap-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <FileText aria-hidden size={16} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {periodLabel(c)} · {formatDate(c.issuedOn)}
                  </span>
                  <span className="block text-[12px] text-ink-muted">
                    {c.signer.name} ({c.signer.role}) ·{' '}
                    {c.signed ? 'con firma escaneada' : 'para firmar a mano'}
                    {c.issuedByName && ` · emitido por ${c.issuedByName}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && (
        <SavedCertificateDialog
          studentId={studentId}
          certificateId={open}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}
