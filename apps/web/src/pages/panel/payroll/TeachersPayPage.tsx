import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { currentMonth, monthLabel, shiftMonth } from '@/features/billing/money';
import { useTeachers } from '@/features/classes/hooks';
import { MonthNav } from '@/shared/ui/MonthNav';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Tabs } from '@/shared/ui/Tabs';

import { ProfitabilityTab } from './ProfitabilityTab';
import { SessionDialog } from './SessionDialog';
import { SessionsTab } from './SessionsTab';
import { SettlementsTab } from './SettlementsTab';
import { DutiesTab } from './DutiesTab';
import { SubstitutionsTab } from './SubstitutionsTab';
import { TeachersPanel } from '../classes/TeachersPanel';

const TABS = [
  { id: 'rentabilidad', label: 'Rentabilidad' },
  { id: 'horas', label: 'Registro de horas' },
  { id: 'liquidacion', label: 'Liquidación mensual' },
  { id: 'sustituciones', label: 'Sustituciones y festivos' },
  { id: 'encargado', label: 'Encargado del club' },
  { id: 'equipo', label: 'Equipo' },
];

/** Pestañas que no dependen del mes. */
const WITHOUT_MONTH = ['encargado', 'equipo'];

export function TeachersPayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === searchParams.get('pestana'))
    ? (searchParams.get('pestana') as string)
    : 'rentabilidad';
  const requested = searchParams.get('mes') ?? '';
  // La liquidación se paga a mes vencido: por defecto, el mes anterior.
  const month = /^\d{4}-\d{2}$/.test(requested)
    ? requested
    : tab === 'liquidacion'
      ? shiftMonth(currentMonth(), -1)
      : currentMonth();
  const teachers = useTeachers();
  const active = (teachers.data ?? []).filter((t) => t.active);
  const [recording, setRecording] = useState(false);

  function setParams(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setSearchParams(next, { replace: true });
  }

  function renderTab() {
    if (tab === 'horas')
      return (
        <SessionsTab
          month={month}
          teachers={active}
          teacherId={searchParams.get('profesor') ?? ''}
          onTeacherChange={(id) => setParams({ profesor: id })}
        />
      );
    if (tab === 'liquidacion') return <SettlementsTab month={month} />;
    if (tab === 'sustituciones')
      return <SubstitutionsTab month={month} teachers={teachers.data ?? []} />;
    if (tab === 'encargado') return <DutiesTab teachers={teachers.data ?? []} />;
    if (tab === 'equipo') return <TeachersPanel teachers={teachers.data ?? []} />;
    return <ProfitabilityTab month={month} />;
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader
        eyebrow={`${active.length} profesores · pago por hora`}
        title="Profesores"
        action={{
          label: 'Registrar horas',
          icon: <Plus aria-hidden size={18} />,
          onClick: () => setRecording(true),
        }}
      />
      <div className={`mb-6 ${WITHOUT_MONTH.includes(tab) ? 'hidden' : ''}`}>
        <MonthNav
          label={monthLabel(month)}
          onPrevious={() => setParams({ mes: shiftMonth(month, -1) })}
          onNext={() => setParams({ mes: shiftMonth(month, 1) })}
        />
      </div>
      <Tabs
        label="Vistas de profesorado"
        tabs={TABS}
        value={tab}
        onChange={(id) => setParams({ pestana: id })}
      >
        {renderTab()}
      </Tabs>
      {recording && (
        <SessionDialog session={null} teachers={active} onClose={() => setRecording(false)} />
      )}
    </main>
  );
}
