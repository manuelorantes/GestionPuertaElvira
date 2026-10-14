import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents, monthLabel } from '@/features/billing/money';
import { changeSettlementPaymentDate } from '@/features/payroll/api';
import { usePayrollMutation } from '@/features/payroll/hooks';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ConfirmChangesDialog } from '@/shared/ui/ConfirmChangesDialog';
import { changedFields } from '@/shared/ui/fieldChanges';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';

/** «Fecha de pago» de una liquidación ya pagada: se cambia tras confirmar el cambio. */
export function SettlementPaymentDateDialog({
  teacherId,
  month,
  amountCents,
  paidOn,
  onClose,
}: {
  teacherId: string;
  month: string;
  amountCents: number;
  paidOn: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(paidOn);
  const [confirming, setConfirming] = useState(false);
  const change = usePayrollMutation(changeSettlementPaymentDate);
  const toast = useToast();
  const year = new Date().getFullYear();
  const changes = changedFields([['Fecha de pago', formatDate(paidOn), formatDate(date)]]);

  function review(event: FormEvent) {
    event.preventDefault();
    if (!date) return;
    if (changes.length === 0) return onClose();
    setConfirming(true);
  }

  function confirm() {
    void change.mutateAsync({ teacherId, month, date }).then(
      () => {
        toast('Fecha de pago cambiada');
        onClose();
      },
      () => undefined,
    );
  }

  if (confirming) {
    return (
      <ConfirmChangesDialog
        changes={changes}
        busy={change.isPending}
        error={change.isError ? apiErrorMessage(change.error) : null}
        onBack={() => setConfirming(false)}
        onConfirm={confirm}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="payment-date-title">
      <form noValidate onSubmit={review} className="flex flex-col gap-4 p-6">
        <h2
          id="payment-date-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Fecha de pago
        </h2>
        {change.isError && <Alert>{apiErrorMessage(change.error)}</Alert>}
        <p className="text-sm text-ink-soft">
          Liquidación de {monthLabel(month).toLowerCase()} · {formatCents(amountCents)}
        </p>
        <DateField
          label="Pagada el"
          value={date}
          onChange={setDate}
          fromYear={year - 1}
          toYear={year + 1}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!date}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
