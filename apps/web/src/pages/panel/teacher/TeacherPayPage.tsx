import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { fiscalYearLabel } from '@/features/accounting/categories';
import { currentMonth, formatCents, monthLabel } from '@/features/billing/money';
import { hoursLabel } from '@/features/payroll/hours';
import { formatDate } from '@/features/students/format';
import type { TeacherPayMonth } from '@/features/teacher-space/api';
import { useTeacherPay } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';

function StatusBadge({ month }: { month: TeacherPayMonth }) {
  if (month.status === 'paid') {
    return <Badge tone="success">Pagada el {formatDate(month.paidOn)}</Badge>;
  }
  if (month.status === 'pending') {
    return month.month === currentMonth() ? (
      <Badge>En curso</Badge>
    ) : (
      <Badge tone="warning">Pendiente</Badge>
    );
  }
  return <Badge>Sin horas</Badge>;
}

/** Mis horas y pagos: el total de la temporada y el mes a mes (horas, importe, anticipos, a pagar y estado). */
export function TeacherPayPage() {
  const pay = useTeacherPay();
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <div>
        {pay.data && (
          <p className="text-sm text-ink-muted">Temporada {fiscalYearLabel(pay.data.season)}</p>
        )}
        <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
          Mis pagos
        </h1>
      </div>
      {pay.isPending ? (
        <p className="text-ink-muted">Cargando…</p>
      ) : pay.isError ? (
        <Alert>{apiErrorMessage(pay.error)}</Alert>
      ) : (
        <>
          <section aria-label="Temporada" className="grid grid-cols-2 gap-3">
            {[
              ['Te debemos', formatCents(pay.data.totals.owedCents)],
              ['Cobrado', formatCents(pay.data.totals.receivedCents)],
              ['Horas', hoursLabel(pay.data.totals.minutes)],
              ['Importe', formatCents(pay.data.totals.amountCents)],
            ].map(([label, value]) => (
              <Card key={label} className="px-4 py-3">
                <p className="text-[13px] text-ink-muted">{label}</p>
                <p className="font-display text-2xl font-bold">{value}</p>
              </Card>
            ))}
          </section>
          <section aria-label="Mes a mes" className="flex flex-col gap-3">
            {[...pay.data.months].reverse().map((month) => (
              <Card key={month.month} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{monthLabel(month.month)}</h2>
                  <StatusBadge month={month} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-ink-muted">Horas</dt>
                  <dd className="text-right">{hoursLabel(month.minutes)}</dd>
                  <dt className="text-ink-muted">Importe</dt>
                  <dd className="text-right">{formatCents(month.amountCents)}</dd>
                  {month.advancesCents > 0 && (
                    <>
                      <dt className="text-ink-muted">Anticipos</dt>
                      <dd className="text-right">−{formatCents(month.advancesCents)}</dd>
                    </>
                  )}
                  <dt className="font-semibold">A pagar</dt>
                  <dd className="text-right font-semibold">{formatCents(month.toPayCents)}</dd>
                </dl>
              </Card>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
