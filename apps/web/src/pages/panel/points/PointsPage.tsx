import { useSearchParams } from 'react-router';

import { currentMonth } from '@/features/billing/money';
import { SeasonMonths } from '@/features/billing/SeasonMonths';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Tabs } from '@/shared/ui/Tabs';

import { FridaysTab } from './FridaysTab';
import { MovementsTab } from './MovementsTab';
import { RedemptionsTab } from './RedemptionsTab';
import { StudentsTab } from './StudentsTab';
import { TournamentsTab } from './TournamentsTab';

const TABS = [
  { id: 'alumnos', label: 'Alumnos' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'torneos', label: 'Torneos' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'canjes', label: 'Canjes' },
];

/**
 * Puntos: se ganan viniendo los viernes y mandando la foto con la equipación oficial en los torneos, se ajustan a mano
 * con un motivo y se canjean al cobrar. Valen solo en el mes en que se ganan.
 */
export function PointsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('pestana'))
    ? (params.get('pestana') as string)
    : 'alumnos';
  const month = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '')
    ? (params.get('mes') as string)
    : currentMonth();
  const focus = params.get('alumno');

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <SectionHeader eyebrow="Viernes, torneos y canjes" title="Puntos" />
      <SeasonMonths
        month={month}
        selected={month}
        label="Mes de los puntos"
        onChange={(m) => update({ mes: m })}
      />
      <Tabs
        label="Puntos"
        tabs={TABS}
        value={tab}
        onChange={(id) => update({ pestana: id, alumno: null })}
      >
        {tab === 'alumnos' && (
          <StudentsTab month={month} focus={focus} onFocus={(id) => update({ alumno: id })} />
        )}
        {tab === 'viernes' && <FridaysTab month={month} />}
        {tab === 'torneos' && <TournamentsTab month={month} />}
        {tab === 'movimientos' && <MovementsTab month={month} />}
        {tab === 'canjes' && <RedemptionsTab month={month} />}
      </Tabs>
    </main>
  );
}
