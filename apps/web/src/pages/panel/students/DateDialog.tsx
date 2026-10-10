import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';

interface DateDialogProps {
  title: string;
  label: string;
  initial: string;
  help?: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (date: string) => Promise<unknown>;
}

/** Elegir una fecha (p. ej. desde cuándo está en un grupo); si falla, se queda abierto con el error. */
export function DateDialog({
  title,
  label,
  initial,
  help,
  confirmLabel,
  onClose,
  onConfirm,
}: DateDialogProps) {
  const [date, setDate] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date) return setError('Indica la fecha.');
    setBusy(true);
    try {
      await onConfirm(date);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} labelledBy="date-dialog-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="date-dialog-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {title}
        </h2>
        {error && <Alert>{error}</Alert>}
        <DateField
          label={label}
          value={date}
          onChange={setDate}
          fromYear={year - 5}
          toYear={year}
        />
        {help && <p className="text-sm text-ink-muted">{help}</p>}
        <div className="flex justify-end gap-3">
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
