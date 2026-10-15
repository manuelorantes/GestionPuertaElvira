import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

import { type AuditPayment, type AuditPeriod, fetchPayments } from '@/features/audit/api';
import { paymentMethodLabel } from '@/features/audit/fields';
import { emptyMessage, periodPhrase } from '@/features/audit/sections';
import { targetLink } from '@/features/audit/targets';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents } from '@/features/billing/money';
import { madridDateTime } from '@/shared/dateTime';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

const ROW_ACTION =
  'flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted';

/** «+45 €» para un cobro registrado, «−45 €» para uno deshecho. */
function signed(cents: number): string {
  return `${cents < 0 ? '−' : '+'}${formatCents(Math.abs(cents))}`;
}

type Column = 'when' | 'receipt' | 'student' | 'concept' | 'method' | 'user' | 'amount';

const COLUMNS: Record<Column, SortColumn<AuditPayment>> = {
  when: { label: 'Fecha y hora', name: 'fecha y hora', value: (p) => p.seq },
  receipt: { label: 'Recibo', name: 'recibo', value: (p) => p.receiptNumber },
  student: { label: 'Alumno', name: 'alumno', value: (p) => p.studentName },
  concept: { label: 'Concepto', name: 'concepto', value: (p) => p.concept },
  method: { label: 'Forma de pago', name: 'forma de pago', value: (p) => p.method },
  user: { label: 'Registrado por', name: 'registrado por', value: (p) => p.userName },
  amount: { label: 'Importe', name: 'importe', value: (p) => p.totalCents },
};

function PaymentsTable({ items }: { items: AuditPayment[] }) {
  const { header, apply } = useTableSort(COLUMNS, { key: 'when', descending: true });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-sm">
        <caption className="sr-only">Cobros registrados</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {(['when', 'receipt', 'student', 'concept', 'method', 'user'] as const).map((key) => (
              <th key={key} scope="col" className="px-3 py-3 font-semibold">
                {header(key)}
              </th>
            ))}
            <th scope="col" className="px-3 py-3 text-right font-semibold">
              {header('amount')}
            </th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apply(items).map((p) => {
            const undone = p.totalCents < 0;
            return (
              <tr key={`${p.id}-${p.paymentId}`} className="border-b border-line-soft">
                <td className="px-3 py-3 whitespace-nowrap text-ink-muted">
                  {madridDateTime(p.occurredAt)}
                </td>
                <td className="px-3 py-3 font-medium whitespace-nowrap">{p.receiptNumber}</td>
                <td className="px-3 py-3">
                  <Link to={`/panel/alumnos/${p.studentId}`} className="font-medium">
                    {p.studentName}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  {p.concept}
                  {undone && <span className="block text-[12px] text-warning-fg">{p.label}</span>}
                </td>
                <td className="px-3 py-3 text-ink-soft">{paymentMethodLabel(p.method)}</td>
                <td className="px-3 py-3 text-ink-soft">{p.userName}</td>
                <td
                  className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${undone ? 'text-danger-fg' : 'text-success-fg'}`}
                >
                  {signed(p.totalCents)}
                </td>
                <td className="px-2 py-3">
                  {!undone && (
                    <Link
                      to={targetLink({ kind: 'payment', id: p.paymentId }).to}
                      aria-label={`Ir al cobro ${p.receiptNumber}`}
                      title="Ver el recibo en Cobros"
                      className={ROW_ACTION}
                    >
                      <ArrowRight aria-hidden size={16} />
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Los cobros del periodo como los movimientos de contabilidad: uno por fila y la suma al pie. */
export function PaymentsHistory({ period }: { period: AuditPeriod }) {
  const payments = useInfiniteQuery({
    queryKey: ['audit-payments', period],
    queryFn: ({ pageParam }) => fetchPayments(period, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.items.length >= 50 ? last.items[last.items.length - 1]?.seq : undefined,
  });
  if (payments.isPending) return <p className="p-5 text-ink-muted">Cargando cobros…</p>;
  if (payments.isError)
    return (
      <div className="p-5">
        <Alert>{apiErrorMessage(payments.error)}</Alert>
      </div>
    );
  const items = payments.data.pages.flatMap((page) => page.items);
  const totalCents = payments.data.pages[0]?.totalCents ?? 0;
  if (items.length === 0)
    return (
      <p className="px-5 py-12 text-center text-ink-muted">{emptyMessage('payments', period)}</p>
    );
  const registered = items.filter((p) => p.totalCents >= 0).length;
  const undone = items.length - registered;

  return (
    <>
      <PaymentsTable items={items} />
      {payments.hasNextPage && (
        <div className="flex justify-center border-t border-line p-4">
          <Button
            variant="secondary"
            busy={payments.isFetchingNextPage}
            busyLabel="Cargando…"
            onClick={() => void payments.fetchNextPage()}
          >
            Ver más
          </Button>
        </div>
      )}
      <p className="flex flex-wrap justify-between gap-2 border-t border-line px-5 py-3 text-sm font-medium">
        <span>
          {registered} {registered === 1 ? 'cobro' : 'cobros'}
          {undone > 0 && ` (${undone} ${undone === 1 ? 'deshecho' : 'deshechos'})`}{' '}
          {periodPhrase(period)}
        </span>
        <span>Total {signed(totalCents)}</span>
      </p>
    </>
  );
}
