import { assertEquals, assertStringIncludes } from '@std/assert';

import { payrollRules } from '../../src/application/diagnostics/rules/payroll.ts';
import { integrityRules } from '../../src/application/diagnostics/rules/integrity.ts';
import { charge, factsWith, payment, student, teacherMonth } from '../support/diagnostics.ts';

const rules = [...payrollRules, ...integrityRules];
const ofRule = (facts: ReturnType<typeof factsWith>, rule: string) =>
  rules.flatMap((r) => r(facts)).filter((c) => c.rule === rule);

Deno.test('income_without_hours should flag a past month with attributed income and neither sessions nor settlement', () => {
  const facts = factsWith({
    teacherMonths: [
      teacherMonth({
        teacherId: 'manuel',
        teacherName: 'Manuel Orantes Martín',
        month: '2026-09',
        incomeCents: 12250,
      }),
      teacherMonth({ teacherId: 'manuel', month: '2026-10', incomeCents: 19700 }),
      teacherMonth({
        teacherId: 'lucia',
        month: '2026-09',
        incomeCents: 5000,
        sessionMinutes: 600,
        sessionCostCents: 15000,
      }),
      teacherMonth({ teacherId: 'nadie', month: '2026-09', incomeCents: 0 }),
    ],
  });
  const found = ofRule(facts, 'income_without_hours');
  assertEquals(found.map((c) => [c.entity, c.data]), [[
    { kind: 'teacher', id: 'manuel', label: 'Manuel Orantes Martín' },
    { month: '2026-09', incomeCents: 12250 },
  ]]);
  assertStringIncludes(found[0]?.explanation ?? '', '122,50 €');
});

Deno.test('settlement_sessions_mismatch should compare the sessions of a paid month with its settlement', () => {
  const facts = factsWith({
    teacherMonths: [
      teacherMonth({
        teacherId: 'ok',
        month: '2026-09',
        sessionMinutes: 900,
        sessionCostCents: 22500,
        settlement: { minutes: 900, amountCents: 22500, paid: true },
      }),
      teacherMonth({
        teacherId: 'mal',
        teacherName: 'Jorge Rivas Pérez',
        month: '2026-09',
        sessionMinutes: 1800,
        sessionCostCents: 49500,
        settlement: { minutes: 1980, amountCents: 54450, paid: true },
      }),
      teacherMonth({
        teacherId: 'pendiente',
        month: '2026-10',
        sessionMinutes: 100,
        sessionCostCents: 2500,
        settlement: { minutes: 200, amountCents: 5000, paid: false },
      }),
    ],
  });
  const found = ofRule(facts, 'settlement_sessions_mismatch');
  assertEquals(found.map((c) => c.data), [{
    month: '2026-09',
    sessionMinutes: 1800,
    settlementMinutes: 1980,
    sessionCostCents: 49500,
    settlementCents: 54450,
  }]);
  assertEquals(found[0]?.entity.id, 'mal');
});

Deno.test("ledger_payments_mismatch should compare each month's receipts with the payment lines of the ledger", () => {
  const s = student({ id: 's' });
  const facts = factsWith({
    students: [s],
    payments: [
      payment({ id: 'p1', studentId: 's', sequence: 1, paidOn: '2026-09-03', totalCents: 4500 }),
      payment({ id: 'p2', studentId: 's', sequence: 2, paidOn: '2026-10-03', totalCents: 4500 }),
      payment({ id: 'p3', studentId: 's', sequence: 3, paidOn: '2026-10-05', totalCents: 5000 }),
    ],
    ledger: [
      { source: 'payment', sourceId: 'p1', date: '2026-09-03', kind: 'income', amountCents: 4500 },
      { source: 'payment', sourceId: 'p2', date: '2026-10-03', kind: 'income', amountCents: 4000 },
      { source: 'manual', sourceId: 'm1', date: '2026-10-01', kind: 'expense', amountCents: 51000 },
    ],
  });
  const found = ofRule(facts, 'ledger_payments_mismatch');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.entity, {
    kind: 'club',
    id: 'ledger-2026-10',
    label: 'Libro de octubre 2026',
  });
  assertEquals(found[0]?.data, {
    month: '2026-10',
    paymentsCents: 9500,
    ledgerCents: 4000,
    missing: 'R-2026-0003',
  });
});

