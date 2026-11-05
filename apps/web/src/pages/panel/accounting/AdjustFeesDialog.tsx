import { adjustedFees, type ChosenFee } from '@/features/accounting/api';
import { formatCents } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';

/**
 * Confirma cobrar las cuotas elegidas aunque el banco traiga más o menos: la diferencia se reparte a partes iguales,
 * lo de más queda a favor de cada alumno y lo de menos, pendiente en su cuota.
 */
export function AdjustFeesDialog({
  fees,
  bankCents,
  differenceCents,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  fees: ChosenFee[];
  bankCents: number;
  differenceCents: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const over = differenceCents > 0;
  const rows = adjustedFees(fees, differenceCents);
  return (
    <Dialog open onClose={onCancel} labelledBy="adjust-fees-title">
      <div className="flex flex-col gap-3 p-6">
        <h2
          id="adjust-fees-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {over ? '¿Cobrar con saldo a favor?' : '¿Cobrar con parte pendiente?'}
        </h2>
        <p className="text-[15px] text-ink-soft">
          El banco trae {formatCents(bankCents)} y lo elegido suma{' '}
          {formatCents(bankCents - differenceCents)}.{' '}
          {over
            ? `Los ${formatCents(differenceCents)} de más se reparten a partes iguales y quedan a favor de cada alumno para sus próximas cuotas.`
            : `Faltan ${formatCents(-differenceCents)}: se reparten a partes iguales y quedan pendientes en la cuota de cada alumno («Pagada en parte»).`}
        </p>
        <p className="text-[15px] text-ink-soft">Se añadirán estos cobros:</p>
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.studentId} className="flex flex-wrap gap-x-3">
              <span className="min-w-0 flex-1">
                {r.student} · {r.concept} ({formatCents(r.amountCents)})
              </span>
              <span className="font-semibold tabular-nums">{formatCents(r.chargedCents)}</span>
              <span className="w-full text-ink-muted">
                {r.shareCents > 0
                  ? `${formatCents(r.shareCents)} a su favor`
                  : r.shareCents < 0
                    ? `Le faltan ${formatCents(-r.shareCents)} por pagar`
                    : 'Justo su cuota'}
              </span>
            </li>
          ))}
        </ul>
        {error && <Alert>{error}</Alert>}
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} busy={busy} busyLabel="Guardando…">
            Sí, cobrar así
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
