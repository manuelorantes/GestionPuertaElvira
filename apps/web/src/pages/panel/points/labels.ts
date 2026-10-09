import type { PointsKind } from '@/features/points/api';

export const KIND_LABEL: Record<PointsKind, string> = {
  friday: 'Viernes',
  tournament: 'Torneo',
  manual: 'Ajuste',
  redemption: 'Canje',
};

/** «+2», «−5». */
export function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}
