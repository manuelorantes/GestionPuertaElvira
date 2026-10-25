import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { type Account, recordTransfer } from '@/features/accounting/api';
import { useAccountingMutation } from '@/features/accounting/hooks';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

/** El sentido se elige por el origen; el destino es la otra cuenta. */
const DIRECTIONS: { from: Account; label: string }[] = [
  { from: 'cash', label: 'De caja al banco' },
  { from: 'bank', label: 'Del banco a caja' },
];

const other = (account: Account): Account => (account === 'cash' ? 'bank' : 'cash');

/** «Traspasar dinero»: mover efectivo al banco o sacar efectivo; lo que tiene el club no cambia. */
export function TransferDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState<Account>('cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const save = useAccountingMutation(recordTransfer);
  const toast = useToast();
  const year = new Date().getFullYear();
  const invalid = !amount.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    await save
      .mutateAsync({
        date,
        from,
        to: other(from),
        amount: amount.trim(),
        note: note.trim(),
      })
      .then(
        () => {
          toast('Traspaso guardado');
          onClose();
        },
        () => undefined,
      );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="transfer-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="transfer-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Traspasar dinero
        </h2>
        <p className="text-sm text-ink-soft">
          Mueve dinero entre caja y banco. El saldo del club no cambia.
        </p>
        {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
        <div role="group" aria-label="Sentido" className="flex gap-2">
          {DIRECTIONS.map((d) => (
            <ToggleButton
              key={d.from}
              pressed={from === d.from}
              onClick={() => setFrom(d.from)}
              className="h-11 flex-1"
            >
              {d.label}
            </ToggleButton>
          ))}
        </div>
        <DateField
          label="Fecha"
          value={date}
          onChange={setDate}
          fromYear={year - 2}
          toYear={year + 1}
        />
        <TextField
          label="Importe (€)"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Nota"
          placeholder="Opcional"
          maxLength={120}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid} busy={save.isPending} busyLabel="Guardando…">
            Traspasar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
