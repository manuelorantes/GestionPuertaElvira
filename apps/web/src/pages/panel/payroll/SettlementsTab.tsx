import { ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { Fragment, useState } from 'react';

import { formatCents, monthLabel } from '@/features/billing/money';
import { payAllSettlements, paySettlement, type Settlement } from '@/features/payroll/api';
import { usePayrollMutation, useSettlements } from '@/features/payroll/hooks';
import { hoursLabel } from '@/features/payroll/hours';
import { formatDate } from '@/features/students/format';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';

import { SettlementSheetDialog } from './SettlementSheetDialog';

export function SettlementsTab({ month }: { month: string }) {
  const settlements = useSettlements(month);
  const [open, setOpen] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const pay = usePayrollMutation((s: Settlement) => paySettlement(s.teacherId, month));
  const payAll = usePayrollMutation(() => payAllSettlements(month));
  const toast = useToast();
  const items = settlements.data ?? [];
  const pending = items.filter((s) => s.status === 'pending');

  if (settlements.isPending) return <p className="text-ink-muted">Cargando liquidaciones…</p>;
  if (settlements.isError) return <Alert>{apiErrorMessage(settlements.error)}</Alert>;
  if (items.length === 0) return <p className="text-ink-muted">No hay liquidaciones este mes.</p>;

  return (
    <div className="flex flex-col gap-6">
      {pay.isError && <Alert>{apiErrorMessage(pay.error)}</Alert>}
      <Card className="flex flex-wrap items-center gap-6 px-6 py-5">
        <div className="flex-[1_1_280px]">
          <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
            Liquidación de {monthLabel(month).toLowerCase()}
          </h2>
          <p className="text-sm text-ink-muted">
            Se paga a mes vencido, según las horas registradas de cada profesor.
          </p>
        </div>
        <div>
          <p className="text-[13px] text-ink-muted">Total del mes</p>
          <p className="font-display text-[28px] font-bold">
            {formatCents(items.reduce((sum, s) => sum + s.amountCents, 0))}
          </p>
        </div>
        <div>
          <p className="text-[13px] text-ink-muted">Pendiente · {pending.length}</p>
          <p className="font-display text-[28px] font-bold text-warning-fg">
            {formatCents(pending.reduce((sum, s) => sum + s.amountCents, 0))}
          </p>
        </div>
        {pending.length > 0 && (
          <Button onClick={() => setConfirmAll(true)}>Marcar todas como pagadas</Button>
        )}
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">Liquidación de {monthLabel(month).toLowerCase()}</caption>
          <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="w-12">
                <span className="sr-only">Detalle</span>
              </th>
              {['Profesor', 'Horas', 'Tarifa', 'Importe', 'Estado'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <Fragment key={s.teacherId}>
                <tr className="border-b border-line-soft">
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      aria-label={`Ver detalle de ${s.teacherName}`}
                      aria-expanded={open === s.teacherId}
                      onClick={() => setOpen(open === s.teacherId ? null : s.teacherId)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      {open === s.teacherId ? (
                        <ChevronDown aria-hidden size={18} />
                      ) : (
                        <ChevronRight aria-hidden size={18} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium">{s.teacherName}</td>
                  <td className="px-4 py-3">{hoursLabel(s.minutes)}</td>
                  <td className="px-4 py-3">{formatCents(s.rateCents)}/h</td>
                  <td className="px-4 py-3 font-semibold">{formatCents(s.amountCents)}</td>
                  <td className="px-4 py-3">
                    {s.status === 'paid' ? (
                      <Badge tone="success">Pagada el {formatDate(s.paidOn)}</Badge>
                    ) : (
                      <Badge tone="warning">Pendiente</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label="Imprimir liquidación"
                        title="Imprimir liquidación"
                        onClick={() => setPrinting(s.teacherId)}
                        className="flex size-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted"
                      >
                        <Printer aria-hidden size={16} />
                      </button>
                      {s.status === 'pending' && (
                        <button
                          type="button"
                          disabled={pay.isPending}
                          onClick={() =>
                            void pay.mutateAsync(s).then(
                              () => toast(`Liquidación de ${s.teacherName} pagada`),
                              () => undefined,
                            )
                          }
                          className="inline-flex h-9 cursor-pointer items-center rounded-sm bg-brand px-3 text-[13px] font-semibold text-surface-raised hover:bg-brand-strong"
                        >
                          Marcar como pagada
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {open === s.teacherId && (
                  <tr className="border-b border-line-soft">
                    <td />
                    <td colSpan={6} className="px-4 pb-4">
                      <ul className="max-w-lg">
                        {s.lines.map((line) => (
                          <li
                            key={line.label}
                            className="flex justify-between gap-3 border-t border-dashed border-line py-2 text-[13px]"
                          >
                            <span>
                              {line.label} · {hoursLabel(line.minutes)}
                            </span>
                            <span>{formatCents(line.amountCents)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
      {printing && (
        <SettlementSheetDialog
          teacherId={printing}
          month={month}
          onClose={() => setPrinting(null)}
        />
      )}
      {confirmAll && (
        <ConfirmDialog
          title="Marcar todas como pagadas"
          message={`Se marcarán como pagadas ${pending.length} liquidaciones de ${monthLabel(month).toLowerCase()} con fecha de hoy.`}
          confirmLabel="Marcar como pagadas"
          busy={payAll.isPending}
          error={payAll.isError ? apiErrorMessage(payAll.error) : null}
          onCancel={() => {
            payAll.reset();
            setConfirmAll(false);
          }}
          onConfirm={() =>
            void payAll.mutateAsync(undefined).then(
              (paid) => {
                toast(`${paid} liquidaciones pagadas`);
                setConfirmAll(false);
              },
              () => undefined,
            )
          }
        />
      )}
    </div>
  );
}
