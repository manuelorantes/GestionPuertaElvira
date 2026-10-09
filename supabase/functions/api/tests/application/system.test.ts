import { assertEquals } from '@std/assert';

import type { TaskRun } from '../../src/domain/system/mod.ts';
import { SCHEDULED_TASKS, ScheduledTasksStatus } from '../../src/application/system/mod.ts';
import { FrozenClock } from '../support/identity.ts';

Deno.test('ScheduledTasksStatus should show the last slots of each task and the next one', async () => {
  const runs: Record<string, TaskRun[]> = {
    'horas-automaticas': [
      // Lanzada a mano antes de su hora (no cuenta para ningún turno) y la programada con casi 4 horas de retraso.
      {
        startedAt: new Date('2026-10-08T21:01:47Z'),
        finishedAt: null,
        outcome: 'success',
        manual: true,
        url: null,
      },
      {
        startedAt: new Date('2026-10-09T01:20:54Z'),
        finishedAt: new Date('2026-10-09T01:21:40Z'),
        outcome: 'success',
        manual: false,
        url: 'https://github.com/x/actions/runs/1',
      },
    ],
  };
  const status = await new ScheduledTasksStatus(
    { runsSince: (task) => Promise.resolve(runs[task] ?? []) },
    new FrozenClock('2026-10-09T07:44:00+02:00'),
  ).execute();

  const hours = status.find((t) => t.id === 'horas-automaticas');
  assertEquals(hours?.next, '2026-10-09T21:30:00.000Z');
  // Solo el turno del 8: antes no existía la tarea.
  assertEquals(hours?.slots.map((s) => [s.slot, s.status, s.delayMinutes]), [
    ['2026-10-08T21:30:00.000Z', 'done', 231],
  ]);
  assertEquals(hours?.lastRun?.startedAt, '2026-10-09T01:20:54.000Z');
  const backup = status.find((t) => t.id === 'copia-seguridad');
  // A las 05:44 UTC la de las 04:23 aún puede llegar.
  assertEquals(backup?.slots[0]?.status, 'pending');
  // Mantener activo: el turno del 7 (con 7 horas de retraso) y el del 4… que es de antes de existir.
  const ping = status.find((t) => t.id === 'keep-alive');
  assertEquals(ping?.slots.map((s) => s.slot), ['2026-10-07T06:17:00.000Z']);
  assertEquals(ping?.next, '2026-10-10T06:17:00.000Z');
});

Deno.test('the scheduled tasks should match the schedule of their workflows', async () => {
  for (const task of SCHEDULED_TASKS) {
    const workflow = await Deno.readTextFile(
      new URL(`../../../../../.github/workflows/${task.id}.yml`, import.meta.url),
    );
    assertEquals(/cron: '([^']+)'/.exec(workflow)?.[1], task.cron, task.id);
    assertEquals(
      workflow.includes(`app:system:task-run`) || workflow.includes('system_task_run'),
      true,
      `${task.id} apunta sus ejecuciones`,
    );
  }
});
