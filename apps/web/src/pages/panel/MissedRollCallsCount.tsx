import { useMissedRollCalls } from '@/features/attendance/hooks';
import type { Role } from '@/features/auth/api';

const STAFF: Role[] = ['superadministrator', 'administrator', 'assistant'];

/** Contador de listas sin pasar junto a «Resumen» (solo personal del club y solo si hay alguna). */
export function MissedRollCallsCount({ role, className = '' }: { role: Role; className?: string }) {
  const missed = useMissedRollCalls(STAFF.includes(role));
  const count = missed.data?.length ?? 0;
  if (count === 0) return null;
  return (
    <span
      aria-label={`${count} ${count === 1 ? 'lista sin pasar' : 'listas sin pasar'}`}
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-warning-fg px-1.5 text-[11px] leading-5 font-bold text-surface-raised ${className}`}
    >
      {count}
    </span>
  );
}
