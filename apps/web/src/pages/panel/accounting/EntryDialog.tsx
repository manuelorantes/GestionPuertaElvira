import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { recordEntry } from '@/features/accounting/api';
import { METHODS, type EntryKind } from '@/features/accounting/categories';
import { useAccountingMutation, useCategoryOptions } from '@/features/accounting/hooks';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

import { PeriodSelect } from './PeriodSelect';

/** «Añadir movimiento»: ingreso o gasto anotado a mano. */
export function EntryDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<EntryKind>('income');
  const [date, setDate] = useState(todayIso());
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('transfer');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('');
  const save = useAccountingMutation(recordEntry);
  const categories = useCategoryOptions(kind);
  const toast = useToast();
  const year = new Date().getFullYear();
  const invalid = !concept.trim() || !category || !amount.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    await save
      .mutateAsync({
        date,
        kind,
        concept: concept.trim(),
        category,
        method,
        amount: amount.trim(),
        period: period || null,
      })
      .then(
        () => {
          toast('Movimiento añadido');
          onClose();
        },
        () => undefined,
      );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="entry-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="entry-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Añadir movimiento
        </h2>
        {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
        <div role="group" aria-label="Tipo" className="flex gap-2">
          {(['income', 'expense'] as const).map((k) => (
            <ToggleButton
              key={k}
              pressed={kind === k}
              onClick={() => {
                setKind(k);
                setCategory('');
              }}
              className="h-11 flex-1"
            >
              {k === 'income' ? 'Ingreso' : 'Gasto'}
            </ToggleButton>
          ))}
        </div>
        <DateField
          label="Fecha"
          value={date}
          onChange={setDate}
          fromYear={year - 2}
          toYear={year + 1}
        />
        <PeriodSelect
          date={date}
          value={period}
          onChange={setPeriod}
          defaultLabel="El de la fecha"
        />
        <TextField label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} />
        <Select
          label="Categoría"
          value={category}
          onChange={setCategory}
          options={[{ value: '', label: 'Elige una categoría' }, ...categories]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Forma de pago" value={method} onChange={setMethod} options={METHODS} />
          <TextField
            label="Importe (€)"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid} busy={save.isPending} busyLabel="Guardando…">
            Guardar movimiento
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
