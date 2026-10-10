import { assertEquals, assertStringIncludes } from '@std/assert';

import { feeRules } from '../../src/application/diagnostics/rules/fees.ts';
import { charge, factsWith, payment, SEASON_MONTHS, student } from '../support/diagnostics.ts';

const run = (facts: ReturnType<typeof factsWith>) => feeRules.flatMap((rule) => rule(facts));
const ofRule = (facts: ReturnType<typeof factsWith>, rule: string) =>
  run(facts).filter((c) => c.rule === rule);

Deno.test('fee_mismatch should flag a current or future charge that differs from the fee of today', () => {
  const paula = student({
    id: 'paula',
    fullName: 'Paula Gómez Ruiz',
    weeklyHours: 3,
    tierCents: 5500,
    feeCents: 4950,
    familyDiscount: true,
  });
  const facts = factsWith({
    students: [paula],
    charges: [
      charge({
        studentId: 'paula',
        period: '2026-09',
        amountCents: 3600,
        coveredCents: 3600,
        status: 'paid',
      }),
      charge({
        studentId: 'paula',
        period: '2026-10',
        amountCents: 3600,
        coveredCents: 3600,
        status: 'paid',
      }),
      charge({ studentId: 'paula', period: '2026-11', amountCents: 4950, status: 'expected' }),
    ],
  });
  const found = ofRule(facts, 'fee_mismatch');
  assertEquals(found.length, 1, 'septiembre ya pasó y noviembre cuadra');
  const [octubre] = found;
  assertEquals(octubre?.entity, { kind: 'student', id: 'paula', label: 'Paula Gómez Ruiz' });
  assertEquals(octubre?.data, { month: '2026-10', amountCents: 3600, expectedCents: 4950 });
  assertStringIncludes(octubre?.explanation ?? '', '36 €');
  assertStringIncludes(octubre?.explanation ?? '', '49,50 €');
  assertStringIncludes(octubre?.explanation ?? '', '3 h');
  assertStringIncludes(octubre?.explanation ?? '', 'familiar');
  assertEquals(octubre?.fix, { kind: 'reprice_charge', studentId: 'paula', month: '2026-10' });
});

Deno.test('fee_mismatch should keep the prepayment discount noted in the charge and skip manual, cancelled and withdrawn', () => {
  const irene = student({ id: 'irene', tierCents: 4500, feeCents: 4050, familyDiscount: true });
  const baja = student({ id: 'baja', status: 'withdrawn', withdrawnOn: '2026-10-01', groups: [] });
  const facts = factsWith({
    students: [irene, baja],
    charges: [
      // 45 € con 10 % familiar y 20 % de temporada sumados: 31,50 €; estaba a 33 € (importe equivocado).
      charge({
        studentId: 'irene',
        period: '2026-12',
        amountCents: 3300,
        coveredCents: 3300,
        status: 'paid',
        discountPercent: 20,
      }),
      charge({
        studentId: 'irene',
        period: '2027-01',
        amountCents: 3150,
        coveredCents: 3150,
        status: 'paid',
        discountPercent: 20,
      }),
      charge({ studentId: 'irene', period: '2026-11', amountCents: 1000, manual: true }),
      charge({ studentId: 'irene', period: '2026-10', amountCents: 1000, status: 'cancelled' }),
      charge({ studentId: 'irene', kind: 'membership', period: '2026-09', amountCents: 5000 }),
      charge({ studentId: 'baja', period: '2026-11', amountCents: 4500 }),
    ],
  });
  const found = ofRule(facts, 'fee_mismatch');
  assertEquals(found.map((c) => c.data), [{
    month: '2026-12',
    amountCents: 3300,
    expectedCents: 3150,
  }]);
  assertStringIncludes(found[0]?.explanation ?? '', '20 %');
});

Deno.test('fee_mismatch should propose noting the prepayment discount that an imported charge carries', () => {
  const mario = student({
    id: 'mario',
    fullName: 'Mario Gómez Ruiz',
    tierCents: 4500,
    feeCents: 4050,
    familyDiscount: true,
  });
  const facts = factsWith({
    students: [mario],
    // Pagó la temporada: 45 € − 10 % familiar − 20 % de temporada = 31,50 €, sin el 20 % apuntado.
    charges: SEASON_MONTHS.map((period) =>
      charge({ studentId: 'mario', period, amountCents: 3150, coveredCents: 3150, status: 'paid' })
    ),
  });
  const found = ofRule(facts, 'fee_mismatch');
  assertEquals(found.length, 10, 'también los meses ya pasados');
  assertEquals(found[2]?.fix, {
    kind: 'note_discount',
    studentId: 'mario',
    month: '2026-11',
    percent: 20,
  });
  assertEquals(found[2]?.data, { month: '2026-11', amountCents: 3150, discountPercent: 20 });
  assertStringIncludes(found[2]?.explanation ?? '', '20 % de pago adelantado');
  assertStringIncludes(found[2]?.proposal ?? '', 'sin cambiar su importe');
});

