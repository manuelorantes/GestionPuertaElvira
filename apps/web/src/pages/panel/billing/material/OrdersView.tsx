import { Ban, Euro, Pencil, RotateCcw, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { fiscalYearLabel, fiscalYearOf } from '@/features/accounting/categories';
import { currentMonth, formatCents } from '@/features/billing/money';
import {
  type Order,
  type OrderFilter,
  type OrderState,
  reactivateOrder,
  undoDelivery,
} from '@/features/equipment/api';
import { useOrders, useProducts } from '@/features/equipment/hooks';
import { ORDER_STATE, orderLabel } from '@/features/equipment/labels';
import { formatDate } from '@/features/students/format';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Alert } from '@/shared/ui/Alert';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { Select } from '@/shared/ui/Select';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

import type { MaterialDialog } from './MaterialTab';
import { StudentLink } from '@/pages/panel/students/StudentLink';

const ACTION =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-[13px] font-semibold disabled:opacity-60';
const ICON =
  'inline-flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong text-ink-soft hover:bg-surface-muted disabled:opacity-60';

/** Importe del pedido: su precio (o lo que se conserva si se canceló con algo cobrado). */
function Amount({ order }: { order: Order }) {
  if (order.priceCents === null) return <span className="text-ink-muted">Sin precio</span>;
  const pending = order.dueCents - order.coveredCents;
  return (
    <span className="flex flex-col">
      <span className="font-medium">
        {formatCents(order.status === 'cancelled' ? order.dueCents : order.priceCents)}
      </span>
      {order.status === 'ordered' && order.coveredCents > 0 && (
        <span className="text-[12px] text-ink-muted">Faltan {formatCents(pending)}</span>
      )}
      {order.status === 'cancelled' && order.dueCents > 0 && (
        <span className="text-[12px] text-ink-muted">
          cobrado de {formatCents(order.priceCents)}
        </span>
      )}
    </span>
  );
}

/** Estado del pedido y, aparte, si está entregado. */
export function OrderBadges({ order }: { order: Order }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={ORDER_STATE[order.status].tone}>{ORDER_STATE[order.status].label}</Badge>
      {order.status === 'reserved' && order.missing.length > 0 && (
        <Badge tone="warning">Falta {order.missing.map((m) => m.toLowerCase()).join(' y ')}</Badge>
      )}
      {order.deliveredOn && (
        <Badge tone="success">
          {order.status === 'cancelled' && order.returnedToStock
            ? 'Devuelto'
            : `Entregado ${formatDate(order.deliveredOn)}`}
        </Badge>
      )}
    </span>
  );
}

/** Temporadas para filtrar: la actual y las tres anteriores. */
/** El material se lleva desde la temporada 2026/27: no hay temporadas anteriores que filtrar. */
const FIRST_SEASON = 2026;

/** Temporadas para filtrar: de la actual hacia atrás, hasta la primera con material. */
function seasons(): { value: string; label: string }[] {
  const current = fiscalYearOf(currentMonth());
  const years: number[] = [];
  for (let year = current; year >= FIRST_SEASON; year--) years.push(year);
  return years.map((year) => ({
    value: String(year),
    label: `Temporada ${fiscalYearLabel(year)}`,
  }));
}

