import { Banknote, CreditCard, Landmark, Printer } from 'lucide-react';

import {
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
  type PaymentSummary,
} from '@/features/billing/api';
import { usePayments } from '@/features/billing/hooks';
import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';
import { StudentLink } from '@/pages/panel/students/StudentLink';

type Column = 'date' | 'receipt' | 'student' | 'concept' | 'method' | 'amount';

const COLUMNS: Record<Column, SortColumn<PaymentSummary>> = {
  // Con el recibo detrás para que, en el mismo día, el orden sea el de los recibos.
  date: { label: 'Fecha', name: 'fecha', value: (p) => `${p.paidOn} ${p.receiptNumber}` },
  receipt: { label: 'Recibo', name: 'recibo', value: (p) => p.receiptNumber },
  student: { label: 'Alumno', name: 'alumno', value: (p) => p.studentName },
  concept: { label: 'Concepto', name: 'concepto', value: (p) => p.concept },
  method: {
    label: 'Forma de pago',
    name: 'forma de pago',
    value: (p) => PAYMENT_METHOD_LABEL[p.method],
  },
  amount: { label: 'Importe', name: 'importe', value: (p) => p.totalCents },
};

export function PaymentsTab({ onOpenReceipt }: { onOpenReceipt: (paymentId: string) => void }) {
  const payments = usePayments();
  const { header, apply } = useTableSort(COLUMNS, { key: 'date', descending: true });
  const items = payments.data ?? [];

  if (payments.isPending) return <p className="text-ink-muted">Cargando cobros…</p>;
  if (items.length === 0)
    return <p className="text-ink-muted">Todavía no hay cobros registrados.</p>;

  const byMethod = (['cash', 'card', 'transfer'] as const).map((method) => ({
    method,
    label: PAYMENT_METHOD_LABEL[method],
    totalCents: items.filter((p) => p.method === method).reduce((sum, p) => sum + p.totalCents, 0),
  }));

  return (
    <Card className="overflow-x-auto">
      <dl
        aria-label="Totales por forma de pago"
        className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line px-5 py-3 text-sm"
      >
        {byMethod.map((m) => (
          <div key={m.method} className="flex items-center gap-2">
            <dt className="inline-flex items-center gap-1.5 text-ink-muted">
              <MethodIcon method={m.method} />
              {m.label}
            </dt>
            <dd className="font-semibold">{formatCents(m.totalCents)}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full min-w-[860px] text-left text-sm">
        <caption className="sr-only">Cobros registrados</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {(['date', 'receipt', 'student', 'concept', 'method'] as const).map((key) => (
              <th key={key} scope="col" className="px-5 py-3 font-semibold">
                {header(key)}
              </th>
            ))}
            <th scope="col" className="px-5 py-3 text-right font-semibold">
              {header('amount')}
            </th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apply(items).map((payment) => (
            <tr key={payment.id} className="border-b border-line-soft last:border-b-0">
              <td className="px-5 py-3 text-ink-muted">{formatDate(payment.paidOn)}</td>
              <td className="px-5 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  {payment.receiptNumber}
                  {payment.invoiceNumber && (
                    <Badge tone="success">Factura {payment.invoiceNumber}</Badge>
                  )}
                </span>
              </td>
              <td className="px-5 py-3 font-medium">
                <StudentLink id={payment.studentId}>{payment.studentName}</StudentLink>
              </td>
              <td className="px-5 py-3">{payment.concept}</td>
              <td className="px-5 py-3 text-ink-soft">
                <span className="inline-flex items-center gap-2">
                  <MethodIcon method={payment.method} />
                  {PAYMENT_METHOD_LABEL[payment.method]}
                </span>
              </td>
              <td className="px-5 py-3 text-right font-semibold text-brand-strong">
                {formatCents(payment.totalCents)}
              </td>
              <td className="px-5 py-3">
                <button
                  type="button"
                  aria-label="Ver recibo"
                  title="Ver recibo"
                  onClick={() => onOpenReceipt(payment.id)}
                  className="flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted"
                >
                  <Printer aria-hidden size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MethodIcon({ method }: { method: PaymentMethod }) {
  if (method === 'cash') return <Banknote aria-hidden size={16} />;
  if (method === 'card') return <CreditCard aria-hidden size={16} />;
  return <Landmark aria-hidden size={16} />;
}
