import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { editMovement, type LedgerItem } from '@/features/accounting/api';
import { METHODS, methodLabel } from '@/features/accounting/categories';
import {
  useAccountingMutation,
  useCategories,
  useCategoryOptions,
} from '@/features/accounting/hooks';
import { centsFromText, centsToText, formatCents, monthLabel } from '@/features/billing/money';
import { Button } from '@/shared/ui/Button';
import { ConfirmChangesDialog } from '@/shared/ui/ConfirmChangesDialog';
import { changedFields } from '@/shared/ui/fieldChanges';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { PeriodSelect } from './PeriodSelect';

/** Lo que no cambia fuera de contabilidad al corregir un movimiento que viene de otra sección. */
const ELSEWHERE: Record<string, string> = {
  payment:
    'El recibo y las cuotas del alumno no cambian: la corrección solo afecta a contabilidad (la forma de pago sí cambia también en el recibo).',
  settlement: 'La nómina del profesor no cambia: la corrección solo afecta a contabilidad.',
  advance: 'La nómina del profesor no cambia: la corrección solo afecta a contabilidad.',
};

/**
 * Editar un movimiento del libro: concepto, categoría, forma de pago, importe y mes al que corresponde. Antes de guardar
 * se confirma lo que cambia.
 */
export function EditMovementDialog({
  item,
  month,
  onClose,
}: {
  item: LedgerItem;
  /** Mes del libro en que sale. */
  month: string;
  onClose: () => void;
}) {
  const dateMonth = item.date.slice(0, 7);
  const [concept, setConcept] = useState(item.concept);
  const [category, setCategory] = useState(item.category);
  const [method, setMethod] = useState(item.method);
  const [amount, setAmount] = useState(centsToText(item.amountCents));
  const [period, setPeriod] = useState(item.period && item.period !== dateMonth ? item.period : '');
  const [confirming, setConfirming] = useState(false);
  const categories = useCategories().data ?? [];
  const categoryOptions = useCategoryOptions(item.kind === 'income' ? 'income' : 'expense');
  const save = useAccountingMutation(editMovement);
  const toast = useToast();
  const cents = centsFromText(amount);
  const invalid = !concept.trim() || !category || cents === null || cents <= 0;

  const label = (code: string) => categories.find((c) => c.code === code)?.label ?? code;
  const newPeriod = period || dateMonth;
  const changes = changedFields([
    ['Concepto', item.concept, concept.trim()],
    ['Categoría', label(item.category), label(category)],
    ['Forma de pago', methodLabel(item.method), methodLabel(method)],
    ['Importe', formatCents(item.amountCents), formatCents(cents ?? 0)],
    ['Mes al que corresponde', monthLabel(item.period || dateMonth), monthLabel(newPeriod)],
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
        source: item.source,
        sourceId: item.sourceId,
        month,
        concept: concept.trim(),
        category,
        method,
        amount: amount.trim(),
        period: newPeriod,
      })
      .then(
        () => {
          toast('Movimiento editado');
          onClose();
        },
        () => undefined,
      );
  }

  if (confirming) {
    return (
      <ConfirmChangesDialog
        changes={changes}
        warning={ELSEWHERE[item.source]}
        busy={save.isPending}
        error={save.isError ? apiErrorMessage(save.error) : null}
        onBack={() => setConfirming(false)}
        onConfirm={confirm}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="edit-movement-title">
      <form onSubmit={review} className="flex flex-col gap-4 p-6">
        <h2
          id="edit-movement-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Editar movimiento
        </h2>
        <TextField label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} />
        <Select
          label="Categoría"
          value={category}
          onChange={setCategory}
          options={categoryOptions}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Forma de pago" value={method} onChange={setMethod} options={METHODS} />
          <TextField
            label="Importe (€)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <PeriodSelect
          date={item.date}
          value={period}
          onChange={setPeriod}
          defaultLabel="El de la fecha"
        />
        <div className="flex justify-end gap-2">
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
