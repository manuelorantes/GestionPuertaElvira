import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';

interface WithdrawDialogProps {
  name: string;
  onClose: () => void;
  onWithdraw: (date: string) => Promise<unknown>;
}

export function WithdrawDialog({ name, onClose, onWithdraw }: WithdrawDialogProps) {
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date) return setError('Indica la fecha de baja.');
    setBusy(true);
    try {
      await onWithdraw(date);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} labelledBy="withdraw-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="withdraw-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Dar de baja a {name}
        </h2>
        {error && <Alert>{error}</Alert>}
        <DateField
          label="Fecha de baja"
          value={date}
          onChange={setDate}
          fromYear={year}
          toYear={year + 1}
        />
        <p className="text-sm text-ink-muted">Desde ese día deja de ocupar plaza en sus grupos.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} busyLabel="Guardando…">
            Dar de baja
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
