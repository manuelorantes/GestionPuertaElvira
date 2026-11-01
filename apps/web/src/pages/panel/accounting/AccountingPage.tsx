import { Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type SetURLSearchParams, useSearchParams } from 'react-router';

import { fiscalYearLabel, fiscalYearOf } from '@/features/accounting/categories';
import { useEntry } from '@/features/accounting/hooks';
import { ledgerFilterFrom, withLedgerFilter } from '@/features/accounting/ledgerFilter';
import { useSession } from '@/features/auth/useSession';
import { currentMonth } from '@/features/billing/money';
import { Alert } from '@/shared/ui/Alert';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Tabs } from '@/shared/ui/Tabs';

import { BalanceCards } from './BalanceCards';
import { DiagnosticsTab } from './DiagnosticsTab';
import { InvoiceDialog } from './InvoiceDialog';
import { InvoicesTab } from './InvoicesTab';
import { LedgerTab } from './LedgerTab';
import { MonthlyCategoriesTab } from './MonthlyCategoriesTab';
import { ReconciliationTab } from './ReconciliationTab';
import { TransfersTab } from './TransfersTab';
import { YearTab } from './YearTab';

const TABS = [
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'cierre', label: 'Mes a mes y cierre' },
  { id: 'traspasos', label: 'Traspasos' },
  { id: 'ajustes', label: 'Ajustes' },
  { id: 'diagnostico', label: 'Diagnóstico' },
];

/** Solo superadministración concilia con el banco. */
const RECONCILIATION_TAB = { id: 'conciliacion', label: 'Conciliación' };

/**
 * Un enlace a un movimiento (`?movimiento=id`) sin mes: se busca el apunte y se abre su mes con el filtro de su
 * tipo; la fila la resalta la tabla. Si ya no existe, se avisa y se queda el mes actual.
 */
function useMovementLocation(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
  active: boolean,
): { locating: boolean; missing: boolean } {
  const id = searchParams.get('movimiento');
  const locating = active && id !== null && !searchParams.has('mes');
  const entry = useEntry(locating ? id : null);
  const found = locating ? entry.data : undefined;

  useEffect(() => {
    if (!found) return;
    const next = withLedgerFilter(searchParams, { kind: found.kind, method: 'all' });
    next.set('mes', found.date.slice(0, 7));
    setSearchParams(next, { replace: true });
  }, [found, searchParams, setSearchParams]);

  return { locating: locating && !entry.isError, missing: locating && entry.isError };
}

export function AccountingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const superadmin = useSession().data?.role === 'superadministrator';
  const tabs = superadmin ? [...TABS, RECONCILIATION_TAB] : TABS;
  const tab = tabs.some((t) => t.id === searchParams.get('pestana'))
    ? (searchParams.get('pestana') as string)
    : 'movimientos';
  const month = /^\d{4}-\d{2}$/.test(searchParams.get('mes') ?? '')
    ? (searchParams.get('mes') as string)
    : currentMonth();
  const season = Number(searchParams.get('temporada')) || fiscalYearOf(currentMonth());
  const [addingInvoice, setAddingInvoice] = useState(false);
  const movement = useMovementLocation(searchParams, setSearchParams, tab === 'movimientos');

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: key !== 'pestana' });
  }

  function renderTab() {
    if (tab === 'facturas') return <InvoicesTab />;
    if (tab === 'traspasos') return <TransfersTab />;
    if (tab === 'ajustes') return <MonthlyCategoriesTab />;
    if (tab === 'diagnostico') return <DiagnosticsTab />;
    if (tab === 'conciliacion') return <ReconciliationTab />;
    if (tab === 'cierre')
      return (
        <YearTab startYear={season} onChange={(year) => setParam('temporada', String(year))} />
      );
    if (movement.locating) return <p className="text-ink-muted">Buscando el movimiento…</p>;
    return (
      <div className="flex flex-col gap-4">
        {movement.missing && <Alert tone="warning">Ese movimiento ya no existe.</Alert>}
        <LedgerTab
          month={month}
          onMonthChange={(m) => setParam('mes', m)}
          filter={ledgerFilterFrom(searchParams)}
          onFilterChange={(filter) =>
            setSearchParams(withLedgerFilter(searchParams, filter), { replace: true })
          }
        />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader
        eyebrow={`Temporada ${fiscalYearLabel(fiscalYearOf(currentMonth()))}`}
        title="Contabilidad"
        action={{
          label: 'Añadir factura',
          icon: <Upload aria-hidden size={18} />,
          onClick: () => setAddingInvoice(true),
        }}
      />
      <BalanceCards />
      <Tabs
        label="Vistas de contabilidad"
        tabs={tabs}
        value={tab}
        onChange={(id) => setParam('pestana', id)}
      >
        {renderTab()}
      </Tabs>
      {addingInvoice && <InvoiceDialog onClose={() => setAddingInvoice(false)} />}
    </main>
  );
}
