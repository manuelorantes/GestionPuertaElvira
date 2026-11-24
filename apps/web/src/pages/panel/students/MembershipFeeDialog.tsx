import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  adjustMembershipFee,
  resetMembershipFee,
  type PaidChargePolicy,
} from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { centsFromText, formatCents } from '@/features/billing/money';
import { Button } from '@/shared/ui/Button';
import { ConfirmChangesDialog } from '@/shared/ui/ConfirmChangesDialog';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';

/**
 * Fija a mano la cuota de socio de la temporada de un alumno con un motivo, o la devuelve a la de Ajustes (solo
 * superadministración). Siempre se confirma antes; si ya está cubierta, se elige también qué pasa con la diferencia,
 * como al editar una cuota mensual.
 */
export function MembershipFeeDialog({
  studentId,
  feeCents,
  pendingCents,
  manual,
  note,
  onClose,
  onDone,
}: {
  studentId: string;
  feeCents: number;
  pendingCents: number;
  manual: boolean;
  note: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState(String(feeCents / 100).replace('.', ','));
  const [reason, setReason] = useState(note ?? '');
  const [confirming, setConfirming] = useState<'save' | 'reset' | null>(null);
  const [correctPayment, setCorrectPayment] = useState(true);
  const save = useBillingMutation(
    (input: { amountCents: number; reason: string; onPaid: PaidChargePolicy }) =>
      adjustMembershipFee(studentId, input),
  );
  const reset = useBillingMutation(() => resetMembershipFee(studentId));
  const cents = centsFromText(amount);
  const ready = cents !== null && cents !== feeCents && reason.trim() !== '';

  const coveredCents = feeCents - pendingCents;
  const surplusCents = cents === null ? 0 : coveredCents - cents;
  const raiseCents =
    cents === null || pendingCents > 0 || coveredCents === 0 ? 0 : cents - feeCents;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) setConfirming('save');
  }

  if (confirming === 'reset') {
    return (
      <ConfirmChangesDialog
        changes={[['Cuota de socio', formatCents(feeCents), 'la de Ajustes']]}
        warning="Los cobros no cambian: si ya está pagada, puede quedar algo pendiente o a favor."
        busy={reset.isPending}
        error={reset.isError ? apiErrorMessage(reset.error) : null}
        onBack={() => {
          reset.reset();
          setConfirming(null);
        }}
        onConfirm={() =>
          void reset.mutateAsync(undefined).then(
            () => onDone('Cuota de socio como la de Ajustes'),
            () => undefined,
          )
        }
      />
    );
  }

  if (confirming === 'save' && cents !== null) {
    const asks = surplusCents > 0 || raiseCents > 0;
    return (
      <ConfirmChangesDialog
        changes={[['Cuota de socio', formatCents(feeCents), formatCents(cents)]]}
        busy={save.isPending}
        error={save.isError ? apiErrorMessage(save.error) : null}
        onBack={() => {
          save.reset();
          setConfirming(null);
        }}
        onConfirm={() =>
          void save
            .mutateAsync({
              amountCents: cents,
              reason: reason.trim(),
              onPaid: asks && correctPayment ? 'correct_payment' : 'keep_credit',
            })
            .then(
              () => onDone('Cuota de socio cambiada'),
              () => undefined,
            )
        }
      >
        {asks && (
          <>
            <p className="text-sm text-ink-muted">
              Esta cuota ya tiene cubiertos {formatCents(coveredCents)}.
            </p>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={correctPayment}
                onChange={(e) => setCorrectPayment(e.target.checked)}
                className="mt-0.5"
              />
              {raiseCents > 0 ? (
                <span>
                  <span className="font-medium">Se pagó el importe nuevo</span>
                  <span className="block text-[13px] text-ink-muted">
                    {correctPayment
                      ? `Se registró mal: el recibo de la cuota de socio pasa a tener ${formatCents(raiseCents)} más, con una línea de corrección.`
                      : `Faltarán ${formatCents(raiseCents)} por pagar de la cuota de socio.`}
                  </span>
                </span>
              ) : (
                <span>
                  <span className="font-medium">Cambiar la cantidad pagada</span>
                  <span className="block text-[13px] text-ink-muted">
                    {correctPayment
                      ? `El recibo de la cuota de socio pasa a tener ${formatCents(surplusCents)} menos, con una línea de corrección.`
                      : `La diferencia (${formatCents(surplusCents)}) se quedará como saldo a favor del alumno.`}
                  </span>
                </span>
              )}
            </label>
          </>
        )}
      </ConfirmChangesDialog>
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="membership-fee-dialog-title">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="membership-fee-dialog-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Cuota de socio
        </h2>
        <p className="text-sm text-ink-muted">
          Ahora: {formatCents(feeCents)}
          {coveredCents > 0 && ` · cubiertos ${formatCents(coveredCents)}`}
          {manual && ' · fijada a mano'}. Solo cambia la de este alumno en esta temporada; la de
          Ajustes sigue igual.
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
          placeholder="Por ejemplo: hermanos"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
          {manual ? (
            <Button variant="ghost" onClick={() => setConfirming('reset')}>
              Volver a la de Ajustes
            </Button>
          ) : (
            <span />
          )}
          <span className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!ready}>
              Guardar
            </Button>
          </span>
        </div>
      </form>
    </Dialog>
  );
}