Deno.test('fee_mismatch should not take a wrong amount for a prepayment when too few months share it', () => {
  const ana = student({ id: 'ana', tierCents: 4500, feeCents: 4500 });
  // 36 € sobre 45 € sería un 20 %, pero el de temporada pide nueve meses y solo hay dos.
  const facts = factsWith({
    students: [ana],
    charges: ['2026-10', '2026-11'].map((period) =>
      charge({ studentId: 'ana', period, amountCents: 3600 })
    ),
  });
  assertEquals(ofRule(facts, 'fee_mismatch').map((c) => c.fix?.kind), [
    'reprice_charge',
    'reprice_charge',
  ]);
});

Deno.test('fee_mismatch should mention the private lessons when the fee includes them', () => {
  const clara = student({
    id: 'clara',
    weeklyHours: 0,
    tierCents: 0,
    privateLessonsCents: 36000,
    feeCents: 36000,
  });
  const facts = factsWith({
    students: [clara],
    charges: [charge({ studentId: 'clara', amountCents: 18000 })],
  });
  const [found] = ofRule(facts, 'fee_mismatch');
  assertStringIncludes(found?.explanation ?? '', 'clases particulares por 360 € al mes');
  assertEquals(found?.data, { month: '2026-10', amountCents: 18000, expectedCents: 36000 });
});

Deno.test('charge_without_group should flag an active student without groups who has current or future charges', () => {
  const alvaro = student({
    id: 'alvaro',
    fullName: 'Álvaro Sanz Cano',
    groups: [],
    weeklyHours: 0,
    tierCents: 0,
    feeCents: 0,
  });
  const facts = factsWith({
    students: [alvaro, student({ id: 'otra', groups: [] })],
    charges: [
      charge({
        studentId: 'alvaro',
        period: '2026-10',
        amountCents: 3600,
        coveredCents: 3600,
        status: 'paid',
      }),
      charge({
        studentId: 'alvaro',
        period: '2026-11',
        amountCents: 3600,
        coveredCents: 3600,
        status: 'paid',
      }),
      charge({ studentId: 'alvaro', period: '2026-12', amountCents: 3600, status: 'cancelled' }),
    ],
  });
  const found = ofRule(facts, 'charge_without_group');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.data, { months: '2026-10, 2026-11', amountCents: 7200 });
  assertEquals(found[0]?.fix, null);
  assertStringIncludes(found[0]?.proposal ?? '', 'ficha');
  // Un alumno sin grupos y sin cuotas no es de esta regla.
  assertEquals(ofRule(facts, 'fee_mismatch').length, 0);
});

Deno.test('paid_but_no_group should flag who paid a past month and has neither group nor current charge', () => {
  const david = student({ id: 'david', groups: [], weeklyHours: 0, tierCents: 0, feeCents: 0 });
  const conCuota = student({
    id: 'con-cuota',
    groups: [],
    weeklyHours: 0,
    tierCents: 0,
    feeCents: 0,
  });
  const facts = factsWith({
    students: [david, conCuota],
    charges: [
      charge({
        studentId: 'david',
        period: '2026-09',
        amountCents: 5500,
        coveredCents: 5500,
        status: 'paid',
      }),
      charge({
        studentId: 'con-cuota',
        period: '2026-09',
        amountCents: 5500,
        coveredCents: 5500,
        status: 'paid',
      }),
      charge({ studentId: 'con-cuota', period: '2026-10', amountCents: 5500 }),
    ],
  });
  const found = ofRule(facts, 'paid_but_no_group');
  assertEquals(found.map((c) => c.entity.id), ['david']);
  assertEquals(found[0]?.data, { lastPaidMonth: '2026-09', amountCents: 5500 });
  assertEquals(ofRule(facts, 'charge_without_group').map((c) => c.entity.id), ['con-cuota']);
});

