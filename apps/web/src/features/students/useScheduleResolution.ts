import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { resolveSchedule, type ScheduleBlock } from '@/features/classes/api';

/** Traduce en vivo el horario del formulario a grupos; solo manda los tramos completos. */
export function useScheduleResolution(blocks: ScheduleBlock[]) {
  const complete = blocks.filter((b) => b.start < b.end);
  return useQuery({
    queryKey: ['schedule-resolution', complete],
    queryFn: () => resolveSchedule(complete),
    enabled: complete.length > 0,
    placeholderData: keepPreviousData,
  });
}
