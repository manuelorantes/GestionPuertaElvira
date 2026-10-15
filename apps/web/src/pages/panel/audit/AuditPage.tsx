import { History } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import type { AuditPeriod } from '@/features/audit/api';
import { emptyMessage, periodFrom, periodId, TABS, tabFrom } from '@/features/audit/sections';
import { useSession } from '@/features/auth/useSession';
import { Card } from '@/shared/ui/Card';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Select } from '@/shared/ui/Select';
import { Tabs } from '@/shared/ui/Tabs';

import { ActionsHistory } from './ActionsHistory';
import { PaymentsHistory } from './PaymentsHistory';
import { PeriodFilter } from './PeriodFilter';

export function AuditPage() {
  const { data: user } = useSession();
  if (user && user.role !== 'superadministrator') return <Navigate to="/panel" replace />;

  return <AuditSections />;
}

/** General (todo, filtrable por persona) y las secciones por periodo: ?seccion=, ?periodo= y ?persona=. */
function AuditSections() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFrom(searchParams.get('seccion'));
  const period = periodFrom(searchParams.get('periodo'));
  const userId = searchParams.get('persona') ?? '';
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  function changeTab(id: string) {
    const next = new URLSearchParams();
    if (id !== 'general') {
      next.set('seccion', id);
      if (searchParams.has('periodo')) next.set('periodo', searchParams.get('periodo') ?? '');
    }
    setSearchParams(next);
  }

  function renderFilter() {
    if (tab.section === null)
      return (
        <div className="sm:w-72">
          <Select
            label="Persona"
            value={userId}
            onChange={(id) => setParam('persona', id)}
            options={[
              { value: '', label: 'Todas' },
              ...people.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      );
    return (
      <PeriodFilter
        value={period}
        onChange={(p: AuditPeriod) => setParam('periodo', periodId(p))}
      />
    );
  }

  function renderSection() {
    if (tab.section === null)
      return (
        <ActionsHistory
          query={{ userId }}
          emptyMessage="Todavía no hay acciones registradas."
          onPeople={setPeople}
        />
      );
    if (tab.section === 'payments') return <PaymentsHistory period={period} />;
    return (
      <ActionsHistory
        query={{ section: tab.section, period }}
        emptyMessage={emptyMessage(tab.section, period)}
      />
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader eyebrow="Quién ha hecho qué, y vuelta atrás" title="Historial" />
      <Tabs label="Secciones del historial" tabs={TABS} value={tab.id} onChange={changeTab}>
        <Card>
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
            {renderFilter()}
            <p className="flex flex-1 items-center gap-2 text-[13px] text-ink-muted">
              <History aria-hidden size={16} />
              {tab.section === 'payments'
                ? 'Cada cobro tal como se registró; los deshechos restan de la suma.'
                : 'Cada acción guarda cómo estaban los datos antes y después. Deshacer y volver atrás también quedan registrados.'}
            </p>
          </div>
          {renderSection()}
        </Card>
      </Tabs>
    </main>
  );
}
