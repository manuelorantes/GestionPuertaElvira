import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { restoreExpected, skipExpected, type ExpectedMonth } from '@/features/accounting/api';
import { useAccountingMutation, useExpectedMonth } from '@/features/accounting/hooks';
import { formatCents, monthLabel } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { useToast } from '@/shared/ui/Toast';

import { PayExpectedDialog } from './PayExpectedDialog';

/** «Gastos esperados de <mes>»: lo que falta por pagar, lo pagado y lo que no hay este mes. */
export function ExpectedMonthCard({ month }: { month: string }) {
  const expected = useExpectedMonth(month);
  const [paying, setPaying] = useState<ExpectedMonth | null>(null);
  const skip = useAccountingMutation(skipExpected);
  const restore = useAccountingMutation(restoreExpected);
  const toast = useToast();
  const items = expected.data ?? [];
  if (items.length === 0) return null;
  const label = monthLabel(month).toLowerCase();
  const pendingCents = items
    .filter((i) => i.status === 'pending')
    .reduce((total, i) => total + i.expectedCents, 0);

  return (
    <Card className="flex min-w-0 flex-col gap-3.5 p-6">
      <section aria-label={`Gastos esperados de ${label}`} className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
          Gastos esperados de {label}
        </h2>
        {(skip.isError || restore.isError) && (
          <Alert>{apiErrorMessage(skip.error ?? restore.error)}</Alert>
        )}
        <ul className="flex flex-col divide-y divide-line-soft">
          {items.map((item) => (
            <li key={item.expenseId} className="flex flex-col gap-2 py-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{item.concept}</span>
                <span className={item.status === 'pending' ? 'text-ink-muted' : 'font-semibold'}>
                  {formatCents(item.paidCents ?? item.expectedCents)}
                </span>
              </div>
              {item.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setPaying(item)}
                    className="h-8"
                    aria-label={`Pagar ${item.concept}`}
                  >
                    Pagar
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8"
                    aria-label={`No hay ${item.concept} este mes`}
                    busy={skip.isPending && skip.variables.id === item.expenseId}
                    onClick={() =>
                      void skip.mutateAsync({ id: item.expenseId, month }).then(
                        () => toast(`${item.concept}: no hay este mes`),
                        () => undefined,
                      )
                    }
                  >
                    No hay este mes
                  </Button>
                </div>
              )}
              {item.status === 'paid' && (
                <span className="text-[13px] text-ink-muted">
                  <Badge tone="success">Pagado</Badge>{' '}
                  {item.paidOn && `el ${formatDate(item.paidOn)}`}
                  {item.paidCents !== item.expectedCents &&
                    ` · se esperaban ${formatCents(item.expectedCents)}`}
                </span>
              )}
              {item.status === 'skipped' && (
                <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                  <Badge>No hay este mes</Badge>
                  <Button
                    variant="ghost"
                    className="h-8"
                    aria-label={`Volver a esperar ${item.concept}`}
                    busy={restore.isPending && restore.variables.id === item.expenseId}
                    onClick={() =>
                      void restore.mutateAsync({ id: item.expenseId, month }).then(
                        () => toast(`${item.concept}: se vuelve a esperar`),
                        () => undefined,
                      )
                    }
                  >
                    Volver a esperarlo
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line-strong pt-3 font-semibold">
          <span>Falta por pagar</span>
          <span>{formatCents(pendingCents)}</span>
        </div>
      </section>
      {paying && <PayExpectedDialog expected={paying} onClose={() => setPaying(null)} />}
    </Card>
  );
}
