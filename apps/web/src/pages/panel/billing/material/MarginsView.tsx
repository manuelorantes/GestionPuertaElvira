import { formatCents } from '@/features/billing/money';
import { useMargins } from '@/features/equipment/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';

const HEAD = 'px-4 py-2.5 text-right font-semibold first:text-left';
const CELL = 'px-4 py-2 text-right first:text-left';
const money = (cents: number | null) => (cents === null ? '—' : formatCents(cents));

/** Comprado frente a vendido por producto, con el coste medio de todo lo comprado. */
export function MarginsView() {
  const margins = useMargins();
  if (margins.isPending) return <p className="text-ink-muted">Calculando márgenes…</p>;
  if (margins.isError) return <Alert>No se han podido calcular los márgenes.</Alert>;
  const { products, totals } = margins.data;
  if (products.length === 0)
    return (
      <Card>
        <p className="px-5 py-12 text-center text-ink-muted">Aún no hay productos.</p>
      </Card>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Comprado
          </span>
          <p className="font-display text-3xl font-bold">{formatCents(totals.spentCents)}</p>
          <p className="text-sm text-ink-muted">{totals.unitsBought} unidades</p>
        </Card>
        <Card className="px-5 py-4">
          <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Vendido
          </span>
          <p className="font-display text-3xl font-bold">{formatCents(totals.revenueCents)}</p>
          <p className="text-sm text-ink-muted">
            {totals.unitsSold} unidades · cobrado {formatCents(totals.collectedCents)}
          </p>
        </Card>
        <Card className="px-5 py-4">
          <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Margen de lo vendido
          </span>
          <p className="font-display text-3xl font-bold text-brand-strong">
            {money(totals.marginCents)}
          </p>
          <p className="text-sm text-ink-muted">Ingresos menos el coste medio de lo vendido</p>
        </Card>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <caption className="sr-only">Margen por producto</caption>
          <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {[
                'Producto',
                'Compradas',
                'Gastado',
                'Coste medio',
                'Vendidas',
                'Ingresos',
                'Cobrado',
                'Margen/unidad',
                'Margen',
              ].map((heading) => (
                <th key={heading} scope="col" className={HEAD}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((m) => (
              <tr key={m.productId} className="border-b border-line-soft">
                <td className={`${CELL} font-medium`}>{m.productName}</td>
                <td className={CELL}>{m.unitsBought}</td>
                <td className={CELL}>{formatCents(m.spentCents)}</td>
                <td className={CELL}>{money(m.averageCostCents)}</td>
                <td className={CELL}>{m.unitsSold}</td>
                <td className={CELL}>{formatCents(m.revenueCents)}</td>
                <td className={CELL}>{formatCents(m.collectedCents)}</td>
                <td className={CELL}>{money(m.marginPerUnitCents)}</td>
                <td className={`${CELL} font-semibold`}>{money(m.marginCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-semibold">
            <tr>
              <td className={CELL}>Total</td>
              <td className={CELL}>{totals.unitsBought}</td>
              <td className={CELL}>{formatCents(totals.spentCents)}</td>
              <td className={CELL} />
              <td className={CELL}>{totals.unitsSold}</td>
              <td className={CELL}>{formatCents(totals.revenueCents)}</td>
              <td className={CELL}>{formatCents(totals.collectedCents)}</td>
              <td className={CELL} />
              <td className={CELL}>{money(totals.marginCents)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-[13px] text-ink-muted">
        Coste medio: todo lo gastado en compras del producto entre todas las unidades compradas.
        Vendidas: pedidos con precio sin cancelar. Sin compras, el margen no se puede calcular (—).
      </p>
    </div>
  );
}
