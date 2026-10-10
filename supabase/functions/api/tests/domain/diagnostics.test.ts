import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import {
  DiagnosisRun,
  type EntityRef,
  Finding,
  FindingHasNoFix,
  FindingNotOpen,
  Fingerprint,
  RULE_CATALOGUE,
  ruleDefinition,
} from '../../src/domain/diagnostics/mod.ts';

const student: EntityRef = { kind: 'student', id: 's1', label: 'Martina López Herrera' };
const at = new Date('2026-10-10T20:00:00Z');
const later = new Date('2026-10-11T20:00:00Z');

function finding(
  fix: Finding['fix'] = { kind: 'reprice_charge', studentId: 's1', month: '2026-10' },
) {
  return Finding.detect({
    id: 'f1',
    rule: 'fee_mismatch',
    entity: student,
    data: { month: '2026-10', amountCents: 3600, expectedCents: 4950 },
    explanation: 'La cuota de octubre es de 36 € y la tarifa de hoy es de 49,50 €.',
    proposal: 'Ajustar la cuota a 49,50 €.',
    fix,
  }, at);
}

Deno.test('Fingerprint should be the same whatever the order of the data keys', () => {
  const a = Fingerprint.of('fee_mismatch', student, { month: '2026-10', amountCents: 3600 });
  const b = Fingerprint.of('fee_mismatch', student, { amountCents: 3600, month: '2026-10' });
  assertEquals(a.value, b.value);
  assertEquals(a.value, 'fee_mismatch|student|s1|{"amountCents":3600,"month":"2026-10"}');
  assert(a.equals(b));
});

Deno.test('Fingerprint should change when the rule, the entity or the data change', () => {
  const base = Fingerprint.of('fee_mismatch', student, { amountCents: 3600 });
  assertFalse(base.equals(Fingerprint.of('charge_without_group', student, { amountCents: 3600 })));
  assertFalse(
    base.equals(Fingerprint.of('fee_mismatch', { ...student, id: 's2' }, { amountCents: 3600 })),
  );
  assertFalse(base.equals(Fingerprint.of('fee_mismatch', student, { amountCents: 4950 })));
  // La etiqueta es solo para mostrar: no forma parte de la huella.
  assert(
    base.equals(
      Fingerprint.of('fee_mismatch', { ...student, label: 'Otro' }, { amountCents: 3600 }),
    ),
  );
});

Deno.test('Finding should start open with the severity of its rule and be touched by later diagnoses', () => {
  const f = finding();
  assertEquals(f.status(), 'open');
  assertEquals(f.severity(), 'money');
  assertEquals(f.fingerprint.value.startsWith('fee_mismatch|student|s1|'), true);
  assertEquals(f.lastSeenAt(), at);
  f.touch(later);
  assertEquals(f.lastSeenAt(), later);
  assertEquals(f.detectedAt, at);
});

Deno.test('Finding should be accepted only once, only when open and only with a fix', () => {
  const f = finding();
  f.accept('Junta', later);
  assertEquals(f.status(), 'accepted');
  assertEquals(f.closedBy(), 'Junta');
  assertEquals(f.closedAt(), later);
  assertThrows(() => f.accept('Junta', later), FindingNotOpen);
  assertThrows(() => f.dismiss('Junta', later), FindingNotOpen);
  assertThrows(() => f.resolve(later), FindingNotOpen);
  assertThrows(() => f.touch(later), FindingNotOpen);
  assertThrows(() => finding(null).accept('Junta', later), FindingHasNoFix);
});

Deno.test('Finding should be dismissed or resolved by itself when it stops reproducing', () => {
  const dismissed = finding(null);
  dismissed.dismiss('Junta', later);
  assertEquals(dismissed.status(), 'dismissed');
  assertEquals(dismissed.closedBy(), 'Junta');
  const resolved = finding();
  resolved.resolve(later);
  assertEquals(resolved.status(), 'resolved');
  assertEquals(resolved.closedBy(), null);
  assertEquals(resolved.closedAt(), later);
});

Deno.test('Finding should restore from storage keeping its state', () => {
  const f = Finding.restore({
    id: 'f2',
    rule: 'name_format',
    entity: student,
    fingerprint: 'name_format|student|s1|{"fullName":"martina lópez"}',
    explanation: 'x',
    proposal: 'y',
    fix: { kind: 'rename_student', studentId: 's1', fullName: 'Martina López' },
    status: 'dismissed',
    detectedAt: at,
    lastSeenAt: at,
    closedAt: later,
    closedBy: 'Junta',
  });
  assertEquals(f.status(), 'dismissed');
  assertEquals(f.severity(), 'form');
  assertEquals(f.fix?.kind, 'rename_student');
});

Deno.test('rule catalogue should have every rule once, in screen order, with its severity', () => {
  const codes = RULE_CATALOGUE.map((r) => r.code);
  assertEquals(new Set(codes).size, codes.length);
  assertEquals(codes.length, 21);
  assertEquals(ruleDefinition('fee_mismatch').severity, 'money');
  assertEquals(ruleDefinition('fee_mismatch').hasFix, true);
  assertEquals(ruleDefinition('charge_without_group').hasFix, false);
  assertEquals(ruleDefinition('receipt_order').severity, 'form');
  assertEquals(ruleDefinition('points_mismatch').severity, 'club');
  const severities = RULE_CATALOGUE.map((r) => r.severity);
  // Dinero primero, datos del club después y forma al final.
  assertEquals(severities, [...severities].sort((a, b) => rank(a) - rank(b)));
});

Deno.test('DiagnosisRun should record who launched it and its counters', () => {
  const run = DiagnosisRun.completed({
    id: 'r1',
    startedAt: at,
    finishedAt: later,
    launchedBy: 'Tarea nocturna',
    openCount: 5,
    newCount: 2,
    resolvedCount: 1,
  });
  assertEquals(run.launchedBy, 'Tarea nocturna');
  assertEquals(run.openCount, 5);
  assertThrows(() =>
    DiagnosisRun.completed({
      id: 'r2',
      startedAt: later,
      finishedAt: at,
      launchedBy: 'Junta',
      openCount: 0,
      newCount: 0,
      resolvedCount: 0,
    })
  );
});

function rank(severity: string): number {
  return ['money', 'club', 'form'].indexOf(severity);
}
