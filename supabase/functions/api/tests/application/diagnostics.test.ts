import { assertEquals, assertRejects } from '@std/assert';

import type { Fix } from '../../src/domain/diagnostics/mod.ts';
import {
  AcceptFinding,
  DismissFinding,
  type Facts,
  FindingNotFound,
  FindingOutdated,
  type FixExecutor,
  ListFindings,
  RunDiagnosis,
} from '../../src/application/diagnostics/mod.ts';
import { RecordingLocks } from '../support/billing.ts';
import { charge, DiagnosticsFixture, factsWith, payment, student } from '../support/diagnostics.ts';

class FactsStub {
  constructor(public facts: Facts) {}
  load(): Promise<Facts> {
    return Promise.resolve(this.facts);
  }
}

class SpyExecutor implements FixExecutor {
  applied: Fix[] = [];
  apply(fix: Fix): Promise<void> {
    this.applied.push(fix);
    return Promise.resolve();
  }
}

/** Paula paga 36 € con una tarifa de 49,50 € (regla 1) y su nombre está en minúsculas (regla 9). */
function paulaFacts(): Facts {
  const paula = student({
    id: 'paula',
    fullName: 'paula gómez ruiz',
    weeklyHours: 3,
    tierCents: 5500,
    feeCents: 4950,
    familyDiscount: true,
  });
  return factsWith({
    students: [paula],
    charges: [
      charge({ studentId: 'paula', amountCents: 3600, coveredCents: 3600, status: 'paid' }),
    ],
    payments: [payment({ id: 'p', studentId: 'paula', sequence: 1, totalCents: 3600 })],
    ledger: [{
      source: 'payment',
      sourceId: 'p',
      date: '2026-10-03',
      kind: 'income',
      amountCents: 3600,
    }],
  });
}

function setUp(facts: Facts = paulaFacts()) {
  const fx = new DiagnosticsFixture();
  const source = new FactsStub(facts);
  let now = new Date('2026-10-10T20:00:00Z');
  const clock = { now: () => now };
  const locks = new RecordingLocks();
  const executor = new SpyExecutor();
  const run = new RunDiagnosis(source, fx, fx, clock, locks);
  const list = new ListFindings(fx, fx);
  const accept = new AcceptFinding(fx, source, executor, clock);
  const dismiss = new DismissFinding(fx, clock);
  const advance = (iso: string) => {
    now = new Date(iso);
  };
  return { fx, source, run, list, accept, dismiss, executor, locks, advance };
}

Deno.test('RunDiagnosis should create open findings from the rules and record the run', async () => {
  const { fx, run, list, locks } = setUp();
  const result = await run.execute('Junta');
  assertEquals(locks.keys, ['diagnostics:run']);
  assertEquals(result.launchedBy, 'Junta');
  assertEquals([result.openCount, result.newCount, result.resolvedCount], [2, 2, 0]);
  const view = await list.execute('open');
  assertEquals(view.run?.launchedBy, 'Junta');
  assertEquals(view.items.map((i) => [i.rule, i.severity, i.hasFix]), [
    ['fee_mismatch', 'money', true],
    ['name_format', 'form', true],
  ]);
  assertEquals(view.items[0]?.ruleTitle, 'Cuota distinta de la tarifa');
  assertEquals(view.items[0]?.entity, { kind: 'student', id: 'paula', label: 'paula gómez ruiz' });
  assertEquals(fx.runs.length, 1);
});

Deno.test('RunDiagnosis should not duplicate findings when nothing changed, only touch them', async () => {
  const { fx, run, advance } = setUp();
  await run.execute('Junta');
  advance('2026-10-11T21:30:00Z');
  const second = await run.execute('Tarea nocturna');
  assertEquals([second.openCount, second.newCount, second.resolvedCount], [2, 0, 0]);
  assertEquals(fx.all().length, 2);
  for (const finding of fx.all()) {
    assertEquals(finding.lastSeenAt(), new Date('2026-10-11T21:30:00Z'));
    assertEquals(finding.detectedAt, new Date('2026-10-10T20:00:00Z'));
  }
});

