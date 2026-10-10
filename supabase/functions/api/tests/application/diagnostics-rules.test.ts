import { assertEquals } from '@std/assert';

import { RULE_CATALOGUE, type RuleCode } from '../../src/domain/diagnostics/mod.ts';
import { evaluateAll, ruleFor, RULES } from '../../src/application/diagnostics/rules/mod.ts';
import { charge, factsWith, payment, student } from '../support/diagnostics.ts';

Deno.test('every rule of the catalogue should have its function and produce candidates of its own code', () => {
  assertEquals(RULES.length, RULE_CATALOGUE.length);
  const codes = new Set<RuleCode>();
  for (const definition of RULE_CATALOGUE) {
    const rule = ruleFor(definition.code);
    assertEquals(typeof rule, 'function');
    assertEquals(codes.has(definition.code), false);
    codes.add(definition.code);
  }
});

Deno.test('rules should produce candidates whose code matches the rule and whose fix matches the catalogue', () => {
  const facts = factsWith({
    students: [student({ id: 's', fullName: 'ana gil gil', tierCents: 4500, feeCents: 4500 })],
    charges: [charge({ studentId: 's', amountCents: 4000, coveredCents: 4000, status: 'paid' })],
    payments: [payment({ id: 'p', studentId: 's', sequence: 1, totalCents: 4000 })],
    ledger: [{
      source: 'payment',
      sourceId: 'p',
      date: '2026-10-03',
      kind: 'income',
      amountCents: 4000,
    }],
  });
  const candidates = evaluateAll(facts);
  assertEquals(candidates.map((c) => c.rule).sort(), ['fee_mismatch', 'name_format']);
  for (const candidate of candidates) {
    const definition = RULE_CATALOGUE.find((r) => r.code === candidate.rule);
    assertEquals(candidate.fix !== null, definition?.hasFix, candidate.rule);
    assertEquals(ruleFor(candidate.rule)(facts).some((c) => c.rule === candidate.rule), true);
  }
});

Deno.test('empty facts should produce no candidates', () => {
  assertEquals(evaluateAll(factsWith()), []);
});
