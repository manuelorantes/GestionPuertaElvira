import { useState } from 'react';

import { centsFromText, centsToText, formatCents } from '@/features/billing/money';
import {
  createPurchase,
  type Product,
  type Purchase,
  updatePurchase,
} from '@/features/equipment/api';
import { useProducts } from '@/features/equipment/hooks';
import { todayIso } from '@/features/students/format';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { DateField } from '@/shared/ui/DateField';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { FormDialog } from './FormDialog';

interface Variant {
  key: string;
  label: string;
  values: Record<string, string>;
}

/** Todas las variantes de un producto: cada combinación de las opciones de sus campos de lista. */
function variantsOf(product: Product): Variant[] {
  let variants: Variant[] = [{ key: '', label: '', values: {} }];
  for (const field of product.fields.filter((f) => f.kind === 'options')) {
    variants = variants.flatMap((v) =>
      field.options.map((option) => ({
        key: `${v.key}|${field.id}=${option}`,
        label: [v.label, `${field.name} ${option}`].filter(Boolean).join(' · '),
        values: { ...v.values, [field.id]: option },
      })),
    );
  }
  return variants;
}

const sameValues = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k, v]) => b[k] === v);

/** Registrar o corregir una compra al proveedor: el lote entero (coste total) y cuántas de cada variante. */
export function PurchaseDialog({
  purchase,
  onClose,
}: {
  purchase?: Purchase | undefined;
  onClose: () => void;
}) {
  const products = useProducts();
  const refresh = useRefreshClubData();
  const toast = useToast();
  const [productId, setProductId] = useState(purchase?.productId ?? '');
  const [date, setDate] = useState(purchase?.boughtOn ?? todayIso());
  const [cost, setCost] = useState(purchase ? centsToText(purchase.costCents) : '');
  const [note, setNote] = useState(purchase?.note ?? '');
  const product = products.data?.find((p) => p.id === productId);
  const variants = product ? variantsOf(product) : [];
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const year = new Date().getFullYear();

  /** Lo escrito o, al corregir, lo que ya tenía la compra. */
  function quantityOf(variant: Variant): string {
    if (variant.key in quantities) return quantities[variant.key] ?? '';
    const line = purchase?.lines.find((l) => sameValues(l.values, variant.values));
    return line ? String(line.quantity) : '';
  }
  const units = variants.reduce((sum, v) => sum + (Number(quantityOf(v)) || 0), 0);
  const costCents = centsFromText(cost);

  function submit() {
    if (!product) return 'Elige el producto.';
    if (costCents === null) return 'Indica lo que costó el lote, con hasta dos decimales.';
    const lines = variants
      .map((v) => ({ values: v.values, quantity: Number(quantityOf(v)) || 0 }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) return 'Indica cuántas unidades se compran.';
    const input = { productId: product.id, date, costCents, note: note.trim() || null, lines };
    const request = purchase
      ? updatePurchase({ id: purchase.id, ...input })
      : createPurchase(input);
    return request.then(() => {
      refresh();
      toast(purchase ? 'Compra corregida' : 'Compra registrada');
    });
  }

  return (
    <FormDialog
      title={purchase ? 'Corregir compra' : 'Registrar compra'}
      confirmLabel={purchase ? 'Guardar' : 'Registrar compra'}
      size="wide"
      onClose={onClose}
      onSubmit={submit}
    >
      {purchase ? (
        <p className="text-sm font-semibold">{purchase.productName}</p>
      ) : (
        <Select
          label="Producto"
          value={productId}
          onChange={(id) => {
            setProductId(id);
            setQuantities({});
          }}
          options={[
            { value: '', label: 'Elige un producto' },
            ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label="Fecha de la compra"
          value={date}
          onChange={setDate}
          fromYear={year - 2}
          toYear={year}
        />
        <TextField
          label="Coste del lote entero (€)"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ''))}
        />
      </div>
      {product && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Unidades</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {variants.map((variant) => (
              <TextField
                key={variant.key}
                label={variant.label || product.name}
                inputMode="numeric"
                value={quantityOf(variant)}
                onChange={(e) =>
                  setQuantities({ ...quantities, [variant.key]: e.target.value.replace(/\D/g, '') })
                }
              />
            ))}
          </div>
        </fieldset>
      )}
      {units > 0 && costCents !== null && (
        <p className="rounded-sm bg-sand p-3 text-sm">
          {units} {units === 1 ? 'unidad' : 'unidades'} ·{' '}
          {formatCents(Math.round(costCents / units))} cada una
        </p>
      )}
      <TextField
        label="Nota (opcional)"
        placeholder="p. ej. proveedor o número de pedido"
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />
    </FormDialog>
  );
}
