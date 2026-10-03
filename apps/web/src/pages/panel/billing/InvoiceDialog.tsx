import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { issueInvoice } from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

interface InvoiceDialogProps {
  paymentId: string;
  defaultName: string;
  onClose: () => void;
}

export function InvoiceDialog({ paymentId, defaultName, onClose }: InvoiceDialogProps) {
  const [customer, setCustomer] = useState({ name: defaultName, taxId: '', address: '' });
  const issue = useBillingMutation((data: typeof customer) => issueInvoice(paymentId, data));
  const toast = useToast();
  const missing = !customer.name.trim() || !customer.taxId.trim() || !customer.address.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missing) return;
    await issue.mutateAsync(customer).then(
      () => {
        toast('Factura emitida');
        onClose();
      },
      () => undefined,
    );
  }

  const field = (key: keyof typeof customer) => ({
    value: customer[key],
    onChange: (e: { target: { value: string } }) =>
      setCustomer({ ...customer, [key]: e.target.value }),
  });

  return (
    <Dialog open onClose={onClose} labelledBy="invoice-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="invoice-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Emitir factura
        </h2>
        {issue.isError && <Alert>{apiErrorMessage(issue.error)}</Alert>}
        <TextField label="Nombre o razón social" {...field('name')} />
        <TextField label="NIF" {...field('taxId')} />
        <TextField label="Dirección" {...field('address')} />
        <p className="text-[13px] text-ink-muted">
          El IVA del 21 % está incluido en el precio: la factura desglosa la base y el IVA sin
          cambiar el total.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={missing} busy={issue.isPending} busyLabel="Emitiendo…">
            Emitir factura
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
