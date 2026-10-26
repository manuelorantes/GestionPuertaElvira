import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  defineExpectedExpense,
  removeExpectedExpense,
  reviseExpectedExpense,
  type ExpectedExpense,
} from '@/features/accounting/api';
import {
  DEFAULT_MONTHS,
  expectedMonthsLabel,
  monthOfYearName,
  SEASON_ORDER,
} from '@/features/accounting/expectedMonths';
import {
  useAccountingMutation,
  useCategoryOptions,
  useExpectedExpenses,
} from '@/features/accounting/hooks';
import { centsFromText, centsToText, formatCents, monthLabel } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

const SECTION_TITLE = 'text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase';
const ROW_ACTION =
  'flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted';

type Column = 'concept' | 'category' | 'amount' | 'months';

const COLUMNS: Record<Column, SortColumn<ExpectedExpense>> = {
  concept: { label: 'Concepto', name: 'concepto', value: (e) => e.concept },
  category: { label: 'Categoría', name: 'categoría', value: (e) => e.categoryLabel },
  amount: { label: 'Importe', name: 'importe', value: (e) => e.amountCents },
  months: { label: 'Meses', name: 'meses', value: (e) => e.months.length },
};

/** Ajustes → «Gastos esperados»: lo que el club espera pagar cada mes, con lo que suele costar. */
export function ExpectedExpensesSection() {
  const expected = useExpectedExpenses();
  const [editing, setEditing] = useState<ExpectedExpense | 'new' | null>(null);
  const [removing, setRemoving] = useState<ExpectedExpense | null>(null);
  const remove = useAccountingMutation(removeExpectedExpense);
  const toast = useToast();
  const { header, apply } = useTableSort(COLUMNS, { key: 'concept' });
  const items = expected.data ?? [];

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={SECTION_TITLE}>Gastos esperados</h3>
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus aria-hidden size={18} />
          Añadir gasto esperado
        </Button>
      </div>
      <p className="text-sm text-ink-soft">
        Lo que el club paga cada mes (alquiler, limpieza, presidencia…). Hasta que se paga en
        Movimientos cuenta como previsto en el resumen; al pagarlo se anota lo que ha costado de
        verdad.
      </p>
      {expected.isError && <Alert>{apiErrorMessage(expected.error)}</Alert>}
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Gastos esperados</caption>
            <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              <tr>
                {(['concept', 'category'] as const).map((key) => (
                  <th key={key} scope="col" className="px-3 py-3 font-semibold">
                    {header(key)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  {header('amount')}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {header('months')}
                </th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {apply(items).map((e) => (
                <tr key={e.id} className="border-b border-line-soft last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">{e.concept}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{e.categoryLabel}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    {formatCents(e.amountCents)}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">
                    {expectedMonthsLabel(e.months)}
                    <span className="block text-[12px] text-ink-muted">
                      Desde {monthLabel(e.since).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-1">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        aria-label={`Editar ${e.concept}`}
                        onClick={() => setEditing(e)}
                        className={ROW_ACTION}
                      >
                        <Pencil aria-hidden size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${e.concept}`}
                        onClick={() => setRemoving(e)}
                        className={`${ROW_ACTION} text-danger-fg hover:bg-danger-bg`}
                      >
                        <Trash2 aria-hidden size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ExpectedExpenseDialog
          expense={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`¿Quitar ${removing.concept}?`}
          message="Deja de esperarse. Lo que ya se pagó sigue en Movimientos."
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
                setRemoving(null);
                toast('Gasto esperado quitado');
              },
              () => undefined,
            )
          }
        />
      )}
    </Card>
  );
}

function ExpectedExpenseDialog({
  expense,
  onClose,
}: {
  expense: ExpectedExpense | null;
  onClose: () => void;
}) {
  const [concept, setConcept] = useState(expense?.concept ?? '');
  const [category, setCategory] = useState(expense?.category ?? '');
  const [amount, setAmount] = useState(expense ? centsToText(expense.amountCents) : '');
  const [months, setMonths] = useState<number[]>(expense?.months ?? DEFAULT_MONTHS);
  // Lo del profesorado ya se prevé con su horario.
  const categories = useCategoryOptions('expense', ['teachers']);
  const save = useAccountingMutation((input: Parameters<typeof defineExpectedExpense>[0]) =>
    expense
      ? reviseExpectedExpense({ id: expense.id, ...input })
      : defineExpectedExpense(input).then(() => undefined),
  );
  const toast = useToast();
  const invalid =
    !concept.trim() || !category || (centsFromText(amount) ?? 0) <= 0 || months.length === 0;

  function toggle(month: number) {
    setMonths((current) =>
      current.includes(month) ? current.filter((m) => m !== month) : [...current, month],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    await save
      .mutateAsync({ concept: concept.trim(), category, amount: amount.trim(), months })
      .then(
        () => {
          toast(expense ? 'Gasto esperado guardado' : 'Gasto esperado añadido');
          onClose();
        },
        () => undefined,
      );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="expected-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="expected-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {expense ? 'Editar gasto esperado' : 'Añadir gasto esperado'}
        </h2>
        {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
        <TextField label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Categoría"
            value={category}
            onChange={setCategory}
            options={[{ value: '', label: 'Elige una categoría' }, ...categories]}
          />
          <TextField
            label="Importe esperado (€)"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span id="expected-months" className="text-sm font-medium">
            Meses en que se espera
          </span>
          <div role="group" aria-labelledby="expected-months" className="flex flex-wrap gap-1.5">
            {SEASON_ORDER.map((m) => (
              <ToggleButton
                key={m}
                tone="ink"
                pressed={months.includes(m)}
                onClick={() => toggle(m)}
                aria-label={monthOfYearName(m)}
                className="h-8 min-w-0 px-2 text-[13px] font-medium capitalize"
              >
                {monthOfYearName(m).slice(0, 3)}
              </ToggleButton>
            ))}
          </div>
          <span className="text-[13px] text-ink-muted">
            {months.length === 0 ? 'Elige al menos un mes.' : expectedMonthsLabel(months)}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid} busy={save.isPending} busyLabel="Guardando…">
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
