import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  changePaymentDate,
  changePaymentMethod,
  correctPaymentAmount,
  PAYMENT_METHOD_LABEL,
  type PaymentDetail,
  type PaymentMethod,
} from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { centsFromText, centsToText, formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Button } from '@/shared/ui/Button';
import { ConfirmChangesDialog } from '@/shared/ui/ConfirmChangesDialog';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { changedFields } from '@/shared/ui/fieldChanges';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABEL[value],
}));

interface Correction {
  date: string | null;
  method: PaymentMethod | null;
  amount: { cents: number; reason: string } | null;
}

/** Cada campo cambiado se guarda con su propia petición, en orden. */
async function applyCorrection(id: string, correction: Correction): Promise<void> {
  if (correction.date !== null) await changePaymentDate(id, correction.date);
  if (correction.method !== null) await changePaymentMethod(id, correction.method);
  if (correction.amount !== null) {
    await correctPaymentAmount(id, correction.amount.cents, correction.amount.reason);
  }
}

/**
 * Corregir un cobro desde su recibo (superadministración): fecha, forma de pago e importe con motivo. El número de
 * recibo y los meses cobrados no cambian. Antes de guardar se confirma lo que cambia.
 */
export function EditPaymentDialog({
  payment,
  onClose,
}: {
  payment: PaymentDetail;
  onClose: () => void;
}) {
  const [date, setDate] = useState(payment.paidOn);
  const [method, setMethod] = useState<PaymentMethod>(payment.method);
  const [amount, setAmount] = useState(centsToText(payment.totalCents));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const save = useBillingMutation((correction: Correction) =>
    applyCorrection(payment.id, correction),
  );
  const toast = useToast();
  const cents = centsFromText(amount);
  const amountChanged = cents !== null && cents !== payment.totalCents;
  const invalid = date === '' || cents === null || (amountChanged && !reason.trim());
  const year = Number(payment.paidOn.slice(0, 4));

  const changes = changedFields([
    ['Fecha', formatDate(payment.paidOn), date === '' ? '—' : formatDate(date)],
    ['Forma de pago', PAYMENT_METHOD_LABEL[payment.method], PAYMENT_METHOD_LABEL[method]],
    ['Importe', formatCents(payment.totalCents), formatCents(cents ?? 0)],
  ]);

  function review(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    if (changes.length === 0) return onClose();
    setConfirming(true);
  }

  function confirm() {
    void save
      .mutateAsync({
        date: date !== payment.paidOn ? date : null,
        method: method !== payment.method ? method : null,
        amount: amountChanged && cents !== null ? { cents, reason: reason.trim() } : null,
      })
      .then(
        () => {
          toast('Cobro corregido');
          onClose();
        },
        () => undefined,
      );
  }

  if (confirming) {
    return (
      <ConfirmChangesDialog
        changes={changes}
        warning="El número de recibo y los meses que cubre no cambian."
        busy={save.isPending}
        error={save.isError ? apiErrorMessage(save.error) : null}
        onBack={() => setConfirming(false)}
        onConfirm={confirm}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="edit-payment-title">
      <form onSubmit={review} className="flex flex-col gap-4 p-6">
        <h2
          id="edit-payment-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Editar el cobro {payment.receiptNumber}
        </h2>
        <DateField
          label="Fecha"
          value={date}
          onChange={setDate}
          fromYear={year - 1}
          toYear={year + 1}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Forma de pago"
            value={method}
            onChange={(value) => setMethod(value as PaymentMethod)}
            options={METHOD_OPTIONS}
          />
          <TextField
            label="Importe (€)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {amountChanged && (
          <TextField
            label="Motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Queda en el recibo como línea de corrección"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
