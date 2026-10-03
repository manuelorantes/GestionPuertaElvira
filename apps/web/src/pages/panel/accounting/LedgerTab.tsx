import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Plus,
  Printer,
  Receipt,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { deleteEntry, type LedgerItem } from '@/features/accounting/api';
import { useAccountingMutation, useLedger } from '@/features/accounting/hooks';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents, monthLabel, shiftMonth } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { MonthNav } from '@/shared/ui/MonthNav';
import { useToast } from '@/shared/ui/Toast';

import { ReceiptDialog } from '@/pages/panel/billing/ReceiptDialog';
import { SettlementSheetDialog } from '@/pages/panel/payroll/SettlementSheetDialog';

import { EntryDialog } from './EntryDialog';

const ROW_ACTION =
  'flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted';

/** De dónde sale cada movimiento automático y dónde se gestiona (aquí no se puede quitar). */
const ORIGINS: Record<Exclude<LedgerItem['source'], 'manual'>, { label: string; hint: string }> = {
  payment: { label: 'Ver recibo', hint: 'Viene de Cobros y cuotas: se gestiona allí' },
  settlement: {
    label: 'Ver liquidación',
    hint: 'Viene de Profesores → Liquidación: se gestiona allí',
  },
  invoice: { label: 'Ver facturas', hint: 'Viene de una factura pagada: se gestiona en Facturas' },
};

function OriginAction({ item, onOpen }: { item: LedgerItem; onOpen: (item: LedgerItem) => void }) {
  if (item.source === 'manual') return null;
  const { label, hint } = ORIGINS[item.source];
  const name = `${label}: ${item.concept}`;
  if (item.source === 'invoice')
    return (
      <Link
        to="/panel/contabilidad?pestana=facturas"
        aria-label={name}
        title={hint}
        className={ROW_ACTION}
      >
        <FileText aria-hidden size={16} />
      </Link>
    );
  return (
    <button
      type="button"
      aria-label={name}
      title={hint}
      onClick={() => onOpen(item)}
      className={ROW_ACTION}
    >
      {item.source === 'payment' ? (
        <Printer aria-hidden size={16} />
      ) : (
        <Receipt aria-hidden size={16} />
      )}
    </button>
  );
}

function signed(item: LedgerItem): string {
  return `${item.kind === 'income' ? '+' : '−'}${formatCents(item.amountCents)}`;
}

export function LedgerTab({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const ledger = useLedger(month);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LedgerItem | null>(null);
  const [origin, setOrigin] = useState<LedgerItem | null>(null);
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
    return (
      <>
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
              {data.items.map((item) => (
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
                        onClick={() => setRemoving(item)}
                        className={ROW_ACTION}
                      >
                        <Trash2 aria-hidden size={16} />
                      </button>
                    ) : (
                      <OriginAction item={item} onOpen={setOrigin} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      {origin?.source === 'payment' && (
        <ReceiptDialog paymentId={origin.sourceId} onClose={() => setOrigin(null)} />
      )}
      {origin?.source === 'settlement' && (
        <SettlementSheetDialog
          teacherId={origin.sourceId.split('/')[0] ?? ''}
          month={origin.sourceId.split('/')[1] ?? ''}
          onClose={() => setOrigin(null)}
        />
      )}
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
