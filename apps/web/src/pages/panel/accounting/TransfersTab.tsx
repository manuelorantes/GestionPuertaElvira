import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { deleteTransfer, type Transfer } from '@/features/accounting/api';
import { useAccountingMutation, useTransfers } from '@/features/accounting/hooks';
import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import { TransferDialog } from './TransferDialog';

type Column = 'date' | 'direction' | 'note' | 'amount';

const direction = (t: Transfer) => `${t.fromLabel} → ${t.toLabel}`;

const COLUMNS: Record<Column, SortColumn<Transfer>> = {
  date: { label: 'Fecha', name: 'fecha', value: (t) => t.date },
  direction: { label: 'Traspaso', name: 'traspaso', value: direction },
  note: { label: 'Nota', name: 'nota', value: (t) => t.note || null },
  amount: { label: 'Importe', name: 'importe', value: (t) => t.amountCents },
};

/** Traspasos entre caja y banco: cambian dónde está el dinero, no cuánto tiene el club. */
export function TransfersTab() {
  const transfers = useTransfers();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Transfer | null>(null);
  const remove = useAccountingMutation(deleteTransfer);
  const toast = useToast();
  const { header, apply } = useTableSort(COLUMNS, { key: 'date', descending: true });
  const items = transfers.data ?? [];

  function renderList() {
    if (transfers.isPending) return <p className="text-ink-muted">Cargando traspasos…</p>;
    if (transfers.isError) return <Alert>{apiErrorMessage(transfers.error)}</Alert>;
    if (items.length === 0) return <p className="text-ink-muted">Todavía no hay traspasos.</p>;
    return (
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Traspasos entre caja y banco</caption>
          <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {(['date', 'direction', 'note'] as const).map((key) => (
                <th key={key} scope="col" className="px-4 py-3 font-semibold">
                  {header(key)}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {header('amount')}
              </th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {apply(items).map((t) => (
              <tr key={t.id} className="border-b border-line-soft last:border-b-0">
                <td className="px-4 py-3 text-ink-muted">{formatDate(t.date)}</td>
                <td className="px-4 py-3 font-medium">{direction(t)}</td>
                <td className="px-4 py-3">{t.note || '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCents(t.amountCents)}</td>
                <td className="px-2 py-3 text-right">
                  <button
                    type="button"
                    aria-label="Quitar traspaso"
                    onClick={() => setRemoving(t)}
                    className="inline-flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted hover:text-danger-fg"
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          Ingresar el efectivo de caja en el banco o sacar efectivo. El saldo del club no cambia.
        </p>
        <Button variant="surface" onClick={() => setAdding(true)}>
          <ArrowLeftRight aria-hidden size={18} />
          Traspasar dinero
        </Button>
      </div>
      {renderList()}
      {adding && <TransferDialog onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmDialog
          title="Quitar traspaso"
          message={`${direction(removing)} · ${formatCents(removing.amountCents)} · ${formatDate(removing.date)}. El dinero vuelve a donde estaba.`}
          confirmLabel="Quitar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            void remove.mutateAsync(removing.id).then(
              () => {
                toast('Traspaso quitado');
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
