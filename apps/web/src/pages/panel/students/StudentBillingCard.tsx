import { Minus, Plus, Printer, Wallet } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { adjustPoints, updateAccount, type Account } from '@/features/billing/api';
import { useAccount, useBillingMutation, usePayments } from '@/features/billing/hooks';
import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { BillingDialogs, type BillingDialog } from '@/pages/panel/billing/BillingPage';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Card } from '@/shared/ui/Card';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

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
  const queryClient = useQueryClient();
  const refresh = useRefreshClubData();
  // Los puntos cambian al instante en pantalla (actualización optimista); la API se llama en segundo
  // plano y, si fallara, se vuelve al valor anterior. Al recargar se obtiene el valor real.
  const accountKey = ['account', studentId];
  const points = useMutation({
    mutationFn: (delta: number) => adjustPoints(studentId, delta),
    onMutate: async (delta: number) => {
      await queryClient.cancelQueries({ queryKey: accountKey });
      const previous = queryClient.getQueryData<Account>(accountKey);
      queryClient.setQueryData<Account>(accountKey, (old) =>
        old ? { ...old, points: Math.max(0, old.points + delta) } : old,
      );
      return { previous };
    },
    onError: (_error, _delta, context) => {
      if (context?.previous) queryClient.setQueryData(accountKey, context.previous);
    },
    onSuccess: (total) => {
      queryClient.setQueryData<Account>(accountKey, (old) =>
        old ? { ...old, points: total } : old,
      );
      refresh();
    },
  });
  const toast = useToast();
  const error = save.error ?? points.error;

  return (
    <div className="flex flex-col">
      {error && <Alert>{apiErrorMessage(error)}</Alert>}
      <Row label="Clases">
        {account.weeklyHours > 0 ? hoursLabel(account.weeklyHours) : 'Sin clases'}
      </Row>
      <Row label="Cuota mensual">
        {account.monthlyFeeCents > 0 ? formatCents(account.monthlyFeeCents) : '—'}
      </Row>
      <Row label="Descuento familiar">{account.familyDiscount ? 'Sí, por hermanos' : 'No'}</Row>
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
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line-soft pt-3 text-sm">
        <span>
          Puntos: <strong>{account.points}</strong>
          <span className="block text-[12px] text-ink-muted">
            Con 5 puntos se descuenta un 5 % de una cuota mensual al cobrar; los puntos tendrán más
            usos.
          </span>
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            aria-label="Restar un punto"
            disabled={account.points === 0}
            onClick={() => points.mutate(-1)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Minus aria-hidden size={16} />
          </button>
          <button
            type="button"
            aria-label="Sumar un punto"
            onClick={() => points.mutate(1)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted"
          >
            <Plus aria-hidden size={16} />
          </button>
        </span>
      </div>
    </div>
  );
}