Deno.test('covered_payments_mismatch should compare what the charges cover with the receipts total', () => {
  const good = factsWith({
    charges: [
      charge({ studentId: 's', amountCents: 4500, coveredCents: 4500, status: 'paid' }),
      charge({ studentId: 's', period: '2026-11', amountCents: 4500, status: 'expected' }),
    ],
    payments: [payment({ studentId: 's', totalCents: 4500 })],
  });
  assertEquals(ofRule(good, 'covered_payments_mismatch'), []);
  const bad = factsWith({
    charges: [charge({ studentId: 's', amountCents: 4500, coveredCents: 4000, status: 'partial' })],
    payments: [payment({ studentId: 's', totalCents: 4500 })],
  });
  const found = ofRule(bad, 'covered_payments_mismatch');
  assertEquals(found[0]?.data, { coveredCents: 4000, paymentsCents: 4500 });
  assertEquals(found[0]?.entity.kind, 'club');
});

Deno.test('receipt_gaps should flag missing and repeated receipt numbers of a season', () => {
  const facts = factsWith({
    payments: [
      payment({ studentId: 's', sequence: 1 }),
      payment({ studentId: 's', sequence: 2 }),
      payment({ studentId: 's', sequence: 2 }),
      payment({ studentId: 's', sequence: 5 }),
    ],
  });
  const found = ofRule(facts, 'receipt_gaps');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.entity, {
    kind: 'club',
    id: 'receipts-2026',
    label: 'Recibos de la temporada 2026/27',
  });
  assertEquals(found[0]?.data, { missing: 'R-2026-0003, R-2026-0004', duplicated: 'R-2026-0002' });
});

Deno.test('receipt_order should count receipts dated before the previous one in a single finding', () => {
  const facts = factsWith({
    payments: [
      payment({ studentId: 's', sequence: 1, paidOn: '2026-09-15' }),
      payment({ studentId: 's', sequence: 2, paidOn: '2026-09-29' }),
      payment({ studentId: 's', sequence: 3, paidOn: '2026-09-03' }),
      payment({ studentId: 's', sequence: 4, paidOn: '2026-10-01' }),
    ],
  });
  const found = ofRule(facts, 'receipt_order');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.data, { count: 1, first: 'R-2026-0003' });
  assertStringIncludes(found[0]?.explanation ?? '', 'importa');
  assertEquals(ofRule(factsWith({ payments: facts.payments.slice(0, 2) }), 'receipt_order'), []);
});

Deno.test('charge_cover_inconsistent should flag covered amounts that contradict the status', () => {
  const s = student({ id: 's', fullName: 'Ana Gil Gil' });
  const facts = factsWith({
    students: [s],
    charges: [
      charge({
        studentId: 's',
        period: '2026-09',
        amountCents: 4500,
        coveredCents: 4000,
        status: 'paid',
      }),
      charge({
        studentId: 's',
        period: '2026-10',
        amountCents: 4500,
        coveredCents: 100,
        status: 'due',
      }),
      charge({
        studentId: 's',
        period: '2026-11',
        amountCents: 4500,
        coveredCents: 4600,
        status: 'partial',
      }),
      charge({
        studentId: 's',
        period: '2026-12',
        amountCents: 4500,
        coveredCents: 2000,
        status: 'partial',
      }),
      charge({
        studentId: 's',
        period: '2027-01',
        amountCents: 4500,
        coveredCents: 0,
        status: 'expected',
      }),
    ],
  });
  const found = ofRule(facts, 'charge_cover_inconsistent');
  assertEquals(found.map((c) => c.data.month), ['2026-09', '2026-10', '2026-11']);
  assertEquals(found[0]?.entity, { kind: 'student', id: 's', label: 'Ana Gil Gil' });
  assertEquals(found[0]?.data, {
    month: '2026-09',
    kind: 'monthly',
    status: 'paid',
    amountCents: 4500,
    coveredCents: 4000,
  });
});

Deno.test('points_mismatch should compare the month balance with the sum of its movements', () => {
  const facts = factsWith({
    points: [
      { studentId: 'a', studentName: 'Ana Gil', month: '2026-10', points: 2, movementsSum: 2 },
      { studentId: 'b', studentName: 'Bea Gil', month: '2026-10', points: 1, movementsSum: 2 },
    ],
  });
  const found = ofRule(facts, 'points_mismatch');
  assertEquals(found.map((c) => c.data), [{ month: '2026-10', points: 1, movementsSum: 2 }]);
  assertEquals(found[0]?.entity, { kind: 'student', id: 'b', label: 'Bea Gil' });
});