Deno.test('RunDiagnosis should resolve open findings that stop reproducing', async () => {
  const { fx, run, source, list } = setUp();
  await run.execute('Junta');
  source.facts = {
    ...source.facts,
    students: source.facts.students.map((s) => ({ ...s, fullName: 'Paula Gómez Ruiz' })),
  };
  const second = await run.execute('Junta');
  assertEquals([second.openCount, second.newCount, second.resolvedCount], [1, 0, 1]);
  const resolved = await list.execute('resolved');
  assertEquals(resolved.items.map((i) => i.rule), ['name_format']);
  assertEquals(resolved.items[0]?.closedBy, null);
  assertEquals(fx.all().filter((f) => f.status() === 'open').map((f) => f.rule), ['fee_mismatch']);
});

Deno.test('DismissFinding should hide the case while its data stay the same, and a changed case is new', async () => {
  const { fx, run, dismiss, list, source } = setUp();
  await run.execute('Junta');
  const fee = fx.all().find((f) => f.rule === 'fee_mismatch');
  await dismiss.execute(fee?.id ?? '', 'Junta');
  assertEquals((await list.execute('dismissed')).items.map((i) => [i.rule, i.closedBy]), [[
    'fee_mismatch',
    'Junta',
  ]]);
  const again = await run.execute('Junta');
  assertEquals([again.openCount, again.newCount], [1, 0]);
  assertEquals((await list.execute('open')).items.map((i) => i.rule), ['name_format']);
  // Cambia el importe: es otro caso y vuelve a salir aunque el anterior se descartara.
  source.facts = {
    ...source.facts,
    charges: [
      charge({ studentId: 'paula', amountCents: 3700, coveredCents: 3600, status: 'partial' }),
    ],
    payments: source.facts.payments,
  };
  const changed = await run.execute('Junta');
  assertEquals(changed.newCount, 1);
  assertEquals((await list.execute('open')).items.map((i) => i.rule), [
    'fee_mismatch',
    'name_format',
  ]);
  await assertRejects(() => dismiss.execute('nope', 'Junta'), FindingNotFound);
});

Deno.test('AcceptFinding should apply the fix and mark the finding when the case still reproduces', async () => {
  const { fx, run, accept, executor, list } = setUp();
  await run.execute('Junta');
  const fee = fx.all().find((f) => f.rule === 'fee_mismatch');
  await accept.execute(fee?.id ?? '', 'Junta');
  assertEquals(executor.applied, [{
    kind: 'reprice_charge',
    studentId: 'paula',
    month: '2026-10',
  }]);
  assertEquals((await list.execute('accepted')).items.map((i) => [i.rule, i.closedBy]), [[
    'fee_mismatch',
    'Junta',
  ]]);
  await assertRejects(() => accept.execute(fee?.id ?? '', 'Junta'));
});

Deno.test('AcceptFinding should refuse when the data changed since the diagnosis and apply nothing', async () => {
  const { fx, run, accept, executor, source } = setUp();
  await run.execute('Junta');
  const fee = fx.all().find((f) => f.rule === 'fee_mismatch');
  source.facts = {
    ...source.facts,
    charges: [
      charge({ studentId: 'paula', amountCents: 4950, coveredCents: 3600, status: 'partial' }),
    ],
  };
  await assertRejects(() => accept.execute(fee?.id ?? '', 'Junta'), FindingOutdated);
  assertEquals(executor.applied, []);
  assertEquals(fee?.status(), 'open');
});

Deno.test('ListFindings should order open findings by severity, rule and label', async () => {
  const facts = factsWith({
    students: [
      student({ id: 'z', fullName: 'zoe ruiz', tierCents: 4500, feeCents: 4500 }),
      student({ id: 'a', fullName: 'ana ruiz', tierCents: 4500, feeCents: 4500 }),
    ],
    charges: [charge({ studentId: 'z', amountCents: 4000 })],
  });
  const { run, list } = setUp(facts);
  await run.execute('Junta');
  const view = await list.execute('open');
  assertEquals(view.items.map((i) => `${i.rule}:${i.entity.label}`), [
    'fee_mismatch:zoe ruiz',
    'name_format:ana ruiz',
    'name_format:zoe ruiz',
  ]);
  assertEquals(view.items[0]?.status, 'open');
  assertEquals(typeof view.items[0]?.detectedAt, 'string');
});
