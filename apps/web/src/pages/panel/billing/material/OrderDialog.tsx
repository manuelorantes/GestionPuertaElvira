import { useState } from 'react';

import { centsFromText, centsToText, formatCents } from '@/features/billing/money';
import { createOrder, editOrder, type Order, type Product } from '@/features/equipment/api';
import { useProducts } from '@/features/equipment/hooks';
import { useStudents } from '@/features/students/hooks';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Combobox } from '@/shared/ui/Combobox';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { FormDialog } from './FormDialog';

/** Los campos de un producto: una lista para cada campo de lista y un texto para cada campo de texto. */
function ProductFields({
  product,
  values,
  onChange,
}: {
  product: Product;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <>
      {product.fields.map((field) =>
        field.kind === 'options' ? (
          <Select
            key={field.id}
            label={field.name}
            value={values[field.id] ?? ''}
            onChange={(value) => onChange({ ...values, [field.id]: value })}
            options={[
              { value: '', label: `Elige ${field.name.toLowerCase()}` },
              ...field.options.map((o) => ({ value: o, label: o })),
            ]}
          />
        ) : (
          <TextField
            key={field.id}
            label={`${field.name} (opcional)`}
            value={values[field.id] ?? ''}
            maxLength={60}
            onChange={(e) => onChange({ ...values, [field.id]: e.target.value })}
          />
        ),
      )}
    </>
  );
}

/** Apuntar un pedido (reserva o, con precio, pedido con su cobro) o corregir uno: cantidad, campos y nota. */
export function OrderDialog({
  order,
  studentId,
  onClose,
}: {
  order?: Order | undefined;
  /** Alumno ya elegido (desde su ficha). */
  studentId?: string | undefined;
  onClose: () => void;
}) {
  const products = useProducts();
  const students = useStudents('active', '');
  const refresh = useRefreshClubData();
  const toast = useToast();
  const [student, setStudent] = useState(order?.studentId ?? studentId ?? '');
  const [productId, setProductId] = useState(order?.productId ?? '');
  const [values, setValues] = useState<Record<string, string>>(order?.values ?? {});
  const [quantity, setQuantity] = useState(String(order?.quantity ?? 1));
  const [note, setNote] = useState(order?.note ?? '');
  const [withPrice, setWithPrice] = useState(false);
  const [price, setPrice] = useState('');
  const offered = (products.data ?? []).filter((p) => p.active || p.id === order?.productId);
  const product = (products.data ?? []).find((p) => p.id === productId);
  const units = Number(quantity);
  const suggested = product && units > 0 ? product.priceCents * units : null;

  function chooseProduct(id: string) {
    setProductId(id);
    setValues({});
  }

  function submit() {
    if (!student) return 'Elige el alumno.';
    if (!product) return 'Elige el producto.';
    if (!Number.isInteger(units) || units < 1) return 'La cantidad debe ser 1 o más.';
    const missing = product.fields.find((f) => f.kind === 'options' && !values[f.id]);
    if (missing) return `Elige ${missing.name.toLowerCase()}.`;
    const input = { quantity: units, values, note: note.trim() || null };
    if (order) {
      return editOrder(order.id, input).then(() => {
        refresh();
        toast('Pedido corregido');
      });
    }
    const priceCents = withPrice ? centsFromText(price || centsToText(suggested ?? 0)) : null;
    if (withPrice && priceCents === null) return 'Indica el precio con hasta dos decimales.';
    return createOrder({ ...input, studentId: student, productId: product.id, priceCents }).then(
      () => {
        refresh();
        toast(withPrice ? 'Pedido apuntado con su cobro' : 'Reserva apuntada');
      },
    );
  }

  return (
    <FormDialog
      title={order ? 'Corregir pedido' : 'Apuntar pedido'}
      confirmLabel={order ? 'Guardar' : withPrice ? 'Apuntar pedido' : 'Apuntar reserva'}
      onClose={onClose}
      onSubmit={submit}
    >
      {order ? (
        <p className="text-sm">
          <span className="font-semibold">{order.studentName}</span> · {order.productName}
        </p>
      ) : (
        <>
          {!studentId && (
            <Combobox
              label="Alumno"
              value={student}
              onChange={setStudent}
              options={(students.data?.items ?? []).map((s) => ({
                value: s.id,
                label: s.fullName,
              }))}
            />
          )}
          <Select
            label="Producto"
            value={productId}
            onChange={chooseProduct}
            options={[
              {
                value: '',
                label: offered.length === 0 ? 'Crea antes un producto' : 'Elige un producto',
              },
              ...offered.map((p) => ({
                value: p.id,
                label: `${p.name} · ${formatCents(p.priceCents)}`,
              })),
            ]}
          />
        </>
      )}
      {product && <ProductFields product={product} values={values} onChange={setValues} />}
      <TextField
        label="Cantidad"
        inputMode="numeric"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
      />
      <TextField
        label="Nota (opcional)"
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />
      {!order && (
        <>
          <Switch
            label="Ya con precio: pasa a pedido y genera el cobro"
            checked={withPrice}
            onChange={setWithPrice}
          />
          {withPrice && (
            <TextField
              label="Precio total (€)"
              inputMode="decimal"
              placeholder={suggested === null ? '' : centsToText(suggested)}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
              {...(suggested !== null && {
                help: `Si lo dejas vacío, ${formatCents(suggested)} (precio del producto × cantidad).`,
              })}
            />
          )}
          {!withPrice && (
            <p className="text-[13px] text-ink-muted">
              Queda reservado, sin cobro. Cuando tenga precio, pásalo a pedido.
            </p>
          )}
        </>
      )}
    </FormDialog>
  );
}
