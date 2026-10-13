import { Pencil, Trash2 } from 'lucide-react';

import { formatCents } from '@/features/billing/money';
import type { ProductStock } from '@/features/equipment/api';
import { usePurchases, useStock } from '@/features/equipment/hooks';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import type { MaterialDialog } from './MaterialTab';

const HEAD = 'px-4 py-2.5 text-right font-semibold first:text-left';
const CELL = 'px-4 py-2 text-right first:text-left';
const ICON =
  'inline-flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong text-ink-soft hover:bg-surface-muted';

/** Una variante con su posición en el orden de las opciones del producto (8, 10, 12…), que es como llegan. */
type StockRow = ProductStock['variants'][number] & { position: number };

type Column = 'variant' | 'bought' | 'delivered' | 'inStock' | 'awaiting' | 'toBuy';

const COLUMNS: Record<Column, SortColumn<StockRow>> = {
  // Por el orden de las opciones del producto, no alfabético (8 antes que 10; S, M, L).
  variant: { label: 'Variante', name: 'variante', value: (v) => v.position },
  bought: { label: 'Compradas', name: 'compradas', value: (v) => v.bought },
  delivered: { label: 'Entregadas', name: 'entregadas', value: (v) => v.delivered },
  inStock: { label: 'En stock', name: 'en stock', value: (v) => v.inStock },
  awaiting: {
    label: 'Apuntadas sin entregar',
    name: 'apuntadas sin entregar',
    value: (v) => v.awaiting,
  },
  toBuy: { label: 'Faltan por comprar', name: 'faltan por comprar', value: (v) => v.toBuy },
};

/** El stock de un producto, variante a variante. */
function ProductStockTable({ product }: { product: ProductStock }) {
  const { header, apply } = useTableSort(COLUMNS, { key: 'variant' });
  const rows = product.variants.map((v, position) => ({ ...v, position }));
  return (
    <Card className="overflow-x-auto">
      <h3 className="flex items-center gap-2 px-4 pt-4 font-semibold">
        {product.productName}
        {!product.active && <Badge>Retirado</Badge>}
      </h3>
      <table className="mt-2 w-full min-w-[620px] text-sm">
        <caption className="sr-only">Stock de {product.productName}</caption>
        <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {(Object.keys(COLUMNS) as Column[]).map((key) => (
              <th key={key} scope="col" className={HEAD}>
                {header(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apply(rows).map((v) => (
            <tr key={v.variantKey} className="border-b border-line-soft last:border-b-0">
              <td className={CELL}>{v.variantLabel || product.productName}</td>
              <td className={CELL}>{v.bought}</td>
              <td className={CELL}>{v.delivered}</td>
              <td className={`${CELL} font-semibold`}>{v.inStock}</td>
              <td className={CELL}>{v.awaiting}</td>
              <td
                className={`${CELL} ${v.toBuy > 0 ? 'font-semibold text-danger-fg' : 'text-ink-muted'}`}
              >
                {v.toBuy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Stock por producto y variante (con lo que falta comprar) y las compras al proveedor. */
export function StockView({ onDialog }: { onDialog: (dialog: MaterialDialog) => void }) {
  const stock = useStock();
  const purchases = usePurchases();

  return (
    <div className="flex flex-col gap-6">
      {stock.isPending && <p className="text-ink-muted">Cargando stock…</p>}
      {stock.isError && <Alert>No se ha podido cargar el stock.</Alert>}
      {stock.data?.length === 0 && (
        <Card>
          <p className="px-5 py-12 text-center text-ink-muted">
            Sin compras ni pedidos todavía. Registra una compra para tener stock.
          </p>
        </Card>
      )}
      {stock.data?.map((product) => (
        <ProductStockTable key={product.productId} product={product} />
      ))}
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-xl font-bold tracking-[0.04em] uppercase">Compras</h3>
        {purchases.isError && <Alert>No se han podido cargar las compras.</Alert>}
        {purchases.data?.length === 0 && (
          <p className="text-sm text-ink-muted">Aún no se ha registrado ninguna compra.</p>
        )}
        {purchases.data && purchases.data.length > 0 && (
          <Card>
            <ul aria-label="Compras al proveedor" className="divide-y divide-line-soft">
              {purchases.data.map((purchase) => (
                <li
                  key={purchase.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
                >
                  <span className="w-24 shrink-0 text-ink-muted">
                    {formatDate(purchase.boughtOn)}
                  </span>
                  <span className="min-w-48 flex-1">
                    <span className="block font-medium">
                      {purchase.productName} · {purchase.units}{' '}
                      {purchase.units === 1 ? 'unidad' : 'unidades'}
                    </span>
                    <span className="block text-ink-muted">
                      {purchase.lines
                        .map((l) =>
                          l.variantLabel ? `${l.variantLabel}: ${l.quantity}` : `${l.quantity}`,
                        )
                        .join(' · ')}
                      {purchase.note && ` · ${purchase.note}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{formatCents(purchase.costCents)}</span>
                    <span className="block text-[12px] text-ink-muted">
                      {formatCents(purchase.unitCostCents)}/unidad
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      aria-label={`Corregir la compra de ${purchase.productName} del ${formatDate(purchase.boughtOn)}`}
                      title="Corregir"
                      onClick={() => onDialog({ type: 'purchase', purchase })}
                      className={ICON}
                    >
                      <Pencil aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Borrar la compra de ${purchase.productName} del ${formatDate(purchase.boughtOn)}`}
                      title="Borrar"
                      onClick={() => onDialog({ type: 'delete-purchase', purchase })}
                      className={`${ICON} hover:text-danger-fg`}
                    >
                      <Trash2 aria-hidden size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
