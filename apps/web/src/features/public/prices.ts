import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api/client';

export interface PublicPrices {
  season: string;
  tiers: { weeklyHours: number; monthlyCents: number }[];
  membershipCents: number;
  familyPercent: number;
  prepaymentPercent: { threeMonths: number; sixMonths: number; season: number };
  privateHourCents: number;
}

/** Precios de la temporada publicados por el club (sin sesión). */
export function usePublicPrices() {
  return useQuery({
    queryKey: ['public-prices'],
    queryFn: () => apiGet<PublicPrices>('/api/public/prices'),
  });
}
