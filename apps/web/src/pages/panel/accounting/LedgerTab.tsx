import { ArrowDownLeft, ArrowRight, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { deleteEntry, type LedgerItem } from '@/features/accounting/api';
import { useAccountingMutation, useLedger } from '@/features/accounting/hooks';
import {
  applyLedgerFilter,
  emptyFilterMessage,
  KIND_OPTIONS,
  type LedgerFilter,
  METHOD_OPTIONS,
} from '@/features/accounting/ledgerFilter';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents, monthLabel, shiftMonth } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { MonthNav } from '@/shared/ui/MonthNav';
import { ToggleButton } from '@/shared/ui/ToggleButton';
import { useToast } from '@/shared/ui/Toast';

import { EntryDialog } from './EntryDialog';

const ROW_ACTION =
  'flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted';

/** De dónde sale cada movimiento automático: se gestiona allí (aquí no se quita ni se imprime). */
function origin(item: LedgerItem): { to: string; label: string; hint: string } | null {
  switch (item.source) {
    case 'payment':
      return {
        to: '/panel/cobros?pestana=registro',
        label: 'Ir a Cobros',
        hint: 'Viene de Cobros y cuotas: se gestiona allí',
      };
    case 'settlement':
      return {
        to: `/panel/profesores?pestana=liquidacion&mes=${item.sourceId.split('/')[1] ?? ''}`,
        label: 'Ir a la liquidación',
        hint: 'Viene de Profesores → Liquidación: se gestiona allí',
      };
    case 'advance':
      return {
        to: `/panel/profesores/${item.sourceId.split('/')[0] ?? ''}`,
        label: 'Ir al profesor',
        hint: 'Anticipo a un profesor: se gestiona en su ficha',
      };
    case 'invoice':
      return {
        to: '/panel/contabilidad?pestana=facturas',
        label: 'Ir a Facturas',
        hint: 'Viene de una factura pagada: se gestiona en Facturas',
      };
    default:
      return null;
  }
}

function OriginLink({ item }: { item: LedgerItem }) {
  const target = origin(item);
  if (!target) return null;
  return (
    <Link
      to={target.to}
      aria-label={`${target.label}: ${item.concept}`}
      title={target.hint}
      className={ROW_ACTION}
    >
      <ArrowRight aria-hidden size={16} />
    </Link>
  );
}

function signed(item: LedgerItem): string {
  return `${item.kind === 'income' ? '+' : '−'}${formatCents(item.amountCents)}`;
}

