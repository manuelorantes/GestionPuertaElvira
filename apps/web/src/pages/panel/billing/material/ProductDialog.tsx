import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { centsFromText, centsToText } from '@/features/billing/money';
import {
  createProduct,
  type FieldKind,
  type OptionUsage,
  type Product,
  type ProductFieldInput,
  updateProduct,
} from '@/features/equipment/api';
import { useProductUsage } from '@/features/equipment/hooks';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Alert } from '@/shared/ui/Alert';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { FormDialog } from './FormDialog';

/** Una opción tal como se edita: `was` es cómo se llamaba al abrir (vacío si es nueva). */
interface OptionDraft {
  key: number;
  was: string;
  value: string;
}

interface FieldDraft {
  key: number;
  id: string;
  name: string;
  kind: FieldKind;
  options: OptionDraft[];
}

/** Una opción que había y cambia: pasa a `to`, o se quita (`to` vacío). */
interface OptionChange {
  fieldId: string;
  fieldName: string;
  from: string;
  to: string;
  usage: OptionUsage;
}

const NO_USAGE = { reservations: 0, orders: 0, purchases: 0 };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Lo que cambia en las opciones que había, con lo que usa cada una: una fila con otro texto la renombra; la que ya no
 * tiene fila (o su campo ya no es de lista) se quita.
 */
