import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  adjustCharge,
  resetCharge,
  setChargeDiscount,
  type AccountCharge,
  type ChargeScope,
  type PaidChargePolicy,
} from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { centsFromText, formatCents, monthLabel } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ConfirmChangesDialog } from '@/shared/ui/ConfirmChangesDialog';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const SCOPES: { id: ChargeScope; label: string }[] = [
  { id: 'one', label: 'Solo este mes' },
  { id: 'rest', label: 'Este y los siguientes' },
];

/**
 * Fija a mano el importe de una cuota con un motivo (solo ese mes o también los siguientes de la temporada), o la
 * devuelve al importe calculado. Al bajarla por debajo de lo que ya tiene cubierto se confirma antes qué pasa con la
 * diferencia: corregir el cobro que la pagó (por defecto) o dejarla como saldo a favor.
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
  /** Segundo paso, al bajar una cuota con algo cubierto: si se corrige el cobro que la pagó. */
  const [confirming, setConfirming] = useState(false);
  const [correctPayment, setCorrectPayment] = useState(true);
  const save = useBillingMutation(
    (input: { amountCents: number; reason: string; onPaid?: PaidChargePolicy }) =>
      adjustCharge(studentId, charge.period, { ...input, scope }),
  );
  const reset = useBillingMutation(() => resetCharge(studentId, charge.period));
  const [discount, setDiscount] = useState(String(charge.discountPercent));
  const applyDiscount = useBillingMutation((percent: number) =>
    setChargeDiscount(studentId, charge.period, percent),
  );
  const cents = centsFromText(amount);
  const ready = cents !== null && reason.trim() !== '';
  const month = monthLabel(charge.period).toLowerCase();
  const error = save.error ?? reset.error ?? applyDiscount.error;

  const surplusCents = cents === null ? 0 : charge.coveredCents - cents;

  function store(onPaid?: PaidChargePolicy) {
    if (cents === null || !ready) return;
    void save
      .mutateAsync({ amountCents: cents, reason: reason.trim(), ...(onPaid && { onPaid }) })
      .then(
        () => onDone('Cuota cambiada'),
        () => undefined,
      );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (surplusCents > 0) setConfirming(true);
    else store();
  }

  if (confirming && cents !== null) {
    return (
      <ConfirmChangesDialog
        changes={[['Importe', formatCents(charge.amountCents), formatCents(cents)]]}
        busy={save.isPending}
        error={save.isError ? apiErrorMessage(save.error) : null}
        onBack={() => {
          save.reset();
          setConfirming(false);
        }}
        onConfirm={() => store(correctPayment ? 'correct_payment' : 'keep_credit')}
      >
        <p className="text-sm text-ink-muted">
          Esta cuota ya tiene cubiertos {formatCents(charge.coveredCents)}
          {scope === 'rest' && ', y puede que alguno de los meses siguientes también'}.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={correctPayment}
            onChange={(e) => setCorrectPayment(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Cambiar la cantidad pagada</span>
            <span className="block text-[13px] text-ink-muted">
              {correctPayment
                ? `El recibo que cubrió la cuota pasa a tener ${formatCents(surplusCents)} menos, con una línea de corrección.`
                : `La diferencia (${formatCents(surplusCents)}) se quedará como saldo a favor del alumno.`}
            </span>
          </span>
        </label>
      </ConfirmChangesDialog>
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
          {charge.manual && ' · fijada a mano'}. Lo cubierto se reparte solo entre las cuotas, de la
          más antigua a la más reciente; si bajas una cuota ya cubierta, antes de guardar se elige
          qué pasa con la diferencia.
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
        <div className="flex flex-wrap items-end gap-3 rounded-sm bg-surface-muted p-3">
          <Select
            label="Descuento por pago adelantado"
            options={[
              { value: '0', label: 'Sin descuento' },
              { value: '10', label: '10 % (3 meses)' },
              { value: '15', label: '15 % (6 meses)' },
              { value: '20', label: '20 % (todo el año)' },
            ]}
            value={discount}
            onChange={setDiscount}
          />
          <Button
            variant="secondary"
            disabled={Number(discount) === charge.discountPercent}
            busy={applyDiscount.isPending}
            busyLabel="Aplicando…"
            onClick={() =>
              void applyDiscount.mutateAsync(Number(discount)).then(
                () => onDone('Descuento aplicado'),
                () => undefined,
              )
            }
          >
            Aplicar
          </Button>
          <p className="w-full text-[13px] text-ink-muted">
            En este mes y los siguientes recalcula la cuota con la tarifa de hoy y ese descuento (y
            se mantiene si cambian sus grupos). En un mes ya pasado solo lo anota, sin cambiar el
            importe.
          </p>
        </div>
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
