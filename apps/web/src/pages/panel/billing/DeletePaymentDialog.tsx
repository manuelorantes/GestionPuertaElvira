import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { deletePayment, type PaymentDetail } from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

/**
 * Borrar un cobro anotado por error (superadministración, sin factura): con motivo, que queda en el historial. Las
 * cuotas que cubría vuelven a quedar pendientes y deja de salir en Contabilidad y en la conciliación.
 */
export function DeletePaymentDialog({
  payment,
  onCancel,
  onDeleted,
}: {
  payment: PaymentDetail;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState('');
  const remove = useBillingMutation((why: string) => deletePayment(payment.id, why));
  const toast = useToast();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    void remove.mutateAsync(reason.trim()).then(
      () => {
        toast(`Cobro ${payment.receiptNumber} borrado`);
        onDeleted();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onCancel} labelledBy="delete-payment-title">
      <form onSubmit={submit} className="flex flex-col gap-3 p-6">
        <h2
          id="delete-payment-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          ¿Borrar el cobro {payment.receiptNumber}?
        </h2>
        <p className="text-[15px] text-ink-soft">
          Las cuotas que cubría vuelven a quedar pendientes y deja de salir en Contabilidad y en la
          conciliación. Queda en el historial con el motivo y su número no se vuelve a usar.
        </p>
        {remove.isError && <Alert>{apiErrorMessage(remove.error)}</Alert>}
        <TextField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!reason.trim()}
            busy={remove.isPending}
            busyLabel="Borrando…"
          >
            Borrar cobro
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
