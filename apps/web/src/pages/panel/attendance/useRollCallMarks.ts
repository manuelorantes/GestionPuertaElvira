import { useState } from 'react';

import type { RollCall, RosterStudent } from '@/features/teacher-space/api';

/** Quién falta y quién vino de fuera, tal y como se van marcando. */
export interface RollCallMarks {
  absent: ReadonlySet<string>;
  guests: RosterStudent[];
  /** Cuántos de la lista han venido. */
  present: number;
  toggle: (id: string) => void;
  addGuest: (student: RosterStudent) => void;
  removeGuest: (id: string) => void;
  /** Lo que se guarda: ausentes y asistencia especial. */
  changes: () => { absent: string[]; guests: string[] };
}

export function useRollCallMarks(data: RollCall): RollCallMarks {
  const [absent, setAbsent] = useState<ReadonlySet<string>>(
    () => new Set(data.list.filter((s) => !s.present).map((s) => s.id)),
  );
  const [guests, setGuests] = useState<RosterStudent[]>(data.guests);
  return {
    absent,
    guests,
    present: data.list.length - absent.size,
    toggle: (id) =>
      setAbsent((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    addGuest: (student) => setGuests((current) => [...current, student]),
    removeGuest: (id) => setGuests((current) => current.filter((g) => g.id !== id)),
    changes: () => ({ absent: [...absent], guests: guests.map((g) => g.id) }),
  };
}
