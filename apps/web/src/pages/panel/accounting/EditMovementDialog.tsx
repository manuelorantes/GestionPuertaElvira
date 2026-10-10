import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { editMovement, type LedgerItem } from '@/features/accounting/api';
import { METHODS } from '@/features/accounting/categories';
import {
  useAccountingMutation,
  useCategories,
  useCategoryOptions,
} from '@/features/accounting/hooks';
import { formatCents, monthLabel } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
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

const TITLE = 'font-display text-2xl font-bold tracking-[0.04em] uppercase';

/** «45» o «40,50» a partir de céntimos, como se escribe un importe. */
function amountText(cents: number): string {
  return (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)).replace('.', ',');
}

/** Céntimos de un importe escrito («40,5», «40.50»), o null si no es un número. */
function centsOf(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && text.trim() !== '' ? Math.round(value * 100) : null;
}

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
  const [amount, setAmount] = useState(amountText(item.amountCents));
  const [period, setPeriod] = useState(item.period && item.period !== dateMonth ? item.period : '');
  const [confirming, setConfirming] = useState(false);
  const categories = useCategories().data ?? [];
  const categoryOptions = useCategoryOptions(item.kind === 'income' ? 'income' : 'expense');
  const save = useAccountingMutation(editMovement);
  const toast = useToast();
  const cents = centsOf(amount);
  const invalid = !concept.trim() || !category || cents === null || cents <= 0;

  const label = (code: string) => categories.find((c) => c.code === code)?.label ?? code;
  const methodLabel = (value: string) => METHODS.find((m) => m.value === value)?.label ?? value;
  const newPeriod = period || dateMonth;
  const changes = [
    ['Concepto', item.concept, concept.trim()],
    ['Categoría', label(item.category), label(category)],
    ['Forma de pago', methodLabel(item.method), methodLabel(method)],
    ['Importe', formatCents(item.amountCents), formatCents(cents ?? 0)],
    ['Mes al que corresponde', monthLabel(item.period || dateMonth), monthLabel(newPeriod)],
  ].filter(([, before, after]) => before !== after);

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
      <Dialog open onClose={() => setConfirming(false)} labelledBy="edit-confirm-title">
        <div className="flex flex-col gap-4 p-6">
          <h2 id="edit-confirm-title" className={TITLE}>
            ¿Guardar estos cambios?
          </h2>
          {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
          <ul className="flex flex-col gap-1 text-sm">
            {changes.map(([field, before, after]) => (
              <li key={field}>{`${field}: ${before} → ${after}`}</li>
            ))}
          </ul>
          {ELSEWHERE[item.source] && <Alert tone="warning">{ELSEWHERE[item.source]}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Volver
            </Button>
            <Button busy={save.isPending} busyLabel="Guardando…" onClick={confirm}>
              Confirmar
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="edit-movement-title">
      <form onSubmit={review} className="flex flex-col gap-4 p-6">
        <h2 id="edit-movement-title" className={TITLE}>
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
