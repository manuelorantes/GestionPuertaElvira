import { useEffect, useRef } from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <Dialog open onClose={onCancel} labelledBy="confirm-title">
      <div className="flex flex-col gap-3 p-6">
        <h2
          id="confirm-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {title}
        </h2>
        <p className="text-[15px] text-ink-soft">{message}</p>
        <div className="mt-2 flex justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} busy={busy} busyLabel="Guardando…">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
