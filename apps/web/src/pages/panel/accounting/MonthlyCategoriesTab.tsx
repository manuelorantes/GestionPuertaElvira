import { Pencil, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  addCategory,
  removeCategory,
  renameCategory,
  saveMonthlyCategories,
  type Category,
} from '@/features/accounting/api';
import type { EntryKind } from '@/features/accounting/categories';
import {
  useAccountingMutation,
  useCategories,
  useMonthlyCategories,
} from '@/features/accounting/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const SECTION_TITLE = 'text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase';

/** Ajustes de contabilidad: las categorías del club y cuáles cuentan como ingresos y gastos «del mes». */
export function MonthlyCategoriesTab() {
  const categories = useCategories();
  const saved = useMonthlyCategories();
  if (!categories.data || !saved.data) {
    return (
      <Card className="p-6 text-sm text-ink-muted">
        {categories.isError || saved.isError ? 'No se han podido cargar los ajustes.' : 'Cargando…'}
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ClubCategories categories={categories.data} />
      <MonthlyCategoriesForm
        // Al añadir una categoría se vuelve a montar con su casilla.
        key={categories.data.map((c) => c.code).join()}
        categories={categories.data}
        initial={saved.data}
      />
    </div>
  );
}

/** Añadir categorías propias, renombrarlas y quitar las que no tienen movimientos. */
function ClubCategories({ categories }: { categories: Category[] }) {
  const [kind, setKind] = useState<EntryKind>('expense');
  const [label, setLabel] = useState('');
  const [renaming, setRenaming] = useState<{ code: string; label: string } | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const add = useAccountingMutation(addCategory);
  const rename = useAccountingMutation(renameCategory);
  const remove = useAccountingMutation(removeCategory);
  const toast = useToast();
  const own = categories.filter((c) => c.custom);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    void add.mutateAsync({ kind, label: label.trim() }).then(
      () => {
        setLabel('');
        toast('Categoría añadida');
      },
      () => undefined,
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <h3 className={SECTION_TITLE}>Categorías del club</h3>
      <p className="text-sm text-ink-soft">
        Además de las de serie, podéis crear las vuestras para ingresos o gastos. Se pueden
        renombrar, y quitar mientras no tengan movimientos.
      </p>
      {add.isError && <Alert>{apiErrorMessage(add.error)}</Alert>}
      <form
        aria-label="Añadir categoría"
        onSubmit={submit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div role="group" aria-label="Tipo" className="flex gap-2">
          {(['expense', 'income'] as const).map((k) => (
            <ToggleButton
              key={k}
              pressed={kind === k}
              onClick={() => setKind(k)}
              className="h-11 px-4"
            >
              {k === 'income' ? 'Ingreso' : 'Gasto'}
            </ToggleButton>
          ))}
        </div>
        <TextField label="Nombre" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" disabled={!label.trim()} busy={add.isPending} busyLabel="Añadiendo…">
          Añadir
        </Button>
      </form>
      {(rename.isError || remove.isError) && (
        <Alert>{apiErrorMessage(rename.error ?? remove.error)}</Alert>
      )}
      {own.length > 0 && (
        <ul
          aria-label="Categorías del club"
          className="divide-y divide-line-soft border-t border-line-soft"
        >
          {own.map((c) => (
            <li key={c.code} className="flex min-h-12 items-center gap-2 py-1.5 text-sm">
              {renaming?.code === c.code ? (
                <form
                  className="flex flex-1 items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename.mutateAsync(renaming).then(
                      () => {
                        setRenaming(null);
                        toast('Categoría renombrada');
                      },
                      () => undefined,
                    );
                  }}
                >
                  <TextField
                    label={`Nuevo nombre de ${c.label}`}
                    value={renaming.label}
                    onChange={(e) => setRenaming({ code: c.code, label: e.target.value })}
                  />
                  <Button type="submit" busy={rename.isPending} busyLabel="Guardando…">
                    Guardar nombre
                  </Button>
                  <Button variant="secondary" onClick={() => setRenaming(null)}>
                    Cancelar
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1">
                    <span className="font-medium">{c.label}</span>{' '}
                    <span className="text-ink-muted">
                      · {c.kind === 'income' ? 'ingresos' : 'gastos'}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Renombrar ${c.label}`}
                    onClick={() => setRenaming({ code: c.code, label: c.label })}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                  >
                    <Pencil aria-hidden size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar ${c.label}`}
                    onClick={() => setRemoving(c)}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-sm text-danger-fg hover:bg-danger-bg"
                  >
                    <Trash2 aria-hidden size={15} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title={`¿Quitar la categoría ${removing.label}?`}
          message="Solo se puede quitar si ningún movimiento la usa."
          confirmLabel="Quitar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            void remove.mutateAsync(removing.code).then(
              () => {
                setRemoving(null);
                toast('Categoría quitada');
              },
              () => undefined,
            )
          }
        />
      )}
    </Card>
  );
}

/** Qué categorías salen en la gráfica «Lo que corresponde a cada mes» del resumen. */
function MonthlyCategoriesForm({
  categories,
  initial,
}: {
  categories: Category[];
  initial: string[];
}) {
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
  const ordered = (['expense', 'income'] as const)
    .flatMap((kind) => categories.filter((c) => c.kind === kind))
    .map((c) => c.code)
    .filter((c) => chosen.has(c));

  return (
    <Card className="flex flex-col gap-5 p-6">
      <h3 className={SECTION_TITLE}>Cuentan como del mes</h3>
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
            <legend className={`mb-1 ${SECTION_TITLE}`}>{legend}</legend>
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <label
                  key={c.code}
                  className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(c.code)}
                    onChange={() => toggle(c.code)}
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
