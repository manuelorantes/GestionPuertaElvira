import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api/client';

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  database: 'reachable' | 'unreachable';
}

export type ApiHealth = 'checking' | 'connected' | 'unavailable';

export function useApiHealth(): ApiHealth {
  const { isPending, isSuccess, data } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/api/health'),
  });

  if (isPending) return 'checking';

  return isSuccess && data.status === 'healthy' ? 'connected' : 'unavailable';
}
