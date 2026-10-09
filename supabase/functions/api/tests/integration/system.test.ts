import { assertEquals } from '@std/assert';

import { ApiClient, assertError, atTime, createUser, db, resetDatabase } from '../support/http.ts';

Deno.test('superadministrators should see the scheduled tasks with their last slots and the next one', async () => {
  await atTime('2026-10-09T07:44:00+02:00', async () => {
    await resetDatabase();
    await db()`INSERT INTO system_task_run (task, started_at, finished_at, outcome, manual, url)
      VALUES ('horas-automaticas', '2026-10-09T01:20:54Z', '2026-10-09T01:21:26Z', 'success', false, 'https://example.test/1')`;
    await createUser('super@club.es', 'superadministrator');
    await createUser('junta@club.es');
    const superadmin = new ApiClient();
    await superadmin.logIn('super@club.es');

    const tasks = (await superadmin.get('/api/admin/system/tasks')).body as {
      items: {
        id: string;
        next: string;
        slots: { status: string; delayMinutes: number | null; url: string | null }[];
      }[];
    };
    assertEquals(tasks.items.map((t) => t.id), [
      'horas-automaticas',
      'copia-seguridad',
      'keep-alive',
    ]);
    const hours = tasks.items[0];
    assertEquals(hours?.next, '2026-10-09T21:30:00.000Z');
    assertEquals(
      hours?.slots[0],
      {
        slot: '2026-10-08T21:30:00.000Z',
        status: 'late',
        delayMinutes: 231,
        startedAt: '2026-10-09T01:20:54.000Z',
        finishedAt: '2026-10-09T01:21:26.000Z',
        url: 'https://example.test/1',
      } as unknown as (typeof tasks.items)[0]['slots'][0],
    );

    const admin = new ApiClient();
    await admin.logIn('junta@club.es');
    assertError(await admin.get('/api/admin/system/tasks'), 403, 'forbidden');
  });
});
