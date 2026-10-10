import { cancelCharge, type Charge } from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { formatCents, monthName } from '@/features/billing/money';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';

/** Confirma cancelar una cuota: entera o, si está pagada en parte, solo lo que falta. */
export function CancelChargeDialog({ charge, onClose }: { charge: Charge; onClose: () => void }) {
  const cancel = useBillingMutation(cancelCharge);
  const toast = useToast();
  const what =
    charge.kind === 'membership' ? 'la cuota de socio' : `la cuota de ${monthName(charge.period)}`;
  const pending = charge.amountCents - charge.coveredCents;
  const message =
    charge.coveredCents > 0
      ? `¿Seguro que quieres cancelar lo que falta de ${what} de ${charge.studentName}? Se cancelan ${formatCents(pending)} y la cuota se queda en los ${formatCents(charge.coveredCents)} ya cobrados.`
      : `¿Seguro que quieres cancelar ${what} de ${charge.studentName} (${formatCents(charge.amountCents)})? Dejará de deberse y pasará a «Cuotas canceladas», desde donde se puede reactivar.`;
  return (
    <ConfirmDialog
      title="Cancelar cuota"
      message={message}
      confirmLabel="Sí, cancelarla"
      busy={cancel.isPending}
      error={cancel.isError ? apiErrorMessage(cancel.error) : null}
      onCancel={onClose}
      onConfirm={() =>
        void cancel.mutateAsync(charge.id).then(
          () => {
            toast('Cuota cancelada');
            onClose();
          },
          () => undefined,
        )
      }
    />
  );
}
