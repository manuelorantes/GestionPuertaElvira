import type { Order, OrderState } from './api';

export const ORDER_STATE: Record<
  OrderState,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  reserved: { label: 'Reservado', tone: 'neutral' },
  ordered: { label: 'Pedido', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

/** Lo pedido: producto, lo elegido y la cantidad. */
export function orderLabel(order: Order): string {
  const product = [order.productName, order.detail].filter(Boolean).join(' · ');
  return order.quantity > 1 ? `${order.quantity} × ${product}` : product;
}
