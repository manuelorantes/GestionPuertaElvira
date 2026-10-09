import { useQuery } from '@tanstack/react-query';

import { fetchScheduledTasks } from './api';

/** Se refresca cada minuto mientras la sección está abierta: los estados cambian con la hora. */
export function useScheduledTasks() {
  return useQuery({
    queryKey: ['system-tasks'],
    queryFn: fetchScheduledTasks,
    refetchInterval: 60_000,
  });
}
