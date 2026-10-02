import { useState, type FormEvent } from 'react';

import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';

interface PickerDialogProps {
  title: string;
  label: string;
  options: { value: string; label: string }[];
  confirmLabel: string;
  onClose: () => void;
  onPick: (value: string) => Promise<unknown>;
}

/** Diálogo para elegir una opción (grupo destino, hermano…) y confirmar. */
export function PickerDialog({
  title,
  label,
  options,
  confirmLabel,
  onClose,
  onPick,
}: PickerDialogProps) {
  const [value, setValue] = useState(options[0]?.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await onPick(value);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} labelledBy="picker-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="picker-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {title}
        </h2>
        {error && <Alert>{error}</Alert>}
        {options.length === 0 ? (
          <Alert tone="info">No hay opciones disponibles.</Alert>
        ) : (
          <Select label={label} options={options} value={value} onChange={setValue} />
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} busyLabel="Guardando…" disabled={!value}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
