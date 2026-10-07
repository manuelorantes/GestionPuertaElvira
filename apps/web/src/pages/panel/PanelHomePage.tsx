import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useSession } from '@/features/auth/useSession';
import { fiscalYearLabel, fiscalYearOf } from '@/features/accounting/categories';
import { formatCents, monthLabel, monthName } from '@/features/billing/money';
import { fetchDashboard, type Dashboard } from '@/features/dashboard/api';
import { formatDate } from '@/features/students/format';
import { BillingDialogs, type BillingDialog } from '@/pages/panel/billing/BillingPage';
import { Avatar } from '@/shared/ui/Avatar';
import { Card } from '@/shared/ui/Card';

import { MonthlyChart } from './MonthlyChart';

function Kpi({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden px-6 py-5">
      {accent && (
        <span
          aria-hidden
          className="absolute top-0 right-0 size-11 bg-brand [clip-path:polygon(0_0,100%_0,100%_100%)]"
        />
      )}
      <p className="relative text-[13px] font-medium text-ink-muted">{label}</p>
      <p className="relative mt-1 font-display text-[40px] leading-tight font-bold">{value}</p>
      <p className="relative text-[13px] text-ink-muted">{hint}</p>
    </Card>
  );
}

function Title({ children }: { children: string }) {
  return (
    <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">{children}</h2>
  );
}

function Summary({ data }: { data: Dashboard }) {
  const [dialog, setDialog] = useState<BillingDialog>(null);
  const month = monthName(data.month);

  return (
    <>
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Kpi
          accent
          label={`Cobrado en ${month}`}
          value={formatCents(data.collectedCents)}
          hint={`de ${formatCents(data.expectedCents)} previstos`}
        />
        <Kpi
          label="Pendiente de cobro"
          value={formatCents(data.pendingCents)}
          hint={`Plazo hasta el 5 de ${month}`}
        />
        <Kpi
          label={`Gastos de ${month}`}
          value={formatCents(data.expensesCents)}
          hint="Profesores, facturas y otros gastos"
        />
        <Kpi
          label="Alumnos activos"
          value={String(data.activeStudents)}
          hint={`de ${data.registeredStudents} registrados`}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
            <Title>{`Mes a mes · temporada ${seasonLabel(data.chart[0]?.month ?? data.month)}`}</Title>
            <div className="flex gap-4 text-[13px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-[3px] bg-brand" />
                Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-[3px] bg-ink-strong" />
                Gastos
              </span>
              <span className="text-ink-muted">{monthLabel(data.month)} en curso</span>
            </div>
          </div>
          <MonthlyChart months={data.chart} current={data.month} />
        </Card>
        <Card className="flex flex-col gap-4 p-6">
          <Title>Ocupación de clases</Title>
          <div className="flex items-baseline gap-3">
            <p className="font-display text-[56px] leading-none font-bold text-brand">
              {data.occupancy.percent} %
            </p>
            <p className="text-[13px] text-ink-muted">
              <span className="block">media de los grupos</span>
              <span className="block">
                {`${data.occupancy.fullGroups} ${data.occupancy.fullGroups === 1 ? 'grupo completo' : 'grupos completos'}`}
              </span>
            </p>
          </div>
          <p className="border-t border-line-soft pt-3 text-[13px] font-semibold text-ink-soft">
            Grupos con más plazas libres
          </p>
          {data.occupancy.emptiest.map((g) => (
            <Link
              key={g.id}
              to="/panel/clases?pestana=grupos"
              className="flex flex-col gap-1.5 hover:opacity-80"
            >
              <span className="flex justify-between text-sm">
                <span>
                  <span className="font-medium">{g.name}</span>{' '}
                  <span className="text-ink-muted">· {g.teacherName}</span>
                </span>
                <span className="text-ink-muted">
                  {g.occupied}/{g.capacity}
                </span>
              </span>
              <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line-soft">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${(g.occupied / Math.max(1, g.capacity)) * 100}%` }}
                />
              </span>
            </Link>
          ))}
        </Card>
      </div>
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-6">
        <Card className="p-6">
          <section aria-label="Recibos vencidos">
            <Title>Recibos vencidos</Title>
            <p className="mt-1 mb-3 text-[13px] text-ink-muted">
              Cuotas sin cobrar fuera de plazo. Puedes avisar a la familia desde aquí.
            </p>
            {data.overdue.length === 0 && (
              <p className="border-t border-line-soft py-3 text-sm text-ink-muted">
                No hay recibos vencidos.
              </p>
            )}
            {data.overdue.map((charge) => (
              <div
                key={charge.id}
                className="flex flex-wrap items-center gap-3 border-t border-line-soft py-3"
              >
                <Avatar name={charge.studentName} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{charge.studentName}</p>
                  <p className="text-[13px] text-ink-muted">
                    Cuota de {monthName(charge.period)} · {formatCents(charge.amountCents)}
                  </p>
                </div>
                {!charge.remindedOn && (
                  <button
                    type="button"
                    onClick={() => setDialog({ type: 'whatsapp', charge })}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-brand px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft"
                  >
                    <MessageCircle aria-hidden size={16} />
                    WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDialog({ type: 'payment', studentId: charge.studentId })}
                  className="inline-flex h-9 cursor-pointer items-center rounded-sm bg-brand px-3 text-[13px] font-semibold text-surface-raised hover:bg-brand-strong"
                >
                  Cobrar
                </button>
              </div>
            ))}
          </section>
        </Card>
        <Card className="p-6">
          <section aria-label="Últimos movimientos">
            <Title>Últimos movimientos</Title>
            <div className="mt-3">
              {data.latest.length === 0 && (
                <p className="border-t border-line-soft py-3 text-sm text-ink-muted">
                  Todavía no hay movimientos.
                </p>
              )}
              {data.latest.map((line) => (
                <div
                  key={`${line.source}-${line.sourceId}`}
                  className="flex items-center gap-3 border-t border-line-soft py-2.5 text-sm"
                >
                  <span className={line.kind === 'income' ? 'text-success-fg' : 'text-danger-fg'}>
                    {line.kind === 'income' ? (
                      <ArrowDownLeft aria-label="Ingreso" size={18} />
                    ) : (
                      <ArrowUpRight aria-label="Gasto" size={18} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{line.concept}</p>
                    <p className="text-xs text-ink-muted">{formatDate(line.date)}</p>
                  </div>
                  <span
                    className={`font-semibold whitespace-nowrap ${line.kind === 'income' ? 'text-success-fg' : 'text-danger-fg'}`}
                  >
                    {line.kind === 'income' ? '+' : '−'}
                    {formatCents(line.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </Card>
      </div>
      <BillingDialogs dialog={dialog} onChange={setDialog} />
    </>
  );
}

/** «2026/27» para el mes de inicio del gráfico. */
function seasonLabel(month: string): string {
  return fiscalYearLabel(fiscalYearOf(month));
}

export function PanelHomePage() {
  const { data: user } = useSession();
  const firstName = user?.fullName.split(' ')[0] ?? '';
  const isAdmin = user?.role === 'administrator' || user?.role === 'superadministrator';
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    enabled: isAdmin,
  });

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div>
        <p className="text-sm text-ink-muted">
          {dashboard.data
            ? `${monthLabel(dashboard.data.month)} · Hola, ${firstName}`
            : `Hola, ${firstName}`}
        </p>
        <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
          Resumen del club
        </h1>
      </div>
      {isAdmin && dashboard.isPending && <p className="text-ink-muted">Cargando resumen…</p>}
      {dashboard.data && <Summary data={dashboard.data} />}
    </main>
  );
}