function changesOf(product: Product, fields: FieldDraft[], usage: OptionUsage[]): OptionChange[] {
  const changes: OptionChange[] = [];
  for (const original of product.fields) {
    if (original.kind !== 'options') continue;
    const draft = fields.find((f) => f.id === original.id);
    for (const option of original.options) {
      const row =
        draft?.kind === 'options' ? draft.options.find((o) => o.was === option) : undefined;
      const to = row ? row.value.trim() : '';
      if (to === option) continue;
      const used = usage.find((u) => u.fieldId === original.id && u.value === option);
      changes.push({
        fieldId: original.id,
        fieldName: original.name,
        from: option,
        to,
        usage: used ?? { fieldId: original.id, value: option, ...NO_USAGE },
      });
    }
  }
  return changes;
}

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
  const usage = useProductUsage(product?.id ?? null);
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? centsToText(product.priceCents) : '');
  const [active, setActive] = useState(product?.active ?? true);
  const [fields, setFields] = useState<FieldDraft[]>(() => {
    let key = 0;
    return (product?.fields ?? []).map((f) => ({
      ...f,
      key: key++,
      options: f.options.map((o) => ({ key: key++, was: o, value: o })),
    }));
  });
  const [nextKey, setNextKey] = useState(1000);
  /** Segundo paso: qué hacer con las reservas de cada opción que cambia. */
  const [confirming, setConfirming] = useState<OptionChange[] | null>(null);
  const [blank, setBlank] = useState<Set<string>>(new Set());

  const takeKey = () => {
    setNextKey(nextKey + 1);
    return nextKey;
  };
  const change = (key: number, patch: Partial<FieldDraft>) =>
    setFields(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const changeOption = (field: FieldDraft, key: number, value: string) =>
    change(field.key, {
      options: field.options.map((o) => (o.key === key ? { ...o, value } : o)),
    });

  function removeOption(field: FieldDraft, option: OptionDraft) {
    change(field.key, { options: field.options.filter((o) => o.key !== option.key) });
  }

  function input(changes: OptionChange[]) {
    const priceCents = centsFromText(price) ?? 0;
    return {
      name: name.trim(),
      priceCents,
      active,
      fields: fields.map((f): ProductFieldInput => ({
        id: f.id,
        name: f.name.trim(),
        kind: f.kind,
        options: f.kind === 'options' ? f.options.map((o) => o.value.trim()).filter(Boolean) : [],
        renamed: changes
          .filter((c) => c.fieldId === f.id && c.to !== '')
          .map((c) => ({ from: c.from, to: c.to })),
      })),
      blankReservations: changes
        .filter((c) => c.to !== '' && blank.has(`${c.fieldId}=${c.from}`))
        .map((c) => ({ fieldId: c.fieldId, option: c.from })),
    };
  }

  function save(changes: OptionChange[]) {
    const request = product
      ? updateProduct({ id: product.id, ...input(changes) })
      : createProduct(input(changes));
    return request.then(() => {
      refresh();
      toast(product ? 'Producto guardado' : 'Producto creado');
    });
  }

  function submit() {
    if (confirming) return save(confirming);
    if (!name.trim()) return 'Indica el nombre del producto.';
    if (centsFromText(price) === null) return 'Indica el precio con hasta dos decimales.';
    for (const field of fields) {
      if (!field.name.trim()) return 'Cada campo necesita un nombre.';
      if (field.kind === 'options' && !field.options.some((o) => o.value.trim())) {
        return `«${field.name.trim()}» necesita al menos una opción.`;
      }
    }
    if (!product) return save([]);
    if (usage.isPending) return 'Espera a que carguen los pedidos del producto.';
    if (usage.isError) return 'No se ha podido comprobar qué usa cada opción.';
    const changes = changesOf(product, fields, usage.data);
    const blocked = changes.find(
      (c) => c.to === '' && (c.usage.orders > 0 || c.usage.purchases > 0),
    );
    if (blocked) {
      return `No se puede quitar «${blocked.from}» de «${blocked.fieldName}»: hay pedidos con precio o compras con esa opción.`;
    }
    const inUse = changes.filter(
      (c) => c.usage.reservations + c.usage.orders + c.usage.purchases > 0,
    );
    if (inUse.length === 0) return save(changes);
    setConfirming(inUse);
    return null;
  }

  function toggleBlank(key: string, value: boolean) {
    setBlank((current) => {
      const next = new Set(current);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function renderConfirmation(changes: OptionChange[]) {
    return (
      <>
        <p className="text-sm text-ink-soft">
          Hay pedidos con las opciones que cambian. Decide qué pasa con cada una antes de guardar.
        </p>
        <ul className="flex flex-col gap-3">
          {changes.map((c) => {
            const key = `${c.fieldId}=${c.from}`;
            const others = [
              c.usage.orders > 0 &&
                count(c.usage.orders, 'pedido con precio', 'pedidos con precio'),
              c.usage.purchases > 0 && count(c.usage.purchases, 'compra', 'compras'),
            ].filter(Boolean);
            return (
              <li
                key={key}
                role="group"
                aria-label={`${c.fieldName} ${c.from}`}
                className="flex flex-col gap-2 rounded-sm bg-surface-muted p-3 text-sm"
              >
                <p className="font-medium">
                  {c.fieldName} «{c.from}»{' '}
                  {c.to === '' ? (
                    <span className="text-danger-fg">se quita</span>
                  ) : (
                    <>
                      pasa a «<span className="text-brand-strong">{c.to}</span>»
                    </>
                  )}
                </p>
                {c.usage.reservations > 0 &&
                  (c.to === '' ? (
                    <p>
                      {count(c.usage.reservations, 'reserva se queda', 'reservas se quedan')} sin{' '}
                      {c.fieldName.toLocaleLowerCase('es')}: habrá que volver a elegirla.
                    </p>
                  ) : (
                    <Select
                      label={`${count(c.usage.reservations, 'reserva', 'reservas')} con «${c.from}»`}
                      value={blank.has(key) ? 'blank' : 'update'}
                      onChange={(value) => toggleBlank(key, value === 'blank')}
                      options={[
                        { value: 'update', label: `Pasan a «${c.to}»` },
                        {
                          value: 'blank',
                          label: `Se quedan sin ${c.fieldName.toLocaleLowerCase('es')}`,
                        },
                      ]}
                    />
                  ))}
                {others.length > 0 && (
                  <p className="text-ink-muted">
                    También {others.join(' y ')} con «{c.from}»: pasan a «{c.to}».
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  function renderField(field: FieldDraft) {
    return (
      <div
        key={field.key}
        role="group"
        aria-label={`Campo ${field.name || 'nuevo'}`}
        className="flex flex-col gap-3 rounded-sm bg-surface-muted p-3"
      >
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_130px_auto]">
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
        {field.kind === 'options' ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Opciones</p>
            {field.options.length === 0 && (
              <p className="text-[13px] text-ink-muted">Añade al menos una opción.</p>
            )}
            <ul className="flex flex-wrap gap-2">
              {field.options.map((option, index) => (
                <li key={option.key} className="flex items-center gap-1">
                  <input
                    aria-label={`Opción ${index + 1}`}
                    value={option.value}
                    maxLength={60}
                    placeholder={option.was || 'p. ej. M'}
                    onChange={(e) => changeOption(field, option.key, e.target.value)}
                    className="h-9 w-24 min-w-0 rounded-sm border border-line-strong bg-surface px-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                  />
                  <button
                    type="button"
                    aria-label={`Quitar la opción ${option.value || index + 1}`}
                    title="Quitar opción"
                    onClick={() => removeOption(field, option)}
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-raised hover:text-danger-fg"
                  >
                    <X aria-hidden size={14} />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() =>
                    change(field.key, {
                      options: [...field.options, { key: takeKey(), was: '', value: '' }],
                    })
                  }
                  className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-sm border border-dashed border-line-strong px-2.5 text-[13px] font-semibold hover:bg-surface-raised"
                >
                  <Plus aria-hidden size={14} />
                  Añadir opción
                </button>
              </li>
            </ul>
            {product && (
              <p className="text-[12px] text-ink-muted">
                Cambia el texto de una opción para renombrarla (sus pedidos la siguen); quítala y
                las reservas se quedan sin ella.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">Texto libre y opcional.</p>
        )}
      </div>
    );
  }

  return (
    <FormDialog
      title={product ? 'Editar producto' : 'Nuevo producto'}
      confirmLabel={product ? 'Guardar' : 'Crear producto'}
      size="wide"
      onClose={onClose}
      onBack={confirming ? () => setConfirming(null) : undefined}
      onSubmit={submit}
    >
      {confirming ? (
        renderConfirmation(confirming)
      ) : (
        <>
          {usage.isError && <Alert>No se ha podido comprobar qué usa cada opción.</Alert>}
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
            {fields.map(renderField)}
            <button
              type="button"
              onClick={() => {
                setFields([
                  ...fields,
                  { key: takeKey(), id: '', name: '', kind: 'options', options: [] },
                ]);
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
        </>
      )}
    </FormDialog>
  );
}
