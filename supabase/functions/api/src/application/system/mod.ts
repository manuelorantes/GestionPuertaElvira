import type { Clock } from '../../domain/common/mod.ts';
import {
  type SlotStatus,
  slotStatus,
  type TaskRun,
  TaskSchedule,
} from '../../domain/system/mod.ts';

/** Una tarea programada que se vigila: su workflow (`id`, el nombre del fichero) y su horario en cron (UTC). */
export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cron: string;
  /** Desde cuándo tiene este horario: los turnos anteriores no se muestran (la tarea o el horario no existían). */
  since: string;
}

/**
 * Las tareas programadas del club (los workflows que tienen sentido vigilar: no CI, despliegue ni Dependabot). El
 * horario tiene que coincidir con el de su workflow; un test lo comprueba.
 */
export const SCHEDULED_TASKS: readonly ScheduledTask[] = [
  {
    id: 'horas-automaticas',
    name: 'Horas automáticas y cuotas',
    description:
      'Apunta las horas de las clases y turnos del día y crea las cuotas que falten del mes (el día 1, las del mes nuevo).',
    cron: '30 21 * * *',
    since: '2026-10-08T21:00:00Z',
  },
  {
    id: 'copia-seguridad',
    name: 'Copia de seguridad',
    description:
      'Guarda cifrados la base de datos y los documentos de las facturas fuera de Supabase.',
    cron: '23 4 * * *',
    since: '2026-10-08T20:00:00Z',
  },
  {
    id: 'keep-alive',
    name: 'Mantener activo',
    description: 'Consulta la API para que Supabase no pause el proyecto por inactividad.',
    cron: '17 6 */3 * *',
    since: '2026-10-05T15:00:00Z',
  },
];

/** Ejecuciones apuntadas por los propios workflows (tabla `system_task_run`). */
export interface TaskRunLog {
  runsSince(taskId: string, since: Date): Promise<TaskRun[]>;
}

export interface TaskSlotView {
  /** Hora a la que tocaba (ISO, UTC). */
  slot: string;
  status: SlotStatus;
  delayMinutes: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  url: string | null;
}

export interface TaskStatusView {
  id: string;
  name: string;
  description: string;
  cron: string;
  /** El siguiente turno programado (ISO, UTC). */
  next: string;
  /** Los últimos turnos, del más reciente al más antiguo. */
  slots: TaskSlotView[];
  /** La última ejecución, programada o lanzada a mano. */
  lastRun: {
    startedAt: string;
    outcome: 'success' | 'failure';
    manual: boolean;
    url: string | null;
  } | null;
}

/** Estado de las tareas programadas: cómo fueron sus últimos turnos y cuándo toca el siguiente. */
export class ScheduledTasksStatus {
  /** Turnos que se muestran de cada tarea. */
  static readonly SLOTS = 10;

  constructor(
    private readonly log: TaskRunLog,
    private readonly clock: Clock,
    private readonly tasks: readonly ScheduledTask[] = SCHEDULED_TASKS,
  ) {}

  async execute(): Promise<TaskStatusView[]> {
    const now = this.clock.now();
    const views: TaskStatusView[] = [];
    for (const task of this.tasks) {
      const schedule = TaskSchedule.fromCron(task.cron);
      const since = new Date(task.since);
      const slots = schedule.slotsBefore(now, ScheduledTasksStatus.SLOTS).filter((slot) =>
        slot >= since
      );
      const next = schedule.nextAfter(now);
      const oldest = slots.at(-1) ?? since;
      const runs = await this.log.runsSince(task.id, oldest < since ? oldest : since);
      // Los turnos se miden con las ejecuciones programadas: una lanzada a mano no tapa un turno que no llegó.
      const scheduled = runs.filter((r) => !r.manual);
      const last = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ??
        null;
      views.push({
        id: task.id,
        name: task.name,
        description: task.description,
        cron: task.cron,
        next: next.toISOString(),
        slots: slots.map((slot, i) => {
          const following = i === 0 ? next : (slots[i - 1] as Date);
          const view = slotStatus(slot, following, scheduled, now);
          return {
            slot: slot.toISOString(),
            status: view.status,
            delayMinutes: view.delayMinutes,
            startedAt: view.run?.startedAt.toISOString() ?? null,
            finishedAt: view.run?.finishedAt?.toISOString() ?? null,
            url: view.run?.url ?? null,
          };
        }),
        lastRun: last === null ? null : {
          startedAt: last.startedAt.toISOString(),
          outcome: last.outcome,
          manual: last.manual,
          url: last.url,
        },
      });
    }
    return views;
  }
}
