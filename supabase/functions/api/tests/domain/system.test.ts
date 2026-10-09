import { assertEquals, assertThrows } from '@std/assert';

import { InvalidValue } from '../../src/domain/common/mod.ts';
import { slotStatus, type TaskRun, TaskSchedule } from '../../src/domain/system/mod.ts';

const iso = (d: Date) => d.toISOString();

Deno.test('TaskSchedule should list the slots of a daily cron and the next one', () => {
  const daily = TaskSchedule.fromCron('30 21 * * *');
  const now = new Date('2026-10-09T10:00:00Z');
  assertEquals(iso(daily.nextAfter(now)), '2026-10-09T21:30:00.000Z');
  assertEquals(daily.slotsBefore(now, 3).map(iso), [
    '2026-10-08T21:30:00.000Z',
    '2026-10-07T21:30:00.000Z',
    '2026-10-06T21:30:00.000Z',
  ]);
});

Deno.test('TaskSchedule should support every n days of the month, like GitHub', () => {
  // */3: días 1, 4, 7… 28 y 31 de cada mes.
  const ping = TaskSchedule.fromCron('17 6 */3 * *');
  assertEquals(iso(ping.nextAfter(new Date('2026-10-08T12:00:00Z'))), '2026-10-10T06:17:00.000Z');
  assertEquals(ping.slotsBefore(new Date('2026-11-02T00:00:00Z'), 3).map(iso), [
    '2026-11-01T06:17:00.000Z',
    '2026-10-31T06:17:00.000Z',
    '2026-10-28T06:17:00.000Z',
  ]);
  assertThrows(() => TaskSchedule.fromCron('0 * * * 1'), InvalidValue);
});

const run = (startedAt: string, outcome: TaskRun['outcome'] = 'success'): TaskRun => ({
  startedAt: new Date(startedAt),
  finishedAt: new Date(startedAt),
  outcome,
  manual: false,
  url: null,
});

Deno.test('slotStatus should tell done, failed, pending and missed slots apart', () => {
  const slot = new Date('2026-10-08T21:30:00Z');
  const next = new Date('2026-10-09T21:30:00Z');
  const at = (when: string) => new Date(when);
  assertEquals(
    slotStatus(slot, next, [run('2026-10-08T21:40:00Z')], at('2026-10-09T08:00:00Z')).status,
    'done',
  );
  // Tarde pero bien: hecha (se guarda cuánto tardó en arrancar).
  const late = slotStatus(slot, next, [run('2026-10-09T01:20:00Z')], at('2026-10-09T08:00:00Z'));
  assertEquals([late.status, late.delayMinutes], ['done', 230]);
  assertEquals(
    slotStatus(slot, next, [run('2026-10-08T21:35:00Z', 'failure')], at('2026-10-09T08:00:00Z'))
      .status,
    'failed',
  );
  assertEquals(slotStatus(slot, next, [], at('2026-10-09T02:00:00Z')).status, 'pending');
  assertEquals(slotStatus(slot, next, [], at('2026-10-09T10:00:00Z')).status, 'missed');
  // Una ejecución de antes de la hora (a mano) no cuenta para ese turno; la del turno siguiente tampoco.
  assertEquals(
    slotStatus(
      slot,
      next,
      [run('2026-10-08T21:01:00Z'), run('2026-10-09T21:31:00Z')],
      at('2026-10-10T08:00:00Z'),
    )
      .status,
    'missed',
  );
});
