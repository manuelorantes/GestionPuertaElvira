import { Paperclip, Pencil, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useSession } from '@/features/auth/useSession';
import { attachmentUrl, deleteInvoice, payInvoice, type Invoice } from '@/features/accounting/api';
import { METHODS } from '@/features/accounting/categories';
import { useAccountingMutation, useInvoices } from '@/features/accounting/hooks';
import { formatCents } from '@/features/billing/money';
import { formatDate, todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { useToast } from '@/shared/ui/Toast';
import { SPOTLIGHT_CLASS, useSpotlight } from '@/shared/ui/useSpotlight';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import { EditInvoiceDialog } from './EditInvoiceDialog';

type Column = 'date' | 'number' | 'supplier' | 'concept' | 'category' | 'amount' | 'status';

const statusLabel = (invoice: Invoice) => (invoice.paidOn ? 'Pagada' : 'Pendiente');

const COLUMNS: Record<Column, SortColumn<Invoice>> = {
  date: { label: 'Fecha', name: 'fecha', value: (i) => i.date },
  number: { label: 'Nº', name: 'número', value: (i) => i.number || null },
  supplier: { label: 'Proveedor', name: 'proveedor', value: (i) => i.supplier },
  concept: { label: 'Concepto', name: 'concepto', value: (i) => i.concept },
  category: { label: 'Categoría', name: 'categoría', value: (i) => i.categoryLabel },
  amount: { label: 'Importe', name: 'importe', value: (i) => i.amountCents },
  status: { label: 'Estado', name: 'estado', value: statusLabel },
};

function PayInvoiceDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState('transfer');
  const pay = useAccountingMutation(() => payInvoice(invoice.id, date, method));
  const toast = useToast();
  const year = new Date().getFullYear();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await pay.mutateAsync(undefined).then(
      () => {
        toast('Factura pagada');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="pay-invoice-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="pay-invoice-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Pagar factura
        </h2>
        <p className="text-sm text-ink-soft">
          {invoice.supplier} · {invoice.concept} · {formatCents(invoice.amountCents)}
        </p>
        {pay.isError && <Alert>{apiErrorMessage(pay.error)}</Alert>}
        <DateField
          label="Fecha de pago"
          value={date}
          onChange={setDate}
          fromYear={year - 2}
          toYear={year + 1}
        />
        <Select label="Forma de pago" value={method} onChange={setMethod} options={METHODS} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={pay.isPending} busyLabel="Guardando…">
            Marcar como pagada
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function InvoicesTab() {
  const invoices = useInvoices();
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [removing, setRemoving] = useState<Invoice | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);
  // Editar una factura (también pagada) es cosa de superadministración.
  const canEdit = useSession().data?.role === 'superadministrator';
  const remove = useAccountingMutation(deleteInvoice);
  const toast = useToast();
  const spotlight = useSpotlight('factura');
  const { header, apply } = useTableSort(COLUMNS, { key: 'date', descending: true });
  const items = invoices.data ?? [];

  if (invoices.isPending) return <p className="text-ink-muted">Cargando facturas…</p>;
  if (items.length === 0) return <p className="text-ink-muted">Todavía no hay facturas.</p>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <caption className="sr-only">Facturas de proveedores</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            {(['date', 'number', 'supplier', 'concept', 'category'] as const).map((key) => (
              <th key={key} scope="col" className="px-4 py-3 font-semibold">
                {header(key)}
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {header('amount')}
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              {header('status')}
            </th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apply(items).map((invoice) => (
            <tr
              key={invoice.id}
              ref={invoice.id === spotlight.id ? spotlight.attach : undefined}
              className={`border-b border-line-soft last:border-b-0 ${invoice.id === spotlight.id ? SPOTLIGHT_CLASS : ''}`}
            >
              <td className="px-4 py-3 text-ink-muted">{formatDate(invoice.date)}</td>
              <td className="px-4 py-3 font-mono text-[13px]">{invoice.number || '—'}</td>
              <td className="px-4 py-3 font-medium">{invoice.supplier}</td>
              <td className="px-4 py-3">{invoice.concept}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-line-soft px-2 py-0.5 text-xs whitespace-nowrap">
                  {invoice.categoryLabel}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                {formatCents(invoice.amountCents)}
              </td>
              <td className="px-4 py-3">
                <Badge tone={invoice.paidOn ? 'success' : 'warning'}>{statusLabel(invoice)}</Badge>
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center justify-end gap-2">
                  {invoice.attachmentName && (
                    <a
                      href={attachmentUrl(invoice.id)}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Ver documento de ${invoice.number || invoice.supplier}`}
                      title={invoice.attachmentName}
                      className="flex size-9 items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted"
                    >
                      <Paperclip aria-hidden size={16} />
                    </a>
                  )}
                  {!invoice.paidOn && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPaying(invoice)}
                        className="inline-flex h-9 cursor-pointer items-center rounded-sm bg-brand px-3 text-[13px] font-semibold text-surface-raised hover:bg-brand-strong"
                      >
                        Pagar
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar factura ${invoice.number || invoice.supplier}`}
                        onClick={() => setRemoving(invoice)}
                        className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                      >
                        <Trash2 aria-hidden size={16} />
                      </button>
                    </>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Editar factura ${invoice.number || invoice.supplier}`}
                      title="Editar"
                      onClick={() => setEditing(invoice)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      <Pencil aria-hidden size={16} />
                    </button>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {paying && <PayInvoiceDialog invoice={paying} onClose={() => setPaying(null)} />}
      {editing && <EditInvoiceDialog invoice={editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          title="Quitar factura"
          message={`Se quitará la factura de ${removing.supplier} (${formatCents(removing.amountCents)}) y su documento.`}
          confirmLabel="Quitar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            void remove.mutateAsync(removing.id).then(
              () => {
                toast('Factura quitada');
                setRemoving(null);
              },
              () => undefined,
            )
          }
        />
      )}
    </Card>
  );
}
