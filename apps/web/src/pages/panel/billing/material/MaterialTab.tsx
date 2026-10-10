import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { deletePurchase, type Order, type Product, type Purchase } from '@/features/equipment/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

import type { BillingDialog } from '../BillingPage';
import { MarginsView } from './MarginsView';
import { CancelOrderDialog, DeliverDialog, PriceDialog } from './OrderActionDialogs';
import { OrderDialog } from './OrderDialog';
import { OrdersView } from './OrdersView';
import { ProductDialog } from './ProductDialog';
import { ProductsView } from './ProductsView';
import { PurchaseDialog } from './PurchaseDialog';
import { StockView } from './StockView';

export type MaterialDialog =
  | { type: 'order'; order?: Order }
  | { type: 'place' | 'price' | 'deliver' | 'cancel' | 'pay'; order: Order }
  | { type: 'product'; product?: Product }
  | { type: 'purchase' | 'delete-purchase'; purchase?: Purchase }
  | null;

type View = 'pedidos' | 'stock' | 'margen' | 'productos';

const VIEWS: { id: View; label: string; action: string }[] = [
  { id: 'pedidos', label: 'Pedidos', action: 'Apuntar pedido' },
  { id: 'stock', label: 'Stock y compras', action: 'Registrar compra' },
  { id: 'margen', label: 'Margen', action: '' },
  { id: 'productos', label: 'Productos', action: 'Nuevo producto' },
];

/** «Material deportivo» en Cobros: pedidos del alumnado, stock y compras, margen y productos. */
export function MaterialTab({ onAction }: { onAction: (dialog: BillingDialog) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.find((v) => v.id === searchParams.get('vista'))?.id ?? 'pedidos';
  const [dialog, setDialog] = useState<MaterialDialog>(null);
  const action = VIEWS.find((v) => v.id === view)?.action ?? '';

  function show(next: View) {
    const params = new URLSearchParams(searchParams);
    params.set('vista', next);
    setSearchParams(params, { replace: true });
  }

  function open(next: MaterialDialog) {
    // Cobrar un pedido es registrar un cobro de Cobros, con ese pedido elegido.
    if (next?.type === 'pay') {
      onAction({
        type: 'payment',
        studentId: next.order.studentId,
        kind: 'material',
        ...(next.order.chargeId ? { chargeId: next.order.chargeId } : {}),
      });
      return;
    }
    setDialog(next);
  }

  function create() {
    if (view === 'pedidos') setDialog({ type: 'order' });
    if (view === 'stock') setDialog({ type: 'purchase' });
    if (view === 'productos') setDialog({ type: 'product' });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Material a ver" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <ToggleButton
              key={v.id}
              tone="ink"
              pressed={view === v.id}
              onClick={() => show(v.id)}
              className="h-9 rounded-full font-medium"
            >
              {v.label}
            </ToggleButton>
          ))}
        </div>
        {action && (
          <Button size="md" className="ml-auto" onClick={create}>
            <Plus aria-hidden size={18} />
            {action}
          </Button>
        )}
      </div>
      {view === 'pedidos' && <OrdersView onDialog={open} />}
      {view === 'stock' && <StockView onDialog={open} />}
      {view === 'margen' && <MarginsView />}
      {view === 'productos' && <ProductsView onDialog={open} />}
      <MaterialDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Diálogos del material, compartidos con la ficha del alumno. */
export function MaterialDialogs({
  dialog,
  onClose,
  studentId,
}: {
  dialog: MaterialDialog;
  onClose: () => void;
  studentId?: string;
}) {
  if (dialog === null) return null;
  switch (dialog.type) {
    case 'order':
      return <OrderDialog order={dialog.order} studentId={studentId} onClose={onClose} />;
    case 'place':
    case 'price':
      return (
        <PriceDialog
          order={dialog.order}
          mode={dialog.type === 'place' ? 'place' : 'change'}
          onClose={onClose}
        />
      );
    case 'deliver':
      return <DeliverDialog order={dialog.order} onClose={onClose} />;
    case 'cancel':
      return <CancelOrderDialog order={dialog.order} onClose={onClose} />;
    case 'product':
      return <ProductDialog product={dialog.product} onClose={onClose} />;
    case 'purchase':
      return <PurchaseDialog purchase={dialog.purchase} onClose={onClose} />;
    case 'delete-purchase':
      return dialog.purchase ? (
        <DeletePurchaseDialog purchase={dialog.purchase} onClose={onClose} />
      ) : null;
    default:
      return null;
  }
}

function DeletePurchaseDialog({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const remove = useBillingMutation(deletePurchase);
  const toast = useToast();
  return (
    <ConfirmDialog
      title="Borrar compra"
      message={`¿Seguro que quieres borrar la compra de ${purchase.units} ${purchase.productName.toLowerCase()}? Sus unidades dejan de contar en el stock y en el margen.`}
      confirmLabel="Sí, borrarla"
      busy={remove.isPending}
      error={remove.isError ? apiErrorMessage(remove.error) : null}
      onCancel={onClose}
      onConfirm={() =>
        void remove.mutateAsync(purchase.id).then(
          () => {
            toast('Compra borrada');
            onClose();
          },
          () => undefined,
        )
      }
    />
  );
}
