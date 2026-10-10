import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { saveMonthlyCategories } from '@/features/accounting/api';
import { CATEGORIES } from '@/features/accounting/categories';
import { useAccountingMutation, useMonthlyCategories } from '@/features/accounting/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { useToast } from '@/shared/ui/Toast';

/**
 * Qué categorías cuentan como ingresos y gastos «del mes»: las que salen, cada una en el mes al que corresponde, en la
 * gráfica del resumen.
 */
export function MonthlyCategoriesTab() {
  const saved = useMonthlyCategories();
  if (!saved.data) {
    return (
      <Card className="p-6 text-sm text-ink-muted">
        {saved.isError ? 'No se han podido cargar los ajustes.' : 'Cargando…'}
      </Card>
    );
  }
  return <MonthlyCategoriesForm initial={saved.data} />;
}

function MonthlyCategoriesForm({ initial }: { initial: string[] }) {
  const [chosen, setChosen] = useState(() => new Set(initial));
  const save = useAccountingMutation(saveMonthlyCategories);
  const toast = useToast();
  const toggle = (category: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  // En el orden de las categorías: primero los gastos, luego los ingresos.
  const ordered = [...CATEGORIES.expense, ...CATEGORIES.income]
    .map((c) => c.value)
    .filter((c) => chosen.has(c));

  return (
    <Card className="flex flex-col gap-5 p-6">
      <p className="text-sm text-ink-soft">
        Las categorías marcadas salen en la gráfica «Lo que corresponde a cada mes» del resumen,
        cada movimiento en el mes al que corresponde (las cuotas, repartidas entre los meses que
        pagan; lo del profesorado, en el mes de la liquidación).
      </p>
      {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
      <div className="grid gap-6 sm:grid-cols-2">
        {(
          [
            ['expense', 'Gastos del mes'],
            ['income', 'Ingresos del mes'],
          ] as const
        ).map(([kind, legend]) => (
          <fieldset key={kind} className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              {legend}
            </legend>
            {CATEGORIES[kind].map((c) => (
              <label
                key={c.value}
                className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={chosen.has(c.value)}
                  onChange={() => toggle(c.value)}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          busy={save.isPending}
          busyLabel="Guardando…"
          onClick={() =>
            void save.mutateAsync(ordered).then(
              () => toast('Categorías guardadas'),
              () => undefined,
            )
          }
        >
          Guardar
        </Button>
      </div>
    </Card>
  );
}
