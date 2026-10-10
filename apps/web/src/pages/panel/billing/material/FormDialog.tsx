import { useState, type FormEvent, type ReactNode } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';

interface FormDialogProps {
  title: string;
  confirmLabel: string;
  size?: 'narrow' | 'wide';
  onClose: () => void;
  /** Devuelve un error de validación (y no envía), o hace la petición; si falla, se queda abierto con el error. */
  onSubmit: () => string | Promise<unknown>;
  children: ReactNode;
}

/** Diálogo de un formulario del material: título, campos, error y Cancelar / confirmar. */
export function FormDialog({
  title,
  confirmLabel,
  size = 'narrow',
  onClose,
  onSubmit,
  children,
}: FormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = onSubmit();
      if (typeof result === 'string') return setError(result);
      await result;
      onClose();
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} labelledBy="material-dialog-title" size={size}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="border-b border-line px-6 py-5">
          <h2
            id="material-dialog-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            {title}
          </h2>
        </div>
        <div className="flex flex-col gap-4 p-6">
          {error && <Alert>{error}</Alert>}
          {children}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} busyLabel="Guardando…">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