function LedgerFilters({
  filter,
  onChange,
}: {
  filter: LedgerFilter;
  onChange: (filter: LedgerFilter) => void;
}) {
  return (
    <div className="border-b border-line">
      <div
        role="group"
        aria-label="Tipo de movimiento"
        className="flex flex-wrap gap-1.5 px-5 py-3"
      >
        {KIND_OPTIONS.map((k) => (
          <ToggleButton
            key={k.id}
            tone="ink"
            pressed={filter.kind === k.id}
            onClick={() => onChange({ kind: k.id, method: 'all' })}
            className="h-9 rounded-full font-medium"
          >
            {k.label}
          </ToggleButton>
        ))}
      </div>
      {filter.kind === 'income' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft bg-surface-muted px-5 py-2.5">
          <span
            id="ledger-method-label"
            className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase"
          >
            Forma de pago
          </span>
          <div
            role="group"
            aria-labelledby="ledger-method-label"
            className="flex flex-wrap gap-1.5"
          >
            {METHOD_OPTIONS.map((m) => (
              <ToggleButton
                key={m.id}
                tone="soft"
                pressed={filter.method === m.id}
                onClick={() => onChange({ kind: 'income', method: m.id })}
                className="h-8 min-w-0 rounded-full px-3 text-[13px] font-medium"
              >
                {m.label}
              </ToggleButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerTable({
  items,
  label,
  onRemove,
}: {
  items: LedgerItem[];
  label: string;
  onRemove: (item: LedgerItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">Movimientos de {label}</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            <th scope="col" className="w-10">
              <span className="sr-only">Tipo</span>
            </th>
            {['Fecha', 'Concepto', 'Categoría', 'Forma de pago'].map((h) => (
              <th key={h} scope="col" className="px-3 py-3 font-semibold">
                {h}
              </th>
            ))}
            <th scope="col" className="px-3 py-3 text-right font-semibold">
              Importe
            </th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.source}-${item.sourceId}`}
              className="border-b border-line-soft last:border-b-0"
            >
              <td
                className={`pl-4 ${item.kind === 'income' ? 'text-success-fg' : 'text-danger-fg'}`}
              >
                {item.kind === 'income' ? (
                  <ArrowDownLeft aria-label="Ingreso" size={18} />
                ) : (
                  <ArrowUpRight aria-label="Gasto" size={18} />
                )}
              </td>
              <td className="px-3 py-3 text-ink-muted">{formatDate(item.date)}</td>
              <td className="px-3 py-3 font-medium">{item.concept}</td>
              <td className="px-3 py-3">
                <span className="rounded-full bg-line-soft px-2 py-0.5 text-xs whitespace-nowrap">
                  {item.categoryLabel}
                </span>
              </td>
              <td className="px-3 py-3 text-ink-soft">{item.methodLabel}</td>
              <td
                className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${item.kind === 'income' ? 'text-success-fg' : 'text-danger-fg'}`}
              >
                {signed(item)}
              </td>
              <td className="px-2 py-3">
                {item.source === 'manual' ? (
                  <button
                    type="button"
                    aria-label={`Quitar ${item.concept}`}
                    title="Apunte manual: se puede quitar"
                    onClick={() => onRemove(item)}
                    className={ROW_ACTION}
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                ) : (
                  <OriginLink item={item} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LedgerTab({
  month,
  onMonthChange,
  filter,
  onFilterChange,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  filter: LedgerFilter;
  onFilterChange: (filter: LedgerFilter) => void;
}) {
  const ledger = useLedger(month);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LedgerItem | null>(null);
  const remove = useAccountingMutation(deleteEntry);
  const toast = useToast();
  const data = ledger.data;
  const label = monthLabel(month).toLowerCase();
  const maxCategory = Math.max(1, ...(data?.expensesByCategory ?? []).map((c) => c.amountCents));

  function renderTable() {
    if (ledger.isPending) return <p className="p-5 text-ink-muted">Cargando movimientos…</p>;
    if (ledger.isError)
      return (
        <div className="p-5">
          <Alert>{apiErrorMessage(ledger.error)}</Alert>
        </div>
      );
    if (!data || data.items.length === 0)
      return <p className="px-5 py-12 text-center text-ink-muted">No hay movimientos este mes.</p>;
    const shown = applyLedgerFilter(data.items, filter);
    return (
      <>
        <LedgerFilters filter={filter} onChange={onFilterChange} />
        {shown.items.length === 0 ? (
          <p className="px-5 py-12 text-center text-ink-muted">{emptyFilterMessage(filter)}</p>
        ) : (
          <LedgerTable items={shown.items} label={label} onRemove={setRemoving} />
        )}
        {shown.active && shown.items.length > 0 && (
          <p className="border-t border-line px-5 pt-3 text-sm font-medium">
            {shown.items.length} {shown.items.length === 1 ? 'movimiento' : 'movimientos'} ·{' '}
            {shown.netCents < 0 ? '−' : '+'}
            {formatCents(Math.abs(shown.netCents))}
          </p>
        )}

        <p className="border-t border-line px-5 pt-3 text-[13px] text-ink-muted">
          Solo los apuntes manuales se quitan aquí; cobros, liquidaciones y facturas se gestionan en
          su sección.
        </p>
        <p className="px-5 py-3 text-sm font-medium">
          Ingresos {formatCents(data.incomeCents)} · Gastos {formatCents(data.expenseCents)} ·
          Resultado {formatCents(data.incomeCents - data.expenseCents)}
        </p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav
          label={monthLabel(month)}
          onPrevious={() => onMonthChange(shiftMonth(month, -1))}
          onNext={() => onMonthChange(shiftMonth(month, 1))}
        />
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus aria-hidden size={18} />
          Añadir movimiento
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[2_1_560px]">{renderTable()}</Card>
        <Card className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 p-6">
          <section aria-label={`Gastos de ${label}`} className="flex flex-col gap-3.5">
            <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
              Gastos de {label}
            </h2>
            {(data?.expensesByCategory ?? []).length === 0 && (
              <p className="text-sm text-ink-muted">Sin gastos este mes.</p>
            )}
            {(data?.expensesByCategory ?? []).map((c) => (
              <div key={c.category} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{c.label}</span>
                  <span className="font-semibold">{formatCents(c.amountCents)}</span>
                </div>
                <div aria-hidden className="h-2 overflow-hidden rounded-full bg-line-soft">
                  <div
                    className="h-full rounded-full bg-ink-strong"
                    style={{ width: `${(c.amountCents / maxCategory) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-line-strong pt-3 font-semibold">
              <span>Total</span>
              <span>{formatCents(data?.expenseCents ?? 0)}</span>
            </div>
          </section>
        </Card>
      </div>
      {adding && <EntryDialog onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmDialog
          title="Quitar movimiento"
          message={`Se quitará «${removing.concept}» (${signed(removing)}).`}
          confirmLabel="Quitar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            void remove.mutateAsync(removing.sourceId).then(
              () => {
                toast('Movimiento quitado');
                setRemoving(null);
              },
              () => undefined,
            )
          }
        />
      )}
    </div>
  );
}
