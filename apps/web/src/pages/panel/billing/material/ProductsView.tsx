import { Pencil } from 'lucide-react';

import { formatCents } from '@/features/billing/money';
import type { Product } from '@/features/equipment/api';
import { useProducts } from '@/features/equipment/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';

import type { MaterialDialog } from './MaterialTab';

/** «Talla: 8, 10, 12 · Nombre a estampar (texto)». */
function fieldsSummary(product: Product): string {
  if (product.fields.length === 0) return 'Sin campos';
  return product.fields
    .map((f) => (f.kind === 'options' ? `${f.name}: ${f.options.join(', ')}` : `${f.name} (texto)`))
    .join(' · ');
}

export function ProductsView({ onDialog }: { onDialog: (dialog: MaterialDialog) => void }) {
  const products = useProducts();
  if (products.isPending) return <p className="p-5 text-ink-muted">Cargando productos…</p>;
  if (products.isError) return <Alert>No se han podido cargar los productos.</Alert>;
  if (products.data.length === 0)
    return (
      <Card>
        <p className="px-5 py-12 text-center text-ink-muted">
          Aún no hay productos. Crea el primero (p. ej. un chándal con sus tallas) con «Nuevo
          producto».
        </p>
      </Card>
    );
  return (
    <Card>
      <ul aria-label="Productos" className="divide-y divide-line-soft">
        {products.data.map((product) => (
          <li key={product.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-medium">
                {product.name}
                {!product.active && <Badge>Retirado</Badge>}
              </span>
              <span className="block text-ink-muted">{fieldsSummary(product)}</span>
            </span>
            <span className="font-semibold">{formatCents(product.priceCents)}</span>
            <button
              type="button"
              aria-label={`Editar ${product.name}`}
              title="Editar"
              onClick={() => onDialog({ type: 'product', product })}
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong text-ink-soft hover:bg-surface-muted"
            >
              <Pencil aria-hidden size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
