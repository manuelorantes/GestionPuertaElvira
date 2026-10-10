import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { formatCents } from '@/features/billing/money';
import { orderLabel } from '@/features/equipment/labels';
import { useOrders } from '@/features/equipment/hooks';
import { formatDate } from '@/features/students/format';
import { BillingDialogs, type BillingDialog } from '@/pages/panel/billing/BillingPage';
import { MaterialDialogs, type MaterialDialog } from '@/pages/panel/billing/material/MaterialTab';
import { OrderBadges } from '@/pages/panel/billing/material/OrdersView';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';

/** Tarjeta «Material deportivo» de la ficha: sus pedidos con su estado, apuntar uno nuevo y cobrarlos. */
export function StudentMaterialCard({
  studentId,
  title,
}: {
  studentId: string;
  title: (text: string) => React.ReactNode;
}) {
  const orders = useOrders({ open: false, studentId });
  const [dialog, setDialog] = useState<MaterialDialog>(null);
  const [billing, setBilling] = useState<BillingDialog>(null);
  const items = orders.data ?? [];

  return (
    <Card className="p-4">
      {title('Material deportivo')}
      {orders.isPending && <p className="text-sm text-ink-muted">Cargando…</p>}
      {orders.isError && (
        <p className="text-sm text-ink-muted">No se han podido cargar sus pedidos.</p>
      )}
      {orders.isSuccess && items.length === 0 && (
        <p className="text-sm text-ink-muted">Sin pedidos de material.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Pedidos de material del alumno">
          {items.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center gap-2 border-t border-line-soft py-2 text-sm first:border-t-0"
            >
              <span className="min-w-40 flex-1">
                <span className="block">{orderLabel(order)}</span>
                <span className="block text-[12px] text-ink-muted">
                  {formatDate(order.createdOn)}
                  {order.priceCents !== null && ` · ${formatCents(order.priceCents)}`}
                </span>
              </span>
              <OrderBadges order={order} />
              {order.status === 'ordered' && order.chargeId && (
                <button
                  type="button"
                  onClick={() =>
                    setBilling({
                      type: 'payment',
                      studentId,
                      kind: 'material',
                      chargeId: order.chargeId ?? '',
                    })
                  }
                  className="inline-flex h-8 cursor-pointer items-center rounded-sm bg-brand px-3 text-[13px] font-semibold text-surface-raised hover:bg-brand-strong"
                >
                  Cobrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setDialog({ type: 'order' })}>
          <Plus aria-hidden size={16} />
          Apuntar pedido
        </Button>
        <Link to="/panel/cobros?pestana=material" className="text-[13px] font-semibold text-brand">
          Ver en Material deportivo
        </Link>
      </div>
      <MaterialDialogs dialog={dialog} onClose={() => setDialog(null)} studentId={studentId} />
      <BillingDialogs dialog={billing} onChange={setBilling} />
    </Card>
  );
}
