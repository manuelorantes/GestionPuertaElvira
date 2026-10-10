import { useState } from 'react';

import { centsFromText, centsToText, formatCents } from '@/features/billing/money';
import {
  cancelOrder,
  changeOrderPrice,
  deliverOrder,
  editOrder,
  type Order,
  placeOrder,
} from '@/features/equipment/api';
import { useProducts } from '@/features/equipment/hooks';
import { orderLabel } from '@/features/equipment/labels';
import { todayIso } from '@/features/students/format';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { DateField } from '@/shared/ui/DateField';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { FormDialog } from './FormDialog';
import { ProductFields } from './OrderDialog';

/** Pasar a pedido (pone precio y genera el cobro) o corregir el precio de uno sin nada cobrado. */
export function PriceDialog({
  order,
  mode,
  onClose,
}: {
  order: Order;
  mode: 'place' | 'change';
  onClose: () => void;
}) {
  const products = useProducts();
  const refresh = useRefreshClubData();
  const toast = useToast();
  const product = products.data?.find((p) => p.id === order.productId);
  const proposed = order.priceCents ?? (product ? product.priceCents * order.quantity : null);
  const [price, setPrice] = useState(proposed === null ? '' : centsToText(proposed));
  // Una reserva con campos de lista sin elegir: se eligen aquí antes de pasarla a pedido.
  const [values, setValues] = useState(order.values);
  const missing = mode === 'place' ? order.missing : [];
  const shown = price === '' && proposed !== null ? centsToText(proposed) : price;

  return (
    <FormDialog
      title={mode === 'place' ? 'Pasar a pedido' : 'Cambiar precio'}
      confirmLabel={mode === 'place' ? 'Pasar a pedido' : 'Guardar precio'}
      onClose={onClose}
      onSubmit={() => {
        const priceCents = centsFromText(shown);
        if (priceCents === null) return 'Indica el precio con hasta dos decimales.';
        const unchosen = product?.fields.find(
          (f) => missing.includes(f.name) && !f.options.includes(values[f.id] ?? ''),
        );
        if (unchosen) return `Antes de pasarlo a pedido, elige ${unchosen.name.toLowerCase()}.`;
        const request = mode === 'place' ? placeOrder : changeOrderPrice;
        const completed =
          missing.length > 0
            ? editOrder(order.id, { quantity: order.quantity, values, note: order.note })
            : Promise.resolve();
        return completed
          .then(() => request({ id: order.id, priceCents }))
          .then(() => {
            refresh();
            toast(
              mode === 'place' ? `Cobro de ${formatCents(priceCents)} generado` : 'Precio cambiado',
            );
          });
      }}
    >
      <p className="text-sm">
        <span className="font-semibold">{order.studentName}</span> · {orderLabel(order)}
      </p>
      {product && missing.length > 0 && (
        <>
          <p className="text-sm text-ink-soft">
            Falta elegir {missing.map((m) => m.toLowerCase()).join(' y ')}:
          </p>
          <ProductFields product={product} values={values} onChange={setValues} only={missing} />
        </>
      )}
      <TextField
        label="Precio total (€)"
        inputMode="decimal"
        value={shown}
        onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
        {...(product && {
          help: `Precio del producto: ${formatCents(product.priceCents)}${order.quantity > 1 ? ` × ${order.quantity}` : ''}.`,
        })}
      />
      <p className="text-[13px] text-ink-muted">
        {mode === 'place'
          ? 'Se genera un cobro al alumno por este importe: sale en «Cuotas» y en su ficha, y pasa a pagado al cobrarlo.'
          : 'El cobro del alumno cambia a este importe (solo mientras no tenga nada cobrado).'}
      </p>
    </FormDialog>
  );
}

/** Entregar al alumno: descuenta del stock la variante del pedido. */
export function DeliverDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const refresh = useRefreshClubData();
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const year = new Date().getFullYear();
  return (
    <FormDialog
      title="Entregar"
      confirmLabel="Marcar como entregado"
      onClose={onClose}
      onSubmit={() =>
        deliverOrder({ id: order.id, date }).then(() => {
          refresh();
          toast('Entregado');
        })
      }
    >
      <p className="text-sm">
        <span className="font-semibold">{order.studentName}</span> · {orderLabel(order)}
      </p>
      <DateField
        label="Día de la entrega"
        value={date}
        onChange={setDate}
        fromYear={year - 1}
        toYear={year}
      />
      <p className="text-[13px] text-ink-muted">
        Se descuenta del stock{order.variantLabel ? ` de ${order.variantLabel.toLowerCase()}` : ''}.
        Si no quedan unidades, registra antes la compra en «Stock y compras».
      </p>
    </FormDialog>
  );
}

/** Cancelar un pedido: su cobro deja de deberse en lo pendiente; si estaba entregado, se elige si vuelve al stock. */
export function CancelOrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const refresh = useRefreshClubData();
  const toast = useToast();
  const [returnToStock, setReturnToStock] = useState(true);
  const pending = order.dueCents - order.coveredCents;
  return (
    <FormDialog
      title="Cancelar pedido"
      confirmLabel="Sí, cancelarlo"
      onClose={onClose}
      onSubmit={() =>
        cancelOrder({ id: order.id, returnToStock }).then(() => {
          refresh();
          toast('Pedido cancelado');
        })
      }
    >
      <p className="text-sm">
        ¿Seguro que quieres cancelar {orderLabel(order)} de{' '}
        <span className="font-semibold">{order.studentName}</span>?
      </p>
      {order.chargeId && (
        <p className="text-sm text-ink-soft">
          {order.coveredCents > 0
            ? `Se cancelan los ${formatCents(pending)} que faltan y se conservan los ${formatCents(order.coveredCents)} ya cobrados.`
            : `Su cobro de ${formatCents(order.dueCents)} deja de deberse.`}{' '}
          Se puede reactivar después.
        </p>
      )}
      {order.deliveredOn && (
        <Switch
          label="Lo ha devuelto: vuelve al stock"
          checked={returnToStock}
          onChange={setReturnToStock}
        />
      )}
    </FormDialog>
  );
}
