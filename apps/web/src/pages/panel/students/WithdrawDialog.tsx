import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useAccount } from '@/features/billing/hooks';
import { formatCents, monthLabel } from '@/features/billing/money';
import { todayIso } from '@/features/students/format';
import { useFamilyLeftAlone } from '@/features/students/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';

interface WithdrawDialogProps {
  studentId: string;
  name: string;
  onClose: () => void;
  /** `cancelChargeIds`: cuotas pendientes que se cancelan con la baja. */
  onWithdraw: (date: string, cancelChargeIds: string[]) => Promise<unknown>;
}

interface PendingCharge {
  id: string;
  label: string;
  pendingCents: number;
  /** Mes de la cuota (null en la de socio). */
  period: string | null;
}

/**
 * Baja con fecha; además ofrece cancelar sus cuotas pendientes. Por defecto se marcan las de los meses posteriores a la
 * baja; se puede marcar o desmarcar cada una.
 */
export function WithdrawDialog({ studentId, name, onClose, onWithdraw }: WithdrawDialogProps) {
  const [date, setDate] = useState(todayIso());
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const account = useAccount(studentId);
  const leftAlone = useFamilyLeftAlone(studentId).data ?? [];
  const year = new Date().getFullYear();
  const pending: PendingCharge[] = [
    ...(account.data?.charges ?? [])
      .filter((c) => c.status !== 'cancelled' && c.pendingCents > 0)
      .map((c) => ({
        id: c.id,
        label: `Cuota de ${monthLabel(c.period).toLowerCase()}`,
        pendingCents: c.pendingCents,
        period: c.period,
      })),
    ...(account.data?.membershipCharge && account.data.membershipCharge.pendingCents > 0
      ? [
          {
            id: account.data.membershipCharge.id,
            label: 'Cuota de socio',
            pendingCents: account.data.membershipCharge.pendingCents,
            period: null,
          },
        ]
      : []),
  ];
  const afterWithdrawal = (charge: PendingCharge) =>
    charge.period !== null && date !== '' && charge.period > date.slice(0, 7);
  const checked = (charge: PendingCharge) => afterWithdrawal(charge) !== toggled.has(charge.id);

  function toggle(id: string) {
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date) return setError('Indica la fecha de baja.');
    setBusy(true);
    try {
      await onWithdraw(
        date,
        pending.filter(checked).map((c) => c.id),
      );
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} labelledBy="withdraw-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="withdraw-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Dar de baja a {name}
        </h2>
        {error && <Alert>{error}</Alert>}
        <DateField
          label="Fecha de baja"
          value={date}
          onChange={setDate}
          fromYear={year}
          toYear={year + 1}
        />
        <p className="text-sm text-ink-muted">
          Desde ese día deja de ocupar plaza en sus grupos y deja de ser familia directa de quien lo
          era.
        </p>
        {leftAlone.map((s) => (
          <Alert key={s.id} tone="warning">
            {s.fullName} se queda sin familia directa en el club: pierde el descuento familiar desde
            el mes siguiente a la baja.
          </Alert>
        ))}
        {pending.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">
              ¿Cancelar también sus cuotas pendientes?
            </legend>
            <ul className="flex flex-col divide-y divide-line-soft rounded-sm border border-line">
              {pending.map((charge) => (
                <li key={charge.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={checked(charge)}
                      onChange={() => toggle(charge.id)}
                    />
                    <span className="flex-1">{charge.label}</span>
                    <span className="text-ink-muted">{formatCents(charge.pendingCents)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-ink-muted">
              Se marcan las de los meses después de la baja. Las canceladas se pueden reactivar en
              Cobros y cuotas.
            </p>
          </fieldset>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} busyLabel="Guardando…">
            Dar de baja
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