Deno.test('member_never_paid should flag members without classes, without any payment and with the membership fee due', () => {
  const nunca = student({
    id: 'nunca',
    groups: [],
    weeklyHours: 0,
    tierCents: 0,
    feeCents: 0,
    joinedOn: '2026-09-01',
  });
  const pago = student({ id: 'pago', groups: [], weeklyHours: 0, tierCents: 0, feeCents: 0 });
  const facts = factsWith({
    students: [nunca, pago],
    charges: [
      charge({
        studentId: 'nunca',
        kind: 'membership',
        period: '2026-09',
        amountCents: 5000,
        status: 'due',
      }),
      charge({
        studentId: 'pago',
        kind: 'membership',
        period: '2026-09',
        amountCents: 5000,
        coveredCents: 5000,
        status: 'paid',
      }),
    ],
    payments: [payment({ studentId: 'pago', kind: 'membership', totalCents: 5000 })],
  });
  const found = ofRule(facts, 'member_never_paid');
  assertEquals(found.map((c) => c.entity.id), ['nunca']);
  assertEquals(found[0]?.data, { joinedOn: '2026-09-01', membershipCents: 5000 });
});

Deno.test('enrolment_after_payment should propose moving «since» to the join date when a previous month is paid', () => {
  const francisco = student({
    id: 'fran',
    joinedOn: '2026-09-01',
    groups: [
      { id: 'g1', name: 'Miércoles 18:00 · Iniciación · Peón', since: '2026-10-06' },
      { id: 'g2', name: 'Martes 18:00 · Iniciación · Peón', since: '2026-10-06' },
    ],
  });
  const enFecha = student({ id: 'ok', groups: [{ id: 'g1', name: 'Grupo', since: '2026-09-01' }] });
  const facts = factsWith({
    students: [francisco, enFecha],
    charges: [
      charge({
        studentId: 'fran',
        period: '2026-09',
        amountCents: 1500,
        coveredCents: 1500,
        status: 'paid',
      }),
      charge({
        studentId: 'ok',
        period: '2026-09',
        amountCents: 4500,
        coveredCents: 4500,
        status: 'paid',
      }),
    ],
  });
  const found = ofRule(facts, 'enrolment_after_payment');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.data, {
    since: '2026-10-06',
    paidMonth: '2026-09',
    joinedOn: '2026-09-01',
  });
  assertEquals(found[0]?.fix, {
    kind: 'set_enrolment_start',
    studentId: 'fran',
    groupIds: ['g1', 'g2'],
    date: '2026-09-01',
  });
});

Deno.test('chained_discounts should flag charges where family and prepayment discounts were applied one after the other', () => {
  const irene = student({ id: 'irene', tierCents: 4500, feeCents: 4050, familyDiscount: true });
  const additive = student({ id: 'ok', tierCents: 4500, feeCents: 4050, familyDiscount: true });
  const facts = factsWith({
    students: [irene, additive],
    charges: [
      // 45 € − 10 % = 40,50 €; − 20 % = 32,40 € (en cadena) en vez de 45 € − 30 % = 31,50 €.
      charge({
        studentId: 'irene',
        period: '2026-09',
        amountCents: 3240,
        coveredCents: 3240,
        status: 'paid',
      }),
      charge({
        studentId: 'irene',
        period: '2026-10',
        amountCents: 3240,
        coveredCents: 3240,
        status: 'paid',
      }),
      charge({ studentId: 'irene', period: '2026-11', amountCents: 3240, status: 'due' }),
      charge({
        studentId: 'ok',
        period: '2026-10',
        amountCents: 3150,
        coveredCents: 3150,
        status: 'paid',
        discountPercent: 20,
      }),
    ],
  });
  const found = ofRule(facts, 'chained_discounts');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.entity.id, 'irene');
  assertEquals(found[0]?.data, { months: '2026-09,2026-10,2026-11', percent: 20, extraCents: 270 });
  assertStringIncludes(found[0]?.explanation ?? '', '32,40 €');
  assertStringIncludes(found[0]?.explanation ?? '', '30 %: 31,50 €');
  assertStringIncludes(found[0]?.explanation ?? '', 'ya ha pagado 1,80 €');
  assertStringIncludes(
    found[0]?.proposal ?? '',
    'Extra por error en el cálculo de varios descuentos',
  );
  assertEquals(found[0]?.fix, {
    kind: 'unchain_discounts',
    studentId: 'irene',
    months: ['2026-09', '2026-10', '2026-11'],
    percent: 20,
  });
  // Ni «cuota distinta de la tarifa» ni «pago adelantado sin apuntar» vuelven a señalar esas cuotas.
  assertEquals(ofRule(facts, 'fee_mismatch'), []);
});
