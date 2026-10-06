import type { ClassGroup } from '@/features/classes/api';
import { WEEKDAYS } from '@/features/classes/schedule';

/** «Lun 9 · Mié 8» cuando la ocupación cambia según el día (alumnos con horario especial). */
export function OccupancyByDay({ group }: { group: ClassGroup }) {
  const counts = WEEKDAYS.filter((d) => group.days.includes(d.id)).map((d) => ({
    short: d.short,
    count: group.occupancyByDay[d.id] ?? 0,
  }));
  if (counts.length < 2 || counts.every((c) => c.count === counts[0]?.count)) return null;
  return (
    <p className="mt-1 text-[12px] text-ink-muted">
      {counts.map((c) => `${c.short} ${c.count}`).join(' · ')}
    </p>
  );
}
