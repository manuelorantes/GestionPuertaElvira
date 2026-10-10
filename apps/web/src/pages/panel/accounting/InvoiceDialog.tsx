import { FileText, Upload } from 'lucide-react';
import { useId, useState, type DragEvent, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { payInvoice, registerInvoice } from '@/features/accounting/api';
import { CATEGORIES, documentProblem } from '@/features/accounting/categories';
import { useAccountingMutation } from '@/features/accounting/hooks';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { PeriodSelect } from './PeriodSelect';

/** «Añadir factura»: datos del proveedor y, si se tiene, el PDF o la foto. */
export function InvoiceDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [values, setValues] = useState({
    supplier: '',
    number: '',
    concept: '',
    amount: '',
    category: '',
    date: todayIso(),
    // Mes al que corresponde; vacío, el de la factura.
    period: '',
  });
  const [paid, setPaid] = useState(true);
  // Si la factura ya se registró pero falló el pago, reintentar no debe registrarla otra vez.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const toast = useToast();
  const inputId = useId();
  const save = useAccountingMutation(async () => {
    let id = createdId;
    if (!id) {
      const form = new FormData();
      Object.entries(values).forEach(([key, value]) => form.append(key, value.trim()));
      if (file) form.append('file', file);
      id = await registerInvoice(form);
      setCreatedId(id);
    }
    if (paid) await payInvoice(id, values.date, 'transfer');
  });
  const year = new Date().getFullYear();
  const invalid =
    !values.supplier.trim() || !values.concept.trim() || !values.amount.trim() || !values.category;
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    const problem = documentProblem(chosen);
    setFileError(problem);
    setFile(problem ? null : chosen);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    choose(event.dataTransfer.files[0]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    await save.mutateAsync(undefined).then(
      () => {
        toast('Factura registrada');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="invoice-title">
      <form onSubmit={(event) => void submit(event)}>
        <h2
          id="invoice-title"
          className="border-b border-line px-6 py-5 font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Añadir factura
        </h2>
        <div className="flex flex-col gap-4 p-6">
          {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
          <label
            htmlFor={inputId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={drop}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-[1.5px] border-dashed border-line-strong bg-surface-muted p-6 text-ink-soft focus-within:border-brand"
          >
            {file ? (
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-strong">
                <FileText aria-hidden size={18} />
                {file.name}
              </span>
            ) : (
              <>
                <Upload aria-hidden size={22} />
                <span className="text-sm font-semibold">
                  Arrastra aquí el PDF o la foto de la factura
                </span>
                <span className="text-[13px] text-ink-muted">
                  o haz clic para elegir el archivo (máx. 10 MB)
                </span>
              </>
            )}
            <input
              id={inputId}
              type="file"
              aria-label="Documento"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => choose(event.target.files?.[0])}
              className="sr-only"
            />
          </label>
          {fileError && <Alert>{fileError}</Alert>}
          <TextField
            label="Proveedor"
            placeholder="Nombre del proveedor"
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
              placeholder="0,00"
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
            options={[
              { value: '', label: 'Elige una categoría' },
              ...CATEGORIES.expense.filter((c) => c.value !== 'teachers'),
            ]}
          />
          <DateField
            label="Fecha de la factura"
            value={values.date}
            onChange={set('date')}
            fromYear={year - 2}
            toYear={year + 1}
          />
          <PeriodSelect
            date={values.date}
            value={values.period}
            onChange={set('period')}
            defaultLabel="El de la factura"
          />
          <Switch
            label="Ya está pagada (por transferencia, en esa fecha)"
            checked={paid}
            onChange={setPaid}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid} busy={save.isPending} busyLabel="Guardando…">
            Guardar factura
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
