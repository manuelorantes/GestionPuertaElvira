import { Printer } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  sameSigner,
  useCertificate,
  useCertificateDraft,
  useIssueCertificate,
  type CertificateDraft,
  type PrintableCertificate,
} from '@/features/students/certificates';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';

import { CertificateSheet } from './CertificateSheet';

/**
 * Emitir un certificado de matrícula: se propone todo desde la ficha (DNI, curso, horario, lugar, fecha y firmante) y,
 * al emitirlo, queda registrado y sale la hoja lista para imprimir.
 */
export function CertificateDialog({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const draft = useCertificateDraft(studentId);
  const [issued, setIssued] = useState<PrintableCertificate | null>(null);
  if (issued) return <PrintCertificateDialog certificate={issued} onClose={onClose} />;
  return (
    <Dialog open onClose={onClose} labelledBy="certificate-title" size="wide">
      {draft.data ? (
        <CertificateForm
          studentId={studentId}
          draft={draft.data}
          onIssued={setIssued}
          onClose={onClose}
        />
      ) : (
        <p id="certificate-title" className="p-6 text-ink-muted">
          {draft.isError ? apiErrorMessage(draft.error) : 'Preparando el certificado…'}
        </p>
      )}
    </Dialog>
  );
}

function CertificateForm({
  studentId,
  draft,
  onIssued,
  onClose,
}: {
  studentId: string;
  draft: CertificateDraft;
  onIssued: (certificate: PrintableCertificate) => void;
  onClose: () => void;
}) {
  const issue = useIssueCertificate(studentId);
  const [values, setValues] = useState({
    nationalId: draft.nationalId ?? '',
    season: draft.season,
    schedule: draft.schedule,
    place: draft.place,
    issuedOn: draft.issuedOn,
    signerName: draft.signer.name,
    signerRole: draft.signer.role,
  });
  const [wantsSignature, setWantsSignature] = useState(draft.signatureAvailable);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const isDefaultSigner = sameSigner(
    { name: values.signerName, role: values.signerRole },
    draft.signer,
  );
  const canSign = draft.signatureAvailable && isDefaultSigner;
  const signed = canSign && wantsSignature;
  const year = Number(draft.issuedOn.slice(0, 4));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (values.nationalId.trim() === '') return setError('Escribe el DNI o NIE del alumno.');
    setError(null);
    try {
      onIssued(await issue.mutateAsync({ ...values, signed }));
    } catch (failure) {
      setError(apiErrorMessage(failure));
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
      <h2
        id="certificate-title"
        className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
      >
        Certificado de matrícula
      </h2>
      <p className="text-sm text-ink-muted">
        De {draft.studentName}, en el club desde el {formatDate(draft.memberSince)}.
      </p>
      {error && <Alert>{error}</Alert>}
      <TextField
        label="DNI o NIE"
        value={values.nationalId}
        onChange={(e) => set('nationalId')(e.target.value)}
        help={
          draft.nationalId === null
            ? 'No consta en su ficha: se guardará en ella.'
            : 'Si lo cambias, también se cambia en su ficha.'
        }
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Curso"
          value={values.season}
          onChange={(e) => set('season')(e.target.value)}
          required
        />
        <TextField
          label="Lugar"
          value={values.place}
          onChange={(e) => set('place')(e.target.value)}
          required
        />
      </div>
      <TextField
        label="Horario de clase"
        value={values.schedule}
        onChange={(e) => set('schedule')(e.target.value)}
        help={
          draft.schedule === ''
            ? 'No tiene grupos: escribe el horario.'
            : 'El de sus grupos de hoy; se puede cambiar.'
        }
        required
      />
      <DateField
        label="Fecha del certificado"
        value={values.issuedOn}
        onChange={set('issuedOn')}
        fromYear={year - 1}
        toYear={year + 1}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Firma"
          value={values.signerName}
          onChange={(e) => set('signerName')(e.target.value)}
          required
        />
        <TextField
          label="Cargo"
          value={values.signerRole}
          onChange={(e) => set('signerRole')(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Switch
          label="Con la firma escaneada"
          checked={signed}
          onChange={setWantsSignature}
          disabled={!canSign}
        />
        <p className="text-[13px] text-ink-muted">
          {!draft.signatureAvailable
            ? 'No hay firma escaneada subida (Cobros › Tarifas y ajustes): se firmará a mano.'
            : !isDefaultSigner
              ? `La firma escaneada es la de ${draft.signer.name} (${draft.signer.role}): con otro firmante, se firma a mano.`
              : signed
                ? 'Sale firmado; solo queda imprimirlo.'
                : 'Sale con el hueco para firmarlo a mano.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" busy={issue.isPending} busyLabel="Emitiendo…">
          Emitir certificado
        </Button>
      </div>
    </form>
  );
}

/** La hoja del certificado con «Imprimir» (desde el diálogo de impresión, también «Guardar como PDF»). */
function PrintCertificateDialog({
  certificate,
  onClose,
}: {
  certificate: PrintableCertificate;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} labelledBy="certificate-print-title" size="large">
      <div className="flex items-center justify-between border-b border-line px-6 py-5 print:hidden">
        <h2
          id="certificate-print-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Certificado de {certificate.studentName}
        </h2>
      </div>
      <div className="max-h-[70vh] overflow-auto bg-surface-muted p-6 print:max-h-none print:bg-transparent print:p-0">
        <CertificateSheet certificate={certificate} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 print:hidden">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        <Button onClick={() => window.print()} className="inline-flex items-center gap-2">
          <Printer aria-hidden size={18} />
          Imprimir
        </Button>
      </div>
    </Dialog>
  );
}

/** Vuelve a abrir un certificado ya emitido para imprimirlo otra vez. */
export function SavedCertificateDialog({
  studentId,
  certificateId,
  onClose,
}: {
  studentId: string;
  certificateId: string;
  onClose: () => void;
}) {
  const certificate = useCertificate(studentId, certificateId);
  if (certificate.data) {
    return <PrintCertificateDialog certificate={certificate.data} onClose={onClose} />;
  }
  return (
    <Dialog open onClose={onClose} labelledBy="certificate-loading">
      <p id="certificate-loading" className="p-6 text-ink-muted">
        {certificate.isError ? apiErrorMessage(certificate.error) : 'Cargando certificado…'}
      </p>
    </Dialog>
  );
}
