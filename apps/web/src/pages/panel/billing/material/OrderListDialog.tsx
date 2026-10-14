import { Printer } from 'lucide-react';
import { useState } from 'react';

import { formatCents } from '@/features/billing/money';
import { formatDate, todayIso } from '@/features/students/format';
import type { Order, OrderState, Product } from '@/features/equipment/api';
import { useOrders, useProducts } from '@/features/equipment/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { ToggleButton } from '@/shared/ui/ToggleButton';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

const HEAD = 'px-3 py-2 text-left font-semibold';
const CELL = 'px-3 py-2 text-left';

type Scope = 'reserved' | 'ordered' | 'both';

const SCOPES: { value: Scope; label: string; states: OrderState[] }[] = [
  { value: 'reserved', label: 'Reservados', states: ['reserved'] },
  { value: 'ordered', label: 'Pedidos', states: ['ordered'] },
  { value: 'both', label: 'Reservados y pedidos', states: ['reserved', 'ordered'] },
];

/** Lo que se cobra (o se cobraría) por el pedido: su precio, o el del producto por la cantidad si aún no lo tiene. */
function priceOf(order: Order, product: Product): number {
  return order.priceCents ?? product.priceCents * order.quantity;
}

/** Los pedidos de un producto, con una columna por cada campo (lo que falta por rellenar sale como «-»). */
function ProductOrdersTable({
  product,
  orders,
  withPrices,
}: {
  product: Product;
  orders: Order[];
  withPrices: boolean;
}) {
  const columns: Record<string, SortColumn<Order>> = {
    student: { label: 'Alumno', name: 'alumno', value: (o) => o.studentName },
    quantity: { label: 'Cantidad', name: 'cantidad', value: (o) => o.quantity },
    ...Object.fromEntries(
      product.fields.map((f) => [
        `field:${f.id}`,
        {
          label: f.name,
          name: f.name.toLocaleLowerCase('es'),
          value: (o: Order) => o.values[f.id] || null,
        },
      ]),
    ),
    ...(withPrices
      ? { price: { label: 'Precio', name: 'precio', value: (o) => priceOf(o, product) } }
      : {}),
  };
  const { header, apply } = useTableSort(columns, { key: 'student' });
  const keys = Object.keys(columns);
  const total = orders.reduce((sum, o) => sum + priceOf(o, product), 0);
  return (
    <section className="overflow-x-auto">
      <h3 className="mb-1 font-semibold">
        {product.name}{' '}
        <span className="font-normal text-ink-muted">
          ({orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'})
        </span>
      </h3>
      <table className="w-full text-sm">
        <caption className="sr-only">Listado de {product.name}</caption>
        <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {keys.map((key) => (
              <th key={key} scope="col" className={HEAD}>
                {header(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apply(orders).map((o) => (
            <tr key={o.id} className="border-b border-line-soft last:border-b-0">
              <td className={`${CELL} font-medium`}>{o.studentName}</td>
              <td className={CELL}>{o.quantity}</td>
              {product.fields.map((f) => (
                <td key={f.id} className={`${CELL} ${o.values[f.id] ? '' : 'text-danger-fg'}`}>
                  {o.values[f.id] || '-'}
                </td>
              ))}
              {withPrices && <td className={CELL}>{formatCents(priceOf(o, product))}</td>}
            </tr>
          ))}
        </tbody>
        {withPrices && (
          <tfoot className="border-t border-line font-semibold">
            <tr>
              <td className={CELL} colSpan={keys.length - 1}>
                Total {product.name.toLocaleLowerCase('es')}
              </td>
              <td className={CELL}>{formatCents(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

/**
 * «Generar listado»: los pedidos reservados (o los pedidos, o ambos) agrupados por producto, con el alumno y los
 * campos de cada uno («-» en lo que falta por rellenar), eligiendo qué productos listar y si se ven los precios.
 * «Imprimir» saca solo lo que se ve (y desde ahí se guarda en PDF).
 */
export function OrderListDialog({ onClose }: { onClose: () => void }) {
  const [scope, setScope] = useState<Scope>('reserved');
  const [withPrices, setWithPrices] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const states = SCOPES.find((s) => s.value === scope)?.states ?? [];
  const orders = useOrders({ open: true, status: scope === 'both' ? '' : scope });
  const products = useProducts();

  const listed = (orders.data ?? []).filter((o) => states.includes(o.status));
  const listedProducts = (products.data ?? []).filter((p) =>
    listed.some((o) => o.productId === p.id),
  );
  const canPrint = listedProducts.some((p) => !hidden.has(p.id));

  function toggleProduct(id: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderBody() {
    if (orders.isPending || products.isPending)
      return <p className="text-ink-muted">Cargando pedidos…</p>;
    if (orders.isError || products.isError)
      return <Alert>No se han podido cargar los pedidos.</Alert>;
    if (listedProducts.length === 0)
      return (
        <p className="text-ink-muted">
          No hay {SCOPES.find((s) => s.value === scope)?.label.toLocaleLowerCase('es')} que listar.
        </p>
      );
    const shown = listedProducts.filter((p) => !hidden.has(p.id));
    return (
      <>
        <h2 className="hidden font-display text-xl font-bold tracking-[0.04em] uppercase print:block">
          {SCOPES.find((s) => s.value === scope)?.label} · {formatDate(todayIso())}
        </h2>
        <div
          role="group"
          aria-label="Productos a listar"
          className="flex flex-wrap gap-2 print:hidden"
        >
          {listedProducts.map((p) => (
            <ToggleButton
              key={p.id}
              tone="soft"
              pressed={!hidden.has(p.id)}
              onClick={() => toggleProduct(p.id)}
              className="h-9"
            >
              {p.name}
            </ToggleButton>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="text-ink-muted">Elige al menos un producto.</p>
        ) : (
          shown.map((p) => (
            <ProductOrdersTable
              key={p.id}
              product={p}
              orders={listed.filter((o) => o.productId === p.id)}
              withPrices={withPrices}
            />
          ))
        )}
      </>
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="order-list-title" size="large">
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-5">
        <h2
          id="order-list-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Listado de pedidos
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <Select
            label="Qué listar"
            value={scope}
            onChange={(value) => setScope(value as Scope)}
            options={SCOPES.map((s) => ({ value: s.value, label: s.label }))}
          />
          <Switch label="Con precios" checked={withPrices} onChange={setWithPrices} />
        </div>
      </div>
      {/* `receipt-sheet`: al imprimir solo sale el listado, como con los recibos. */}
      <div className="receipt-sheet flex flex-col gap-5 p-6 print:p-0">{renderBody()}</div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 print:hidden">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        <Button onClick={() => window.print()} disabled={!canPrint}>
          <Printer aria-hidden size={18} />
          Imprimir
        </Button>
      </div>
    </Dialog>
  );
}
