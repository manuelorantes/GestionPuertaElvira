import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  adjustCharge,
  resetCharge,
  type AccountCharge,
  type ChargeScope,
} from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { formatCents, monthLabel } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const SCOPES: { id: ChargeScope; label: string }[] = [
  { id: 'one', label: 'Solo este mes' },
  { id: 'rest', label: 'Este y los siguientes' },
];

function toCents(value: string): number | null {
  const normalised = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  return Math.round(Number(normalised) * 100);
}

/**
 * Fija a mano el importe de una cuota con un motivo (solo ese mes o también los siguientes de la temporada), o la
 * devuelve al importe calculado. Los cobros no cambian: lo cubierto se reparte solo.
 */
export function ChargeDialog({
  studentId,
  charge,
  onClose,
  onDone,
}: {
  studentId: string;
  charge: AccountCharge;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState(String(charge.amountCents / 100).replace('.', ','));
  const [reason, setReason] = useState(charge.note ?? '');
  const [scope, setScope] = useState<ChargeScope>('one');
  const save = useBillingMutation((input: { amountCents: number; reason: string }) =>
    adjustCharge(studentId, charge.period, { ...input, scope }),
  );
  const reset = useBillingMutation(() => resetCharge(studentId, charge.period));
  const cents = toCents(amount);
  const ready = cents !== null && reason.trim() !== '';
  const month = monthLabel(charge.period).toLowerCase();
  const error = save.error ?? reset.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (cents === null || !ready) return;
    void save.mutateAsync({ amountCents: cents, reason: reason.trim() }).then(
      () => onDone('Cuota cambiada'),
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="charge-dialog-title">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="charge-dialog-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Cuota de {month}
        </h2>
        {error && <Alert>{apiErrorMessage(error)}</Alert>}
        <p className="text-sm text-ink-muted">
          Ahora: {formatCents(charge.amountCents)}
          {charge.coveredCents > 0 && ` · cubiertos ${formatCents(charge.coveredCents)}`}
          {charge.manual && ' · fijada a mano'}. Los cobros y sus recibos no cambian: lo cubierto se
          reparte solo entre las cuotas, de la más antigua a la más reciente.
        </p>
        <TextField
          label="Importe (€)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={amount.trim() !== '' && cents === null ? 'Importe no válido.' : undefined}
        />
        <TextField
          label="Motivo"
          placeholder="Por ejemplo: entró a mitad de mes"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div role="group" aria-label="A qué cuotas afecta" className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <ToggleButton
              key={s.id}
              tone="ink"
              pressed={scope === s.id}
              onClick={() => setScope(s.id)}
              className="h-9 rounded-full font-medium"
            >
              {s.label}
            </ToggleButton>
          ))}
        </div>
        {scope === 'rest' && (
          <p className="-mt-2 text-[13px] text-ink-muted">
            Se aplica a {month} y a todos los meses siguientes hasta junio.
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
          {charge.manual ? (
            <Button
              variant="ghost"
              busy={reset.isPending}
              busyLabel="Volviendo…"
              onClick={() =>
                void reset.mutateAsync(undefined).then(
                  () => onDone('Cuota calculada de nuevo'),
                  () => undefined,
                )
              }
            >
              Volver a la calculada
            </Button>
          ) : (
            <span />
          )}
          <span className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!ready} busy={save.isPending} busyLabel="Guardando…">
              Guardar
            </Button>
          </span>
        </div>
      </form>
    </Dialog>
  );
}
