import { Upload } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { fiscalYearLabel, fiscalYearOf } from '@/features/accounting/categories';
import { ledgerFilterFrom, withLedgerFilter } from '@/features/accounting/ledgerFilter';
import { currentMonth } from '@/features/billing/money';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Tabs } from '@/shared/ui/Tabs';

import { InvoiceDialog } from './InvoiceDialog';
import { InvoicesTab } from './InvoicesTab';
import { LedgerTab } from './LedgerTab';
import { YearTab } from './YearTab';

const TABS = [
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'cierre', label: 'Mes a mes y cierre' },
];

export function AccountingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === searchParams.get('pestana'))
    ? (searchParams.get('pestana') as string)
    : 'movimientos';
  const month = /^\d{4}-\d{2}$/.test(searchParams.get('mes') ?? '')
    ? (searchParams.get('mes') as string)
    : currentMonth();
  const season = Number(searchParams.get('temporada')) || fiscalYearOf(currentMonth());
  const [addingInvoice, setAddingInvoice] = useState(false);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: key !== 'pestana' });
  }

  function renderTab() {
    if (tab === 'facturas') return <InvoicesTab />;
    if (tab === 'cierre')
      return (
        <YearTab startYear={season} onChange={(year) => setParam('temporada', String(year))} />
      );
    return (
      <LedgerTab
        month={month}
        onMonthChange={(m) => setParam('mes', m)}
        filter={ledgerFilterFrom(searchParams)}
        onFilterChange={(filter) =>
          setSearchParams(withLedgerFilter(searchParams, filter), { replace: true })
        }
      />
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
      <Tabs
        label="Vistas de contabilidad"
        tabs={TABS}
        value={tab}
        onChange={(id) => setParam('pestana', id)}
      >
        {renderTab()}
      </Tabs>
      {addingInvoice && <InvoiceDialog onClose={() => setAddingInvoice(false)} />}
    </main>
  );
}
