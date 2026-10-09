import { apiGet } from '@/shared/api/client';

/** Hecha, con retraso, falló, pendiente (aún puede llegar) o no se hizo. */
export type SlotStatus = 'done' | 'late' | 'failed' | 'pending' | 'missed';

export interface TaskSlot {
  slot: string;
  status: SlotStatus;
  delayMinutes: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  url: string | null;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cron: string;
  next: string;
  slots: TaskSlot[];
  lastRun: {
    startedAt: string;
    outcome: 'success' | 'failure';
    manual: boolean;
    url: string | null;
  } | null;
}

export async function fetchScheduledTasks(): Promise<ScheduledTask[]> {
  return (await apiGet<{ items: ScheduledTask[] }>('/api/admin/system/tasks')).items;
}