export function OrdersView({ onDialog }: { onDialog: (dialog: MaterialDialog) => void }) {
  const [filter, setFilter] = useState<OrderFilter>({
    open: true,
    status: '',
    productId: '',
    season: '',
  });
  const orders = useOrders(filter);
  const products = useProducts();
  const refresh = useRefreshClubData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>, done: string) {
    setBusy(id);
    setError(null);
    try {
      await action();
      refresh();
      toast(done);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  function actions(order: Order) {
    const disabled = busy === order.id;
    if (order.status === 'cancelled')
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void run(order.id, () => reactivateOrder(order.id), 'Pedido reactivado')}
          className={`${ACTION} border border-line-strong hover:bg-surface-muted`}
        >
          <RotateCcw aria-hidden size={16} />
          Reactivar
        </button>
      );
    const who = `${orderLabel(order)} de ${order.studentName}`;
    return (
      <>
        {order.status === 'reserved' && (
          <button
            type="button"
            onClick={() => onDialog({ type: 'place', order })}
            className={`${ACTION} bg-brand text-surface-raised hover:bg-brand-strong`}
          >
            Pasar a pedido
          </button>
        )}
        {order.status === 'ordered' && (
          <button
            type="button"
            onClick={() => onDialog({ type: 'pay', order })}
            className={`${ACTION} bg-brand text-surface-raised hover:bg-brand-strong`}
          >
            Cobrar
          </button>
        )}
        {order.status !== 'reserved' && !order.deliveredOn && (
          <button
            type="button"
            onClick={() => onDialog({ type: 'deliver', order })}
            className={`${ACTION} border border-line-strong hover:bg-surface-muted`}
          >
            Entregar
          </button>
        )}
        {order.deliveredOn && (
          <button
            type="button"
            aria-label={`Deshacer la entrega de ${who}`}
            title="Deshacer la entrega"
            disabled={disabled}
            onClick={() => void run(order.id, () => undoDelivery(order.id), 'Entrega deshecha')}
            className={ICON}
          >
            <Undo2 aria-hidden size={16} />
          </button>
        )}
        {!order.deliveredOn && (
          <button
            type="button"
            aria-label={`Corregir ${who}`}
            title="Corregir"
            onClick={() => onDialog({ type: 'order', order })}
            className={ICON}
          >
            <Pencil aria-hidden size={16} />
          </button>
        )}
        {order.status === 'ordered' && order.coveredCents === 0 && (
          <button
            type="button"
            aria-label={`Cambiar el precio de ${who}`}
            title="Cambiar precio"
            onClick={() => onDialog({ type: 'price', order })}
            className={ICON}
          >
            <Euro aria-hidden size={16} />
          </button>
        )}
        {order.status !== 'paid' && (
          <button
            type="button"
            aria-label={`Cancelar ${who}`}
            title="Cancelar pedido"
            onClick={() => onDialog({ type: 'cancel', order })}
            className={`${ICON} hover:text-danger-fg`}
          >
            <Ban aria-hidden size={16} />
          </button>
        )}
      </>
    );
  }

  function renderBody() {
    if (orders.isPending) return <p className="p-5 text-ink-muted">Cargando pedidos…</p>;
    if (orders.isError)
      return (
        <div className="p-5">
          <Alert>No se han podido cargar los pedidos.</Alert>
        </div>
      );
    if (orders.data.length === 0)
      return (
        <p className="px-5 py-12 text-center text-ink-muted">
          {filter.open ? 'No hay pedidos abiertos.' : 'No hay pedidos con ese filtro.'}
        </p>
      );
    return (
      <ul aria-label="Pedidos de material" className="divide-y divide-line-soft">
        {orders.data.map((order) => (
          <li
            key={order.id}
            className="flex flex-col gap-3 px-5 py-3 text-sm md:flex-row md:items-center"
          >
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={order.studentName} size={32} />
              <span className="min-w-0">
                <StudentLink id={order.studentId} className="block font-medium">
                  {order.studentName}
                </StudentLink>
                <span className="block text-ink-soft">{orderLabel(order)}</span>
                <span className="block text-[12px] text-ink-muted">
                  Apuntado el {formatDate(order.createdOn)}
                  {order.note && ` · ${order.note}`}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-4 md:w-72">
              <span className="w-24">
                <Amount order={order} />
              </span>
              <OrderBadges order={order} />
            </span>
            <span className="flex flex-wrap justify-end gap-2 md:w-[300px]">{actions(order)}</span>
          </li>
        ))}
      </ul>
    );
  }

  const set = (patch: Partial<OrderFilter>) => setFilter({ ...filter, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Pedidos a ver" className="flex gap-2">
          <ToggleButton
            tone="ink"
            pressed={filter.open}
            onClick={() => set({ open: true })}
            className="h-9 rounded-full font-medium"
          >
            Abiertos
          </ToggleButton>
          <ToggleButton
            tone="ink"
            pressed={!filter.open}
            onClick={() => set({ open: false })}
            className="h-9 rounded-full font-medium"
          >
            Todos
          </ToggleButton>
        </div>
        <div className="w-40">
          <Select
            label="Estado"
            value={filter.status ?? ''}
            onChange={(status) => set({ status: status as OrderState | '' })}
            options={[
              { value: '', label: 'Todos' },
              ...(Object.keys(ORDER_STATE) as OrderState[]).map((s) => ({
                value: s,
                label: ORDER_STATE[s].label,
              })),
            ]}
          />
        </div>
        <div className="w-48">
          <Select
            label="Producto"
            value={filter.productId ?? ''}
            onChange={(productId) => set({ productId })}
            options={[
              { value: '', label: 'Todos' },
              ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <div className="w-52">
          <Select
            label="Temporada"
            value={filter.season ?? ''}
            onChange={(season) => set({ season })}
            options={[{ value: '', label: 'Cualquiera' }, ...seasons()]}
          />
        </div>
      </div>
      {filter.open && (
        <p className="text-[13px] text-ink-muted">
          Abiertos: reservados, y pedidos sin pagar o sin entregar, de cualquier fecha.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      <Card>{renderBody()}</Card>
    </div>
  );
}
