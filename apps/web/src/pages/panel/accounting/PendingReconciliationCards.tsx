import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useState } from 'react';

import { usePendingReconciliation } from '@/features/accounting/hooks';
import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Card } from '@/shared/ui/Card';

const METHOD: Record<string, string> = {
  transfer: 'Transferencia',
  card: 'Tarjeta',
  bank: 'Traspaso al banco',
  cash: 'Traspaso a caja',
};

interface Line {
  key: string;
  date: string;
  concept: string;
  detail?: string;
  amountCents: number;
}

/**
 * Lo que queda por conciliar a cada lado, bajo los saldos: en la app, lo de tarjeta y transferencia sin casar con el
 * banco; en el banco, las líneas de los extractos subidos que no casan con nada. Cada tarjeta se despliega con su lista.
 */
export function PendingReconciliationCards() {
  const pending = usePendingReconciliation();
  const view = pending.data;
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      <PendingCard
        label="En la app sin conciliar"
        hint="Cobros, gastos y traspasos de tarjeta o transferencia del ejercicio sin casar con el banco"
        empty="Todo lo de la app está conciliado."
        totalCents={view?.app.totalCents}
        lines={(view?.app.items ?? []).map((i) => ({
          key: `${i.source}:${i.sourceId}`,
          date: i.date,
          concept: i.concept,
          detail: METHOD[i.method] ?? i.method,
          amountCents: i.amountCents,
        }))}
      />
      <PendingCard
        label="En el banco sin conciliar"
        hint="Líneas de los extractos subidos que no casan con nada de la app"
        empty="Todo lo de los extractos subidos está conciliado."
        totalCents={view?.bank.totalCents}
        lines={(view?.bank.items ?? []).map((m) => ({
          key: `${m.operationDate}|${m.valueDate}|${m.amountCents}|${m.balanceCents}`,
          date: m.operationDate,
          concept: m.concept,
          amountCents: m.amountCents,
        }))}
      />
    </div>
  );
}

function PendingCard({
  label,
  hint,
  empty,
  totalCents,
  lines,
}: {
  label: string;
  hint: string;
  empty: string;
  totalCents: number | undefined;
  lines: Line[];
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <Card className="flex flex-col gap-2 px-6 py-5">
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <p className="font-display text-[32px] leading-tight font-bold tabular-nums">
        {totalCents === undefined ? '—' : formatCents(totalCents)}
      </p>
      <p className="text-[13px] text-ink-muted">{hint}</p>
      {totalCents !== undefined && (
        <button
          type="button"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 self-start text-sm font-semibold text-brand hover:underline"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp aria-hidden size={16} /> : <ChevronDown aria-hidden size={16} />}
          {lines.length === 1 ? '1 sin conciliar' : `${lines.length} sin conciliar`}
        </button>
      )}
      {open && (
        <div id={listId}>
          {lines.length === 0 ? (
            <p className="text-sm text-ink-muted">{empty}</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto border-l-2 border-line pl-3">
              {lines.map((l) => (
                <li key={l.key} className="flex flex-wrap gap-x-3 text-sm">
                  <span className="text-ink-muted tabular-nums">{formatDate(l.date)}</span>
                  <span className="min-w-0 flex-1 break-words">{l.concept}</span>
                  {l.detail && <span className="text-ink-muted">{l.detail}</span>}
                  <span
                    className={`font-semibold tabular-nums ${l.amountCents < 0 ? 'text-danger-fg' : 'text-success-fg'}`}
                  >
                    {formatCents(l.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
