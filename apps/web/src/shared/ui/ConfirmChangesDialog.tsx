import type { ReactNode } from 'react';

import { Alert } from './Alert';
import { Button } from './Button';
import { Dialog } from './Dialog';
import type { FieldChange } from './fieldChanges';

interface ConfirmChangesDialogProps {
  changes: FieldChange[];
  /** Aviso de lo que no cambia en otra parte (p. ej. el recibo). */
  warning?: string | null | undefined;
  /** Opciones sobre cómo guardar (p. ej. una casilla), entre la lista y el aviso. */
  children?: ReactNode;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}

/** «¿Guardar estos cambios?»: la lista de lo que cambia («Importe: 45 € → 40 €») antes de guardarlo. */
export function ConfirmChangesDialog({
  changes,
  warning = null,
  children,
  busy,
  error,
  onBack,
  onConfirm,
}: ConfirmChangesDialogProps) {
  return (
    <Dialog open onClose={onBack} labelledBy="confirm-changes-title">
      <div className="flex flex-col gap-4 p-6">
        <h2
          id="confirm-changes-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          ¿Guardar estos cambios?
        </h2>
        {error && <Alert>{error}</Alert>}
        <ul className="flex flex-col gap-1 text-sm">
          {changes.map(([field, before, after]) => (
            <li key={field}>{`${field}: ${before} → ${after}`}</li>
          ))}
        </ul>
        {children}
        {warning && <Alert tone="warning">{warning}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onBack}>
            Volver
          </Button>
          <Button busy={busy} busyLabel="Guardando…" onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
