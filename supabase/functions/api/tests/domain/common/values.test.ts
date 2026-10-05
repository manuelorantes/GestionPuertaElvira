import { assert, assertEquals, assertMatch, assertThrows } from '@std/assert';

import {
  EmailAddress,
  FullName,
  InvalidValue,
  Money,
  PhoneNumber,
} from '../../../src/domain/common/mod.ts';
import { UserId } from '../../../src/domain/identity/mod.ts';

Deno.test('EmailAddress should normalise case and surrounding spaces', () => {
  assertEquals(EmailAddress.fromString('  Junta@PuertaElvira.ES ').value, 'junta@puertaelvira.es');
  assert(EmailAddress.fromString('A@b.es').equals(EmailAddress.fromString('a@B.es')));
});

for (
  const [name, invalid] of [
    ['empty', ''],
    ['no at', 'junta.puertaelvira.es'],
    ['no domain', 'junta@'],
    ['spaces inside', 'ju nta@club.es'],
    ['too long', `${'a'.repeat(250)}@club.es`],
  ]
) {
  Deno.test(`EmailAddress should reject when the format is invalid (${name})`, () => {
    assertThrows(() => EmailAddress.fromString(invalid ?? ''), InvalidValue);
  });
}

Deno.test('FullName should collapse inner and trim outer spaces', () => {
  assertEquals(FullName.fromString('  Lucía   Moreno Gil ').value, 'Lucía Moreno Gil');
  for (const invalid of ['   ', 'L', 'a'.repeat(121)]) {
    assertThrows(() => FullName.fromString(invalid), InvalidValue);
  }
});

Deno.test('PhoneNumber should normalise spanish numbers', () => {
  for (const input of ['612481930', '612 48 19 30', '+34 612-481-930', '0034612481930']) {
    assertEquals(PhoneNumber.fromString(input).value, '612 48 19 30');
  }
  for (const invalid of ['61248193', '612 48 19 3a', '+44 7700 900123', '112481930']) {
    assertThrows(() => PhoneNumber.fromString(invalid), InvalidValue);
  }
});

Deno.test('Money should add, multiply and compare amounts in cents', () => {
  const fee = Money.euros(45);
  assertEquals(fee.cents, 4500);
  assert(fee.times(3).equals(Money.cents(13500)));
  assertEquals(fee.plus(Money.cents(750)).cents, 5250);
  assertEquals(Money.cents(4500).minus(Money.cents(5250)).cents, -750);
  assert(Money.cents(-1).isNegative());
});

Deno.test('Money should apply percentages rounding half up to cents', () => {
  assertEquals(Money.cents(12375).percent(10).cents, 1238);
  assertEquals(Money.cents(16500).percent(75).cents, 12375);
});

Deno.test('Money should format in spanish style', () => {
  assertEquals(Money.cents(123450).format(), '1.234,50 €');
  assertEquals(Money.euros(45).format(), '45 €');
  assertEquals(Money.cents(-1125).format(), '−11,25 €');
  assertEquals(Money.cents(123456700).format(), '1.234.567 €');
});

Deno.test('Money should parse decimal strings', () => {
  assertEquals(Money.fromDecimal('30,50').cents, 3050);
  assertEquals(Money.fromDecimal('30').cents, 3000);
  assertThrows(() => Money.fromDecimal('treinta'), InvalidValue);
});

Deno.test('Uuid should generate a version seven rfc identifier that sorts by time', async () => {
  const first = UserId.generate();
  assertMatch(first.value, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await new Promise((resolve) => setTimeout(resolve, 3));
  assert(first.value < UserId.generate().value);
});

Deno.test('Uuid should round trip, compare by class and reject malformed strings', () => {
  const id = UserId.generate();
  assert(UserId.fromString(id.value.toUpperCase()).equals(id));
  assertEquals(String(id), id.value);
  assertThrows(() => UserId.fromString('not-a-uuid'), InvalidValue);
});
