import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { amendInvoice, type Invoice } from '@/features/accounting/api';
import { METHODS, methodLabel } from '@/features/accounting/categories';
import {
  useAccountingMutation,
  useCategories,
  useCategoryOptions,
} from '@/features/accounting/hooks';
import { centsFromText, centsToText, formatCents, monthLabel } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ConfirmChangesDialog } from '@/shared/ui/ConfirmChangesDialog';
import { changedFields, type FieldChange } from '@/shared/ui/fieldChanges';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { PeriodSelect } from './PeriodSelect';

const monthOf = (date: string) => date.slice(0, 7);

/**
 * «Editar factura» (solo superadministración): cabecera, importe, mes al que corresponde y, si está pagada, fecha y
 * forma de pago. Antes de guardar se confirma lo que cambia.
 */
export function EditInvoiceDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [values, setValues] = useState({
    supplier: invoice.supplier,
    number: invoice.number,
    concept: invoice.concept,
    category: invoice.category,
    amount: centsToText(invoice.amountCents),
    date: invoice.date,
    // Mes al que corresponde; vacío, el de la fecha de la factura.
    period: invoice.period !== monthOf(invoice.date) ? invoice.period : '',
    paidOn: invoice.paidOn ?? '',
    method: invoice.method ?? 'transfer',
  });
  const [confirming, setConfirming] = useState(false);
  const categories = useCategories().data ?? [];
  // Lo del profesorado sale de sus liquidaciones, no de facturas.
  const categoryOptions = useCategoryOptions('expense', ['teachers']);
  const save = useAccountingMutation(amendInvoice);
  const toast = useToast();
  const year = new Date().getFullYear();
  const paid = invoice.paidOn !== null;
  const cents = centsFromText(values.amount);
  const invalid =
    !values.supplier.trim() ||
    !values.concept.trim() ||
    !values.category ||
    cents === null ||
    cents <= 0 ||
    !values.date ||
    (paid && !values.paidOn);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const label = (code: string) => categories.find((c) => c.code === code)?.label ?? code;
  const date = values.date || invoice.date;
  const period = values.period || monthOf(date);
  const paymentChanges: FieldChange[] = paid
    ? [
        ['Fecha de pago', formatDate(invoice.paidOn ?? ''), formatDate(values.paidOn)],
        ['Forma de pago', methodLabel(invoice.method), methodLabel(values.method)],
      ]
    : [];
  const changes = changedFields([
    ['Proveedor', invoice.supplier, values.supplier.trim()],
    ['Nº de factura', invoice.number || '—', values.number.trim() || '—'],
    ['Concepto', invoice.concept, values.concept.trim()],
    ['Categoría', label(invoice.category), label(values.category)],
    ['Importe', formatCents(invoice.amountCents), formatCents(cents ?? 0)],
    ['Fecha de la factura', formatDate(invoice.date), formatDate(date)],
    ['Mes al que corresponde', monthLabel(invoice.period), monthLabel(period)],
    ...paymentChanges,
  ]);

  function review(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    if (changes.length === 0) return onClose();
    setConfirming(true);
  }

  function confirm() {
    void save
      .mutateAsync({
        id: invoice.id,
        amendment: {
          date,
          number: values.number.trim(),
          supplier: values.supplier.trim(),
          concept: values.concept.trim(),
          category: values.category,
          amount: values.amount.trim(),
          period,
          paidOn: paid ? values.paidOn : null,
          method: paid ? values.method : null,
        },
      })
      .then(
        () => {
          toast('Factura editada');
          onClose();
        },
        () => undefined,
      );
  }

  if (confirming) {
    return (
      <ConfirmChangesDialog
        changes={changes}
        busy={save.isPending}
        error={save.isError ? apiErrorMessage(save.error) : null}
        onBack={() => setConfirming(false)}
        onConfirm={confirm}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="edit-invoice-title">
      <form onSubmit={review}>
        <h2
          id="edit-invoice-title"
          className="border-b border-line px-6 py-5 font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Editar factura
        </h2>
        <div className="flex flex-col gap-4 p-6">
          {invoice.attachmentName && (
            <Alert tone="info">El documento adjunto no cambia: {invoice.attachmentName}</Alert>
          )}
          <TextField
            label="Proveedor"
            value={values.supplier}
            onChange={(e) => set('supplier')(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nº de factura"
              value={values.number}
              onChange={(e) => set('number')(e.target.value)}
            />
            <TextField
              label="Importe (€)"
              inputMode="decimal"
              value={values.amount}
              onChange={(e) => set('amount')(e.target.value)}
            />
          </div>
          <TextField
            label="Concepto"
            value={values.concept}
            onChange={(e) => set('concept')(e.target.value)}
          />
          <Select
            label="Categoría"
            value={values.category}
            onChange={set('category')}
            options={categoryOptions}
          />
          <DateField
            label="Fecha de la factura"
            value={values.date}
            onChange={set('date')}
            fromYear={year - 2}
            toYear={year + 1}
          />
          <PeriodSelect
            date={date}
            value={values.period}
            onChange={set('period')}
            defaultLabel="El de la factura"
          />
          {paid && (
            <>
              <DateField
                label="Fecha de pago"
                value={values.paidOn}
                onChange={set('paidOn')}
                fromYear={year - 2}
                toYear={year + 1}
              />
              <Select
                label="Forma de pago"
                value={values.method}
                onChange={set('method')}
                options={METHODS}
              />
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
