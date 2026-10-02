import { useQuery } from '@tanstack/react-query';

import { SESSION_QUERY_KEY } from '@/app/queryClient';

import { fetchSession } from './api';

export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession });
}
