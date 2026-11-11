import { Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  removeSignature,
  saveCertificateSigner,
  SIGNATURE_URL,
  uploadSignature,
  useCertificateSettings,
  useCertificateSettingsMutation,
  type CertificateSettings,
} from '@/features/students/certificates';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

/** Ajustes de los certificados de matrícula: quién los firma por defecto y su firma escaneada. */
export function CertificateSettingsCard() {
  const settings = useCertificateSettings();
  return (
    <Card className="flex flex-col gap-3 p-6">
      <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
        Certificados de matrícula
      </h2>
      {settings.data ? (
        <CertificateSettingsForm key={JSON.stringify(settings.data)} settings={settings.data} />
      ) : (
        <p className="text-sm text-ink-muted">
          {settings.isError ? apiErrorMessage(settings.error) : 'Cargando…'}
        </p>
      )}
    </Card>
  );
}

function CertificateSettingsForm({ settings }: { settings: CertificateSettings }) {
  const toast = useToast();
  const [signer, setSigner] = useState({ name: settings.signerName, role: settings.signerRole });
  const [error, setError] = useState<string | null>(null);
  // Cambia con cada subida: el navegador no reutiliza la imagen anterior.
  const [version, setVersion] = useState(() => Date.now());
  const file = useRef<HTMLInputElement>(null);
  const save = useCertificateSettingsMutation(saveCertificateSigner);
  const upload = useCertificateSettingsMutation(uploadSignature);
  const remove = useCertificateSettingsMutation(removeSignature);
  const nameChanged =
    signer.name.replace(/\s+/g, ' ').trim().toLowerCase() !== settings.signerName.toLowerCase();

  async function run(work: () => Promise<void>, message: string) {
    setError(null);
    try {
      await work();
      toast(message);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => save.mutateAsync(signer), 'Firmante guardado');
  }

  function pick(chosen: File | undefined) {
    if (!chosen) return;
    void run(async () => {
      await upload.mutateAsync(chosen);
      setVersion(Date.now());
    }, 'Firma subida');
    if (file.current) file.current.value = '';
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          Quién firma por defecto. Al emitir cada certificado se puede poner a otra persona, pero
          entonces se firma a mano.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Nombre de quien firma"
            value={signer.name}
            onChange={(e) => setSigner({ ...signer, name: e.target.value })}
            required
          />
          <TextField
            label="Cargo"
            value={signer.role}
            onChange={(e) => setSigner({ ...signer, role: e.target.value })}
            required
          />
        </div>
        {nameChanged && settings.signatureAvailable && (
          <Alert tone="warning">
            La firma escaneada es de {settings.signerName}: al guardar a otra persona se quita.
          </Alert>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" busy={save.isPending} busyLabel="Guardando…">
            Guardar firmante
          </Button>
        </div>
      </form>
      <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
        <p className="font-medium">Firma escaneada</p>
        {settings.signatureAvailable ? (
          <img
            src={`${SIGNATURE_URL}?v=${version}`}
            alt={`Firma de ${settings.signerName}`}
            className="h-24 w-fit max-w-full rounded-sm border border-line bg-white object-contain p-2"
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Sin firma subida: los certificados salen con el hueco para firmar a mano.
          </p>
        )}
        <p className="text-[13px] text-ink-muted">
          Imagen PNG (mejor con fondo transparente) o JPEG de hasta 2 MB. Solo la ve quien gestiona
          el club.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg"
            aria-label="Imagen de la firma"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            busy={upload.isPending}
            busyLabel="Subiendo…"
            onClick={() => file.current?.click()}
          >
            <Upload aria-hidden size={16} />
            {settings.signatureAvailable ? 'Cambiar firma' : 'Subir firma'}
          </Button>
          {settings.signatureAvailable && (
            <Button
              variant="secondary"
              busy={remove.isPending}
              busyLabel="Quitando…"
              onClick={() => void run(() => remove.mutateAsync(undefined), 'Firma quitada')}
            >
              <Trash2 aria-hidden size={16} />
              Quitar firma
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
