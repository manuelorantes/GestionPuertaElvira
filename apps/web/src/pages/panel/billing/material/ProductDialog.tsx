import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { centsFromText, centsToText } from '@/features/billing/money';
import {
  createProduct,
  type FieldKind,
  type Product,
  updateProduct,
} from '@/features/equipment/api';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { FormDialog } from './FormDialog';

/** Un campo tal como se edita: las opciones, separadas por comas. */
interface FieldDraft {
  key: number;
  id: string;
  name: string;
  kind: FieldKind;
  options: string;
}

const splitOptions = (text: string) =>
  text
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

/** Crear o editar un producto: nombre, precio por defecto y sus campos (de lista o de texto). */
export function ProductDialog({
  product,
  onClose,
}: {
  product?: Product | undefined;
  onClose: () => void;
}) {
  const refresh = useRefreshClubData();
  const toast = useToast();
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? centsToText(product.priceCents) : '');
  const [active, setActive] = useState(product?.active ?? true);
  const [fields, setFields] = useState<FieldDraft[]>(
    (product?.fields ?? []).map((f, key) => ({ ...f, key, options: f.options.join(', ') })),
  );
  const [nextKey, setNextKey] = useState(fields.length);

  const change = (key: number, patch: Partial<FieldDraft>) =>
    setFields(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  function submit() {
    if (!name.trim()) return 'Indica el nombre del producto.';
    const priceCents = centsFromText(price);
    if (priceCents === null) return 'Indica el precio con hasta dos decimales.';
    const input = {
      name: name.trim(),
      priceCents,
      active,
      fields: fields.map((f) => ({
        id: f.id,
        name: f.name.trim(),
        kind: f.kind,
        options: f.kind === 'options' ? splitOptions(f.options) : [],
      })),
    };
    const request = product ? updateProduct({ id: product.id, ...input }) : createProduct(input);
    return request.then(() => {
      refresh();
      toast(product ? 'Producto guardado' : 'Producto creado');
    });
  }

  return (
    <FormDialog
      title={product ? 'Editar producto' : 'Nuevo producto'}
      confirmLabel={product ? 'Guardar' : 'Crear producto'}
      size="wide"
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <TextField
          label="Nombre"
          placeholder="p. ej. Chándal"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Precio de venta (€)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Campos</legend>
        <p className="text-[13px] text-ink-muted">
          De lista: hay que elegir una opción (p. ej. la talla) y cada opción lleva su stock. De
          texto: opcional (p. ej. el nombre a estampar).
        </p>
        {fields.map((field) => (
          <div
            key={field.key}
            role="group"
            aria-label={`Campo ${field.name || 'nuevo'}`}
            className="grid items-end gap-3 rounded-sm bg-surface-muted p-3 sm:grid-cols-[1fr_130px_1.4fr_auto]"
          >
            <TextField
              label="Nombre del campo"
              value={field.name}
              maxLength={60}
              onChange={(e) => change(field.key, { name: e.target.value })}
            />
            <Select
              label="Tipo"
              value={field.kind}
              onChange={(kind) => change(field.key, { kind: kind as FieldKind })}
              options={[
                { value: 'options', label: 'Lista' },
                { value: 'text', label: 'Texto' },
              ]}
            />
            {field.kind === 'options' ? (
              <TextField
                label="Opciones (separadas por comas)"
                placeholder="8, 10, 12, S, M, L"
                value={field.options}
                onChange={(e) => change(field.key, { options: e.target.value })}
              />
            ) : (
              <p className="pb-3 text-[13px] text-ink-muted">Texto libre y opcional.</p>
            )}
            <button
              type="button"
              aria-label={`Quitar el campo ${field.name}`}
              title="Quitar campo"
              onClick={() => setFields(fields.filter((f) => f.key !== field.key))}
              className="mb-1 inline-flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong text-ink-soft hover:bg-surface-raised hover:text-danger-fg"
            >
              <Trash2 aria-hidden size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setFields([
              ...fields,
              { key: nextKey, id: '', name: '', kind: 'options', options: '' },
            ]);
            setNextKey(nextKey + 1);
          }}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 self-start rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-surface-muted"
        >
          <Plus aria-hidden size={16} />
          Añadir campo
        </button>
      </fieldset>
      {product && (
        <Switch label="Se ofrece para pedidos nuevos" checked={active} onChange={setActive} />
      )}
    </FormDialog>
  );
}
