import { ArrowDownUp, Check, ChevronDown, MessageCircle, Printer } from 'lucide-react';
import { useState } from 'react';

import type { Charge, ChargeStatus } from '@/features/billing/api';
import { useMonthlyCharges } from '@/features/billing/hooks';
import { fiscalYearLabel, fiscalYearOf } from '@/features/accounting/categories';
import { currentMonth, formatCents, monthLabel, monthName } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { ToggleButton } from '@/shared/ui/ToggleButton';

import type { BillingDialog } from './BillingPage';

const STATUS: Record<
  ChargeStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  paid: { label: 'Cobrada', tone: 'success' },
  partial: { label: 'Pagada en parte', tone: 'warning' },
  due: { label: 'En plazo', tone: 'warning' },
  overdue: { label: 'Vencida', tone: 'danger' },
  upcoming: { label: 'Próxima', tone: 'neutral' },
};

const ACTION =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-[13px] font-semibold';

/** Orden de urgencia del estado: lo que hay que reclamar primero, lo cobrado al final. */
const URGENCY: ChargeStatus[] = ['overdue', 'partial', 'due', 'upcoming', 'paid'];

type StatusSort = 'none' | 'urgent' | 'paid';

/** Meses con clase de la temporada que contiene `month`: de septiembre a junio. */
function seasonMonths(month: string): string[] {
  const start = fiscalYearOf(month);
  return [9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map(
    (m) => `${m >= 9 ? start : start + 1}-${String(m).padStart(2, '0')}`,
  );
}

interface ChargesTabProps {
  month: string;
  /** Muestra las cuotas de socio de la temporada en vez de las del mes. */
  membership: boolean;
  onMonthChange: (month: string) => void;
  onAction: (dialog: BillingDialog) => void;
}

export function ChargesTab({ month, membership, onMonthChange, onAction }: ChargesTabProps) {
  const charges = useMonthlyCharges(month, membership ? 'membership' : 'monthly');
  const data = charges.data;
  const [statusFilter, setStatusFilter] = useState<ChargeStatus[]>([]);
  const [statusSort, setStatusSort] = useState<StatusSort>('none');
  const all = data?.items ?? [];
  const filtered =
    statusFilter.length === 0 ? all : all.filter((c) => statusFilter.includes(c.status));
  const items =
    statusSort === 'none'
      ? filtered
      : [...filtered].sort((a, b) => {
          const order = URGENCY.indexOf(a.status) - URGENCY.indexOf(b.status);
          return statusSort === 'urgent' ? order : -order;
        });
  const menu = (
    <StatusMenu
      charges={all}
      filter={statusFilter}
      onFilter={setStatusFilter}
      sort={statusSort}
      onSort={setStatusSort}
    />
  );
  const paid = items.filter((c) => c.status === 'paid').length;
  const progress =
    data && data.totals.expectedCents > 0
      ? (data.totals.collectedCents / data.totals.expectedCents) * 100
      : 0;

  function concept(charge: Charge) {
    if (charge.kind === 'membership') {
      const year = Number(charge.period.slice(0, 4));
      return `Cuota de socio ${year}/${String((year + 1) % 100).padStart(2, '0')}`;
    }
    return `Cuota de ${monthName(charge.period)}`;
  }

  function actions(charge: Charge) {
    if (charge.status === 'paid')
      return (
        <button
          type="button"
          onClick={() =>
            charge.paymentId && onAction({ type: 'receipt', paymentId: charge.paymentId })
          }
          className={`${ACTION} border border-line-strong hover:bg-surface-muted`}
        >
          <Printer aria-hidden size={16} />
          Recibo
        </button>
      );
    const pay = () => onAction({ type: 'payment', studentId: charge.studentId, kind: charge.kind });
    return (
      <>
        {charge.status === 'overdue' && !charge.remindedOn && (
          <button
            type="button"
            onClick={() => onAction({ type: 'whatsapp', charge })}
            className={`${ACTION} border border-brand text-brand hover:bg-brand-soft`}
          >
            <MessageCircle aria-hidden size={16} />
            WhatsApp
          </button>
        )}
        <button
          type="button"
          onClick={pay}
          className={`${ACTION} bg-brand text-surface-raised hover:bg-brand-strong`}
        >
          {charge.status === 'overdue' ? 'Cobrar' : 'Registrar cobro'}
        </button>
      </>
    );
  }

  function renderBody() {
    if (charges.isPending) return <p className="p-5 text-ink-muted">Cargando cuotas…</p>;
    if (charges.isError)
      return (
        <div className="p-5">
          <Alert>No se han podido cargar las cuotas.</Alert>
        </div>
      );
    if (all.length === 0) {
      const summer = !membership && ['07', '08'].includes(month.slice(5));
      return (
        <p className="px-5 py-12 text-center text-ink-muted">
          {summer
            ? 'En julio y agosto no hay clases.'
            : membership
              ? 'No hay cuotas de socio esta temporada.'
              : 'No hay cuotas este mes.'}
        </p>
      );
    }
    if (items.length === 0) {
      return (
        <>
          <div className="flex justify-end border-b border-line-soft px-5 py-3">{menu}</div>
          <p className="px-5 py-12 text-center text-ink-muted">Ninguna cuota con ese estado.</p>
        </>
      );
    }
    return (
      <>
        <div className="flex justify-end border-b border-line-soft px-4 py-2.5 md:hidden">
          {menu}
        </div>
        <ul aria-label="Cuotas" className="md:hidden">
          {items.map((charge) => (
            <li
              key={charge.id}
              className="flex flex-col gap-2 border-b border-line-soft p-4 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <Avatar name={charge.studentName} size={32} />
                <span className="flex-1 font-medium">{charge.studentName}</span>
                <span className="font-semibold">{formatCents(charge.amountCents)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                {concept(charge)}
                <Badge tone={STATUS[charge.status].tone}>{STATUS[charge.status].label}</Badge>
                {charge.status === 'partial' && <Missing charge={charge} />}
                {charge.remindedOn && charge.status !== 'paid' && (
                  <span className="text-[13px] text-brand-strong">Avisado</span>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">{actions(charge)}</div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">
              {membership
                ? `Cuotas de socio ${fiscalYearLabel(fiscalYearOf(month))}`
                : `Cuotas de ${monthLabel(month).toLowerCase()}`}
            </caption>
            <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              <tr>
                {['Alumno', 'Concepto', 'Importe'].map((heading) => (
                  <th key={heading} scope="col" className="px-5 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
                <th scope="col" className="px-5 py-3 font-semibold">
                  {menu}
                </th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((charge) => (
                <tr key={charge.id} className="border-b border-line-soft last:border-b-0">
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-3">
                      <Avatar name={charge.studentName} size={32} />
                      <span className="font-medium">{charge.studentName}</span>
                    </span>
                  </td>
                  <td className="px-5 py-2.5">{concept(charge)}</td>
                  <td className="px-5 py-2.5 font-medium">{formatCents(charge.amountCents)}</td>
                  <td className="px-5 py-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS[charge.status].tone}>{STATUS[charge.status].label}</Badge>
                      {charge.status === 'partial' && <Missing charge={charge} />}
                      {charge.remindedOn && charge.status !== 'paid' && (
                        <span className="inline-flex items-center gap-1 text-[13px] text-brand-strong">
                          <Check aria-hidden size={14} />
                          Avisado
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="flex justify-end gap-2">{actions(charge)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Cuotas a ver" className="flex flex-wrap gap-1.5">
        <ToggleButton
          tone="ink"
          pressed={membership}
          onClick={() => onMonthChange('socio')}
          className="h-9 rounded-full font-medium"
        >
          Cuotas de socio
        </ToggleButton>
        {seasonMonths(month).map((m) => (
          <ToggleButton
            key={m}
            tone="ink"
            pressed={!membership && m === month}
            onClick={() => onMonthChange(m)}
            aria-label={monthLabel(m)}
            title={m === currentMonth() ? `${monthLabel(m)} (en curso)` : monthLabel(m)}
            className={`h-9 min-w-0 rounded-full px-3 font-medium capitalize ${m === currentMonth() ? 'underline decoration-2 underline-offset-4' : ''}`}
          >
            {monthName(m).slice(0, 3)}
          </ToggleButton>
        ))}
      </div>
      {data && items.length > 0 && (
        <Card className="flex flex-col gap-2 px-6 py-5">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">
              {paid} de {items.length} cuotas cobradas · {formatCents(data.totals.collectedCents)}{' '}
              de {formatCents(data.totals.expectedCents)}
            </span>
            {data.totals.overdueCount > 0 && (
              <span className="font-medium text-danger-fg">
                {data.totals.overdueCount} {data.totals.overdueCount === 1 ? 'vencida' : 'vencidas'}
              </span>
            )}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-line-soft" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}
      <Card>{renderBody()}</Card>
    </div>
  );
}

/** «Faltan 10 €» bajo una cuota pagada en parte. */
function Missing({ charge }: { charge: Charge }) {
  return (
    <span className="text-[12px] text-ink-muted">
      Faltan {formatCents(charge.amountCents - charge.coveredCents)}
    </span>
  );
}

/** Cabecera «Estado» con menú: ordenar por urgencia y filtrar por los estados que hay. */
function StatusMenu({
  charges,
  filter,
  onFilter,
  sort,
  onSort,
}: {
  charges: Charge[];
  filter: ChargeStatus[];
  onFilter: (filter: ChargeStatus[]) => void;
  sort: StatusSort;
  onSort: (sort: StatusSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const counts = new Map<ChargeStatus, number>();
  for (const c of charges) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const present = URGENCY.filter((s) => counts.has(s));
  const active = filter.length > 0 || sort !== 'none';
  const toggle = (status: ChargeStatus) =>
    onFilter(filter.includes(status) ? filter.filter((s) => s !== status) : [...filter, status]);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`inline-flex cursor-pointer items-center gap-1 text-xs font-semibold tracking-[0.06em] uppercase hover:text-ink ${active ? 'text-ink' : 'text-ink-muted'}`}
      >
        Estado
        {filter.length > 0 && <span className="normal-case">({filter.length})</span>}
        {sort !== 'none' && <ArrowDownUp aria-hidden size={12} />}
        <ChevronDown aria-hidden size={13} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar el menú de estado"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Ordenar y filtrar por estado"
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            className="absolute right-0 z-20 mt-2 flex w-64 flex-col gap-3 rounded-sm border border-line-strong bg-surface-raised p-3 text-sm font-normal tracking-normal normal-case shadow-overlay md:right-auto md:left-0"
          >
            <div role="group" aria-label="Ordenar" className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                Ordenar
              </span>
              {(
                [
                  ['none', 'Por alumno'],
                  ['urgent', 'Lo pendiente primero'],
                  ['paid', 'Lo cobrado primero'],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="status-sort"
                    checked={sort === id}
                    onChange={() => onSort(id)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div role="group" aria-label="Filtrar" className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                Mostrar
              </span>
              {present.map((status) => (
                <label key={status} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filter.includes(status)}
                    onChange={() => toggle(status)}
                  />
                  {STATUS[status].label}
                  <span className="text-ink-muted">({counts.get(status)})</span>
                </label>
              ))}
              {filter.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFilter([])}
                  className="cursor-pointer self-start text-[13px] font-semibold text-brand"
                >
                  Ver todos
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
