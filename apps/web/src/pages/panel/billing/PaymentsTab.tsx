import { Banknote, Landmark, Printer } from 'lucide-react';

import { usePayments } from '@/features/billing/hooks';
import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';

export function PaymentsTab({ onOpenReceipt }: { onOpenReceipt: (paymentId: string) => void }) {
  const payments = usePayments();
  const items = payments.data ?? [];

  if (payments.isPending) return <p className="text-ink-muted">Cargando cobros…</p>;
  if (items.length === 0)
    return <p className="text-ink-muted">Todavía no hay cobros registrados.</p>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <caption className="sr-only">Cobros registrados</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {['Fecha', 'Recibo', 'Alumno', 'Concepto', 'Forma de pago'].map((heading) => (
              <th key={heading} scope="col" className="px-5 py-3 font-semibold">
                {heading}
              </th>
            ))}
            <th scope="col" className="px-5 py-3 text-right font-semibold">
              Importe
            </th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((payment) => (
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
              <td className="px-5 py-3 font-medium">{payment.studentName}</td>
              <td className="px-5 py-3">{payment.concept}</td>
              <td className="px-5 py-3 text-ink-soft">
                <span className="inline-flex items-center gap-2">
                  {payment.method === 'cash' ? (
                    <Banknote aria-hidden size={16} />
                  ) : (
                    <Landmark aria-hidden size={16} />
                  )}
                  {payment.method === 'cash' ? 'Efectivo' : 'Transferencia'}
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
