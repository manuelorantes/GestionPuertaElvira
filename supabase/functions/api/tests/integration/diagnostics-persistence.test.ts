import { assertEquals } from '@std/assert';

import { DiagnosisRun, Finding } from '../../src/domain/diagnostics/mod.ts';
import {
  SqlFindingRepository,
  SqlRunLog,
} from '../../src/infrastructure/persistence/diagnostics.ts';
import { db, resetDatabase } from '../support/http.ts';

const at = new Date('2026-10-10T20:00:00Z');

function detected(id: string, month: string) {
  return Finding.detect({
    id,
    rule: 'fee_mismatch',
    entity: { kind: 'student', id: 'f0e1d2c3-0000-7000-8000-000000000001', label: 'Martina López' },
    data: { month, amountCents: 3600, expectedCents: 4950 },
    explanation: 'La cuota no cuadra.',
    proposal: 'Ajustarla.',
    fix: { kind: 'reprice_charge', studentId: 'f0e1d2c3-0000-7000-8000-000000000001', month },
  }, at);
}

Deno.test('SqlFindingRepository should save, update and list findings by status with their fingerprint', async () => {
  await resetDatabase();
  const repository = new SqlFindingRepository(db());
  const a = detected('01a10000-0000-7000-8000-00000000000a', '2026-10');
  const b = detected('01a10000-0000-7000-8000-00000000000b', '2026-11');
  await repository.saveAll([a, b]);
  assertEquals((await repository.open()).map((f) => f.id), [a.id, b.id]);

  const stored = await repository.byId(a.id);
  assertEquals(stored?.fingerprint.value, a.fingerprint.value);
  assertEquals(stored?.fix, a.fix);
  assertEquals(stored?.entity.label, 'Martina López');
  assertEquals(stored?.detectedAt, at);

  b.dismiss('Junta', new Date('2026-10-11T08:00:00Z'));
  await repository.save(b);
  assertEquals(await repository.dismissedFingerprints(), new Set([b.fingerprint.value]));
  assertEquals((await repository.list('dismissed')).map((f) => [f.id, f.closedBy()]), [[
    b.id,
    'Junta',
  ]]);
  assertEquals((await repository.open()).map((f) => f.id), [a.id]);
  assertEquals(await repository.byId('01a10000-0000-7000-8000-00000000000f'), null);
});

Deno.test('SqlRunLog should return the most recent run', async () => {
  await resetDatabase();
  const log = new SqlRunLog(db());
  assertEquals(await log.lastRun(), null);
  const run = (id: string, started: string, by: string) =>
    DiagnosisRun.completed({
      id,
      startedAt: new Date(started),
      finishedAt: new Date(started),
      launchedBy: by,
      openCount: 3,
      newCount: 1,
      resolvedCount: 0,
    });
  await log.saveRun(run('01a10000-0000-7000-8000-000000000001', '2026-10-10T20:00:00Z', 'Junta'));
  await log.saveRun(
    run('01a10000-0000-7000-8000-000000000002', '2026-10-11T21:30:00Z', 'Tarea nocturna'),
  );
  const last = await log.lastRun();
  assertEquals(last?.launchedBy, 'Tarea nocturna');
  assertEquals(last?.openCount, 3);
});
