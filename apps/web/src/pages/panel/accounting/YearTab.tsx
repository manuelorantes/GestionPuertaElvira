import { Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { closeSeason } from '@/features/accounting/api';
import { fiscalYearLabel } from '@/features/accounting/categories';
import { useAccountingMutation, useFiscalYear } from '@/features/accounting/hooks';
import { formatCents, monthLabel } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';

const NAV =
  'flex size-10 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted';

function resultClass(cents: number): string {
  if (cents > 0) return 'text-success-fg';
  return cents < 0 ? 'text-danger-fg' : '';
}

export function YearTab({
  startYear,
  onChange,
}: {
  startYear: number;
  onChange: (year: number) => void;
}) {
  const year = useFiscalYear(startYear);
  const [confirming, setConfirming] = useState(false);
  const close = useAccountingMutation(() => closeSeason(startYear));
  const toast = useToast();
  const label = fiscalYearLabel(startYear);
  const y = year.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Temporada anterior"
          onClick={() => onChange(startYear - 1)}
          className={NAV}
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <p
          aria-live="polite"
          className="min-w-40 text-center font-display text-xl font-semibold tracking-[0.04em] uppercase"
        >
          Temporada {label}
        </p>
        <button
          type="button"
          aria-label="Temporada siguiente"
          onClick={() => onChange(startYear + 1)}
          className={NAV}
        >
          <ChevronRight aria-hidden size={18} />
        </button>
      </div>
      {close.isError && <Alert>{apiErrorMessage(close.error)}</Alert>}
      {!y ? (
        <p className="text-ink-muted">Cargando temporada…</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <Card className="min-w-0 flex-[2_1_560px] overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="border-b border-line px-5 py-4 text-left font-display text-xl font-semibold tracking-[0.04em] uppercase">
                Temporada {label} mes a mes
              </caption>
              <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Mes
                  </th>
                  {['Ingresos', 'Gastos', 'Resultado', 'Acumulado'].map((h) => (
                    <th key={h} scope="col" className="px-5 py-3 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line-soft text-ink-muted">
                  <td className="px-5 py-2.5">Saldo inicial</td>
                  <td colSpan={3} />
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {formatCents(y.openingCents)}
                  </td>
                </tr>
                {y.months.map((m) => (
                  <tr key={m.month} className="border-b border-line-soft">
                    <td className="px-5 py-2.5 font-medium">{monthLabel(m.month)}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {formatCents(m.incomeCents)}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {formatCents(m.expenseCents)}
                    </td>
                    <td
                      className={`px-5 py-2.5 text-right font-semibold whitespace-nowrap ${resultClass(m.resultCents)}`}
                    >
                      {formatCents(m.resultCents)}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap text-ink-muted">
                      {formatCents(m.accumulatedCents)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-sand font-semibold">
                  <td className="px-5 py-3.5">Total</td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {formatCents(y.incomeCents)}
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {formatCents(y.expenseCents)}
                  </td>
                  <td className={`px-5 py-3.5 text-right ${resultClass(y.resultCents)}`}>
                    {formatCents(y.resultCents)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </Card>
          <section
            aria-label={`Cierre de temporada ${label}`}
            className="relative flex min-w-0 flex-[1_1_300px] flex-col gap-4 overflow-hidden rounded-md bg-ink-strong p-6 text-paper"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 size-24 bg-brand [clip-path:polygon(0_0,100%_0,100%_100%)]"
            />
            <h2 className="relative font-display text-[22px] font-semibold tracking-[0.04em] uppercase">
              Cierre de temporada {label}
            </h2>
            <span className="relative w-fit rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold">
              {y.closedOn ? `Cerrada el ${formatDate(y.closedOn)}` : 'Abierta'}
            </span>
            <div className="flex flex-col gap-2 border-t border-ink-soft pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-line-strong">Ingresos</span>
                <span>{formatCents(y.incomeCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-line-strong">Gastos</span>
                <span>{formatCents(y.expenseCents)}</span>
              </div>
              <div className="flex justify-between border-t border-ink-soft pt-2 text-base font-semibold">
                <span>Resultado</span>
                <span>{formatCents(y.resultCents)}</span>
              </div>
            </div>
            <p className="text-[13px] text-line-strong">
              Al cerrar, los movimientos de septiembre {startYear} a agosto {startYear + 1} quedan
              bloqueados y el resultado pasa como saldo inicial a {fiscalYearLabel(startYear + 1)}.
            </p>
            {y.canClose && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-sm bg-paper font-semibold text-ink-strong hover:bg-sand"
              >
                <Archive aria-hidden size={18} />
                Cerrar temporada
              </button>
            )}
            {!y.canClose && !y.closedOn && (
              <p className="text-[13px] text-line-strong">
                Se podrá cerrar a partir de agosto de {startYear + 1}.
              </p>
            )}
          </section>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={`¿Cerrar la temporada ${label}?`}
          message={`Los movimientos de septiembre ${startYear} a agosto ${startYear + 1} quedarán bloqueados. El resultado de ${formatCents(y?.resultCents ?? 0)} pasará como saldo inicial de ${fiscalYearLabel(startYear + 1)}.`}
          confirmLabel="Cerrar temporada"
          busy={close.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            void close.mutateAsync(undefined).then(
              () => {
                toast(`Temporada ${label} cerrada`);
                setConfirming(false);
              },
              () => setConfirming(false),
            )
          }
        />
      )}
    </div>
  );
}
