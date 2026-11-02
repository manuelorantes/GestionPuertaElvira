import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { fiscalYearLabel, fiscalYearOf } from '@/features/accounting/categories';
import { formatCents, monthLabel } from '@/features/billing/money';
import {
  type FeesVsFixedItem,
  type FeesVsFixedMonth,
  fetchFeesVsFixed,
} from '@/features/dashboard/api';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import { MonthlyChart } from '../MonthlyChart';
import { BAR_STYLE, type BarKind } from '../chartBars';

const KINDS: BarKind[] = ['income', 'expected', 'expense', 'expectedExpense'];

type MonthColumn = 'month' | BarKind | 'result';

const cents = (m: FeesVsFixedMonth, kind: BarKind): number =>
  ({
    income: m.incomeCents,
    expected: m.expectedCents,
    expense: m.expenseCents,
    expectedExpense: m.expectedExpenseCents,
  })[kind];

const result = (m: FeesVsFixedMonth) =>
  m.incomeCents + m.expectedCents - m.expenseCents - m.expectedExpenseCents;

const MONTH_COLUMNS: Record<MonthColumn, SortColumn<FeesVsFixedMonth>> = {
  month: { label: 'Mes', name: 'mes', value: (m) => m.month },
  income: { label: 'Ingresos', name: 'ingresos', value: (m) => m.incomeCents },
  expected: { label: 'Cuotas previstas', name: 'cuotas previstas', value: (m) => m.expectedCents },
  expense: { label: 'Gastos', name: 'gastos', value: (m) => m.expenseCents },
  expectedExpense: {
    label: 'Gastos previstos',
    name: 'gastos previstos',
    value: (m) => m.expectedExpenseCents,
  },
  result: { label: 'Resultado', name: 'resultado', value: result },
};

type ItemColumn = 'concept' | 'detail' | 'date' | 'amount';

const ITEM_COLUMNS: Record<ItemColumn, SortColumn<FeesVsFixedItem>> = {
  concept: { label: 'Concepto', name: 'concepto', value: (i) => i.concept },
  detail: { label: 'Detalle', name: 'detalle', value: (i) => i.detail },
  date: { label: 'Fecha', name: 'fecha', value: (i) => i.date },
  amount: { label: 'Importe', name: 'importe', value: (i) => i.amountCents },
};

function resultClass(value: number): string {
  if (value > 0) return 'text-success-fg';
  return value < 0 ? 'text-danger-fg' : '';
}

const CELL = 'px-4 py-2.5 text-right whitespace-nowrap';

/**
 * «Cuotas vs gastos fijos» de la temporada en curso, en grande, con su tabla mes a mes y, debajo, de qué sale la parte
 * elegida (una parte de barra o una cifra de la tabla). Solo para verlo.
 */
export function FeesVsFixedSection({
  selected,
  onSelect,
}: {
  selected: { month: string; kind: BarKind } | null;
  onSelect: (month: string, kind: BarKind) => void;
}) {
  const query = useQuery({ queryKey: ['dashboard', 'fees-vs-fixed'], queryFn: fetchFeesVsFixed });
  const months = useTableSort(MONTH_COLUMNS, { key: 'month' });
  const data = query.data;
  const chosen = selected && data?.months.find((m) => m.month === selected.month);
  // Al llegar con una parte elegida (desde el resumen), se baja a su detalle.
  const detail = useRef<HTMLDivElement>(null);
  const arrived = useRef(selected !== null);
  useEffect(() => {
    if (!arrived.current || !chosen) return;
    arrived.current = false;
    detail.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [chosen]);

  return (
    <Card className="flex flex-col gap-6 p-6">
      <section aria-label="Cuotas vs gastos fijos" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
            Cuotas vs gastos fijos
            {data ? ` · ${fiscalYearLabel(fiscalYearOf(data.month))}` : ''}
          </h2>
          <div className="flex flex-wrap gap-4 text-[13px] text-ink-soft">
            {KINDS.map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-3 rounded-[3px] ${BAR_STYLE[kind].color}`} />
                {BAR_STYLE[kind].label}
              </span>
            ))}
          </div>
        </div>
        {query.isError && <Alert>{apiErrorMessage(query.error)}</Alert>}
        {!data ? (
          !query.isError && <p className="text-ink-muted">Cargando…</p>
        ) : (
          <>
            <MonthlyChart
              months={data.months}
              current={data.month}
              label="Cuotas vs gastos fijos, de septiembre a agosto; pincha una parte para ver de qué sale"
              id="detalle"
              className="h-80"
              onSelect={onSelect}
              selected={selected}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Cuotas vs gastos fijos mes a mes</caption>
                <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {months.header('month')}
                    </th>
                    {([...KINDS, 'result'] as const).map((key) => (
                      <th key={key} scope="col" className="px-4 py-3 text-right font-semibold">
                        {months.header(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {months.apply(data.months).map((m) => (
                    <tr key={m.month} className="border-b border-line-soft">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium">
                        {monthLabel(m.month)}
                      </th>
                      {KINDS.map((kind) => {
                        const active = selected?.month === m.month && selected.kind === kind;
                        return (
                          <td key={kind} className={CELL}>
                            <button
                              type="button"
                              aria-pressed={active}
                              aria-label={`${BAR_STYLE[kind].label} de ${monthLabel(m.month).toLowerCase()}: ${formatCents(cents(m, kind))}`}
                              onClick={() => onSelect(m.month, kind)}
                              className={`cursor-pointer rounded-sm px-1.5 py-0.5 hover:bg-surface-muted ${active ? 'bg-brand-soft font-semibold text-brand-strong' : ''}`}
                            >
                              {formatCents(cents(m, kind))}
                            </button>
                          </td>
                        );
                      })}
                      <td className={`${CELL} font-semibold ${resultClass(result(m))}`}>
                        {formatCents(result(m))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div ref={detail}>
              {chosen && selected ? (
                <PartDetail month={chosen} kind={selected.kind} />
              ) : (
                <p className="text-sm text-ink-muted">
                  Pincha una barra o una cifra para ver de qué sale.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </Card>
  );
}

/** De qué sale una parte de un mes: sus líneas, que suman lo mismo que la barra. */
function PartDetail({ month, kind }: { month: FeesVsFixedMonth; kind: BarKind }) {
  const items = useTableSort(ITEM_COLUMNS, { key: 'amount', descending: true });
  const lines = month.parts[kind];
  const title = `${BAR_STYLE[kind].label} de ${monthLabel(month.month).toLowerCase()}`;
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-t border-line pt-5">
      <h3 className="font-display text-lg font-semibold tracking-[0.04em] uppercase">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-ink-muted">Nada este mes.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">{`De qué salen los ${title.toLowerCase()}`}</caption>
            <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              <tr>
                {(['concept', 'detail', 'date'] as const).map((key) => (
                  <th key={key} scope="col" className="px-4 py-3 font-semibold">
                    {items.header(key)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  {items.header('amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.apply(lines).map((item, index) => (
                <tr key={`${item.concept}-${index}`} className="border-b border-line-soft">
                  <td className="px-4 py-2.5 font-medium">{item.concept}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{item.detail}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-soft">
                    {item.date ? formatDate(item.date) : '—'}
                  </td>
                  <td className={CELL}>
                    <span className="font-semibold">{formatCents(item.amountCents)}</span>
                    {item.totalCents !== null && (
                      <span className="block text-xs text-ink-muted">
                        de {formatCents(item.totalCents)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-sand font-semibold">
                <td className="px-4 py-3" colSpan={3}>
                  Total
                </td>
                <td className={CELL}>{formatCents(cents(month, kind))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
