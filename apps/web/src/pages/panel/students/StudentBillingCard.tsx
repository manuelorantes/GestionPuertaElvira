import { Pencil, Printer, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { updateAccount, type Account, type AccountCharge } from '@/features/billing/api';
import { useAccount, useBillingMutation, usePayments } from '@/features/billing/hooks';
import { formatCents, monthLabel } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { BillingDialogs, type BillingDialog } from '@/pages/panel/billing/BillingPage';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { AsteriskNote } from '@/shared/ui/AsteriskNote';
import { Card } from '@/shared/ui/Card';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { ChargeDialog } from './ChargeDialog';

function hoursLabel(hours: number): string {
  return `${String(Math.round(hours * 100) / 100).replace('.', ',')} h semanales`;
}

/** Tarjeta «Cuotas y cobros» de la ficha: lo que paga y por qué, puntos, cuota de socio e historial. */
export function StudentBillingCard({
  studentId,
  title,
}: {
  studentId: string;
  title: (text: string) => React.ReactNode;
}) {
  const account = useAccount(studentId);
  const payments = usePayments(studentId);
  const [dialog, setDialog] = useState<BillingDialog>(null);

  return (
    <Card className="p-4">
      {title('Cuotas y cobros')}
      {account.data ? (
        <AccountSummary key={studentId} studentId={studentId} account={account.data} />
      ) : (
        <p className="text-sm text-ink-muted">
          {account.isError ? 'No se han podido cargar los datos de cobro.' : 'Cargando…'}
        </p>
      )}
      <Button className="mt-3" fullWidth onClick={() => setDialog({ type: 'payment', studentId })}>
        <Wallet aria-hidden size={18} />
        Registrar cobro
      </Button>
      <h4 className="mt-4 mb-1 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Historial
      </h4>
      {(payments.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted">Sin cobros todavía.</p>
      ) : (
        <ul aria-label="Historial de cobros">
          {(payments.data ?? []).slice(0, 6).map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 border-t border-line-soft py-2 text-sm"
            >
              <span className="w-20 shrink-0 text-ink-muted">{formatDate(p.paidOn)}</span>
              <span className="flex-1">{p.concept}</span>
              <span className="font-semibold">{formatCents(p.totalCents)}</span>
              <button
                type="button"
                aria-label={`Ver recibo ${p.receiptNumber}`}
                onClick={() => setDialog({ type: 'receipt', paymentId: p.id })}
                className="flex size-8 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted"
              >
                <Printer aria-hidden size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <BillingDialogs dialog={dialog} onChange={setDialog} />
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function AccountSummary({ studentId, account }: { studentId: string; account: Account }) {
  const [rate, setRate] = useState(account.privateRate ?? '');
  const save = useBillingMutation(() =>
    updateAccount(studentId, {
      preferredPlan: account.preferredPlan,
      member: account.member,
      privateRate: rate.trim() || null,
    }),
  );
  const toast = useToast();
  const error = save.error;

  return (
    <div className="flex flex-col">
      {error && <Alert>{apiErrorMessage(error)}</Alert>}
      <Row label="Clases">
        {account.weeklyHours > 0 ? hoursLabel(account.weeklyHours) : 'Sin clases'}
      </Row>
      <Row label="Cuota mensual">
        {account.monthlyFeeCents > 0 ? formatCents(account.monthlyFeeCents) : '—'}
      </Row>
      <Row label="Descuento familiar">
        {account.familyDiscount ? 'Sí, por familia directa' : 'No'}
      </Row>
      <Row label="Cuota de socio">
        {account.membershipPaid
          ? 'Pagada'
          : `Pendiente · ${formatCents(account.membershipFeeCents)}`}
      </Row>
      {account.hasPrivateLessons && (
        <div className="mt-2 flex items-end gap-2">
          <TextField
            label="Precio por hora de particulares (€)"
            help="Vacío: el del profesor"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <Button
            variant="secondary"
            busy={save.isPending}
            busyLabel="Guardando…"
            onClick={() =>
              void save.mutateAsync(undefined).then(
                () => toast('Precio guardado'),
                () => undefined,
              )
            }
          >
            Guardar
          </Button>
        </div>
      )}
      <SeasonCharges studentId={studentId} account={account} />
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line-soft pt-3 text-sm">
        <span>
          Puntos de este mes: <strong>{account.points}</strong>
          <span className="block text-[12px] text-ink-muted">
            Valen solo este mes; con 5 se descuenta un 5 % de una cuota al cobrar.
          </span>
        </span>
        <Link
          to={`/panel/puntos?alumno=${studentId}`}
          className="shrink-0 text-[13px] font-semibold text-brand"
        >
          Ver en Puntos
        </Link>
      </div>
    </div>
  );
}

function chargeState(charge: AccountCharge): { text: string; tone: string } {
  if (charge.status === 'cancelled') return { text: 'Cancelada', tone: 'text-ink-muted' };
  if (charge.pendingCents <= 0) return { text: 'Cobrada', tone: 'text-success-fg' };
  if (charge.coveredCents > 0)
    return { text: `Faltan ${formatCents(charge.pendingCents)}`, tone: 'text-warning-fg' };
  if (charge.status === 'upcoming') return { text: 'Próxima', tone: 'text-ink-muted' };
  if (charge.status === 'overdue') return { text: 'Vencida', tone: 'text-danger-fg' };
  return { text: 'Pendiente', tone: 'text-warning-fg' };
}

/** Descuentos que lleva una cuota mensual: el familiar y el de pago adelantado (o null si ninguno). */
function discountsLabel(charge: AccountCharge, account: Account): string | null {
  const parts: string[] = [];
  if (account.familyPercent > 0 && !charge.manual)
    parts.push(`−${account.familyPercent} % familia`);
  if (charge.discountPercent > 0) parts.push(`−${charge.discountPercent} % pago adelantado`);
  return parts.length === 0 ? null : parts.join(' · ');
}

/** Cuotas de la temporada: importe, si está fijada a mano, lo que falta y la acción de editarla. */
function SeasonCharges({ studentId, account }: { studentId: string; account: Account }) {
  const [editing, setEditing] = useState<AccountCharge | null>(null);
  const toast = useToast();
  if (account.charges.length === 0 && account.balanceCents <= 0) return null;

  return (
    <section aria-label="Cuotas de la temporada" className="mt-2 border-t border-line-soft pt-3">
      <h4 className="mb-1 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Cuotas de la temporada
      </h4>
      <ul>
        {account.charges.map((charge) => {
          const state = chargeState(charge);
          const month = monthLabel(charge.period);
          return (
            <li key={charge.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="w-28 shrink-0">{month}</span>
              <span className="flex-1">
                <span
                  className={`font-medium ${charge.status === 'cancelled' ? 'text-ink-muted line-through' : ''}`}
                >
                  {formatCents(
                    charge.status === 'cancelled' ? charge.fullAmountCents : charge.amountCents,
                  )}
                </span>
                {charge.status !== 'cancelled' && charge.cancelledCents > 0 && (
                  <AsteriskNote label="Cuota cancelada en parte">
                    Era de {formatCents(charge.fullAmountCents)}: se cancelaron los{' '}
                    {formatCents(charge.cancelledCents)} que faltaban y queda lo cobrado.
                  </AsteriskNote>
                )}
                {discountsLabel(charge, account) && (
                  <span className="ml-1.5 text-[12px] text-ink-muted">
                    {discountsLabel(charge, account)}
                  </span>
                )}
                {charge.manual && (
                  <span
                    className="block text-[12px] text-ink-muted"
                    title={charge.note ?? undefined}
                  >
                    Fijada a mano{charge.note ? ` · ${charge.note}` : ''}
                  </span>
                )}
              </span>
              <span className={`text-[13px] font-medium ${state.tone}`}>{state.text}</span>
              <button
                type="button"
                aria-label={`Editar la cuota de ${month.toLowerCase()}`}
                title="Editar cuota"
                onClick={() => setEditing(charge)}
                className="flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
              >
                <Pencil aria-hidden size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      {account.balanceCents > 0 && (
        <p className="mt-1 text-[13px] text-success-fg">
          Saldo a favor: {formatCents(account.balanceCents)} (cubrirá las siguientes cuotas)
        </p>
      )}
      {editing && (
        <ChargeDialog
          studentId={studentId}
          charge={editing}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            toast(message);
          }}
        />
      )}
    </section>
  );
}
