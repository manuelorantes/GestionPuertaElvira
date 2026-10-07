import { Check, MessageCircle, Printer } from 'lucide-react';

import type { Charge, ChargeStatus } from '@/features/billing/api';
import { useMonthlyCharges } from '@/features/billing/hooks';
import { formatCents, monthLabel, monthName, shiftMonth } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { MonthNav } from '@/shared/ui/MonthNav';

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

interface ChargesTabProps {
  month: string;
  onMonthChange: (month: string) => void;
  onAction: (dialog: BillingDialog) => void;
}

export function ChargesTab({ month, onMonthChange, onAction }: ChargesTabProps) {
  const charges = useMonthlyCharges(month);
  const data = charges.data;
  const items = data?.items ?? [];
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
    if (items.length === 0) {
      const summer = ['07', '08'].includes(month.slice(5));
      return (
        <p className="px-5 py-12 text-center text-ink-muted">
          {summer ? 'En julio y agosto no hay clases.' : 'No hay cuotas este mes.'}
        </p>
      );
    }
    return (
      <>
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
            <caption className="sr-only">Cuotas de {monthLabel(month).toLowerCase()}</caption>
            <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              <tr>
                {['Alumno', 'Concepto', 'Importe', 'Estado'].map((heading) => (
                  <th key={heading} scope="col" className="px-5 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
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
      <MonthNav
        label={monthLabel(month)}
        onPrevious={() => onMonthChange(shiftMonth(month, -1))}
        onNext={() => onMonthChange(shiftMonth(month, 1))}
      />
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
