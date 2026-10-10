import { reactivateCharge } from '@/features/billing/api';
import { useBillingMutation, useCancelledCharges } from '@/features/billing/hooks';
import { formatCents, monthName } from '@/features/billing/money';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { AsteriskNote } from '@/shared/ui/AsteriskNote';
import { Avatar } from '@/shared/ui/Avatar';
import { Card } from '@/shared/ui/Card';
import { useToast } from '@/shared/ui/Toast';

/** «Cuotas canceladas» de la temporada: lo cancelado de cada una y «Reactivar» para que vuelva a deberse. */
export function CancelledCharges() {
  const cancelled = useCancelledCharges();
  const reactivate = useBillingMutation(reactivateCharge);
  const toast = useToast();
  if (cancelled.isPending) return <p className="p-5 text-ink-muted">Cargando cuotas…</p>;
  if (cancelled.isError)
    return (
      <div className="p-5">
        <Alert>No se han podido cargar las cuotas canceladas.</Alert>
      </div>
    );
  if (cancelled.data.length === 0)
    return (
      <p className="px-5 py-12 text-center text-ink-muted">
        No hay cuotas canceladas esta temporada.
      </p>
    );
  return (
    <Card>
      {reactivate.isError && (
        <div className="p-4">
          <Alert>{apiErrorMessage(reactivate.error)}</Alert>
        </div>
      )}
      <ul aria-label="Cuotas canceladas" className="divide-y divide-line-soft">
        {cancelled.data.map((charge) => (
          <li key={charge.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <Avatar name={charge.studentName} size={32} />
            <span className="min-w-40 flex-1">
              <span className="block font-medium">{charge.studentName}</span>
              <span className="text-ink-muted">
                {charge.kind === 'membership'
                  ? 'Cuota de socio'
                  : `Cuota de ${monthName(charge.period)}`}{' '}
                · cancelada el {formatDate(charge.cancelledOn)}
              </span>
            </span>
            <span className="font-medium">
              {formatCents(charge.cancelledCents)}
              {charge.keptCents > 0 && (
                <AsteriskNote label="Cuota cancelada en parte">
                  De una cuota de {formatCents(charge.fullAmountCents)}: se cobraron{' '}
                  {formatCents(charge.keptCents)} y se canceló lo que faltaba.
                </AsteriskNote>
              )}
            </span>
            <button
              type="button"
              disabled={reactivate.isPending}
              onClick={() =>
                void reactivate.mutateAsync(charge.id).then(
                  () => toast('Cuota reactivada'),
                  () => undefined,
                )
              }
              className="inline-flex h-9 cursor-pointer items-center rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-surface-muted disabled:opacity-60"
            >
              Reactivar
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
