import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate, Season, YearMonth } from '../../../src/domain/common/mod.ts';

Deno.test('LocalDate should parse and format iso dates', () => {
  assertEquals(LocalDate.fromString('2026-10-02').toString(), '2026-10-02');
});

for (const invalid of ['2026-02-30', '02/10/2026', '2026-10-02 10:00']) {
  Deno.test(`LocalDate should reject «${invalid}» as malformed or non-existent`, () => {
    assertThrows(() => LocalDate.fromString(invalid), InvalidValue);
  });
}

Deno.test('LocalDate should compare chronologically', () => {
  const earlier = LocalDate.fromString('2026-09-30');
  const later = LocalDate.fromString('2026-10-02');
  assert(earlier.isBefore(later));
  assertFalse(later.isBefore(earlier));
  assert(later.isAfterOrEqual(later));
  assert(earlier.equals(LocalDate.fromString('2026-09-30')));
});

Deno.test('LocalDate should compute age counting birthdays exactly', () => {
  const birth = LocalDate.fromString('2010-10-02');
  assertEquals(birth.ageOn(LocalDate.fromString('2026-10-01')), 15);
  assertEquals(birth.ageOn(LocalDate.fromString('2026-10-02')), 16);
});

Deno.test('LocalDate should take the calendar day of an instant in Madrid', () => {
  assertEquals(LocalDate.fromInstant(new Date('2026-10-01T23:30:00Z')).toString(), '2026-10-02');
  assertEquals(LocalDate.fromString('2026-10-05').isoWeekday(), 1);
  assertEquals(LocalDate.fromString('2026-10-31').plusDays(1).toString(), '2026-11-01');
});

Deno.test('YearMonth should parse, navigate and compare months', () => {
  const october = YearMonth.fromString('2026-10');
  assertEquals(october.next().toString(), '2026-11');
  assertEquals(YearMonth.fromString('2026-12').next().toString(), '2027-01');
  assertEquals(YearMonth.fromString('2027-01').previous().toString(), '2026-12');
  assert(october.isBefore(YearMonth.fromString('2026-11')));
  assertEquals(october.days(), 31);
  assertEquals(october.label(), 'octubre 2026');
  assertEquals(october.shortLabel(), 'Octubre');
  assertEquals(october.lastDay().toString(), '2026-10-31');
  assert(YearMonth.of(LocalDate.fromString('2026-10-02')).equals(october));
  assertThrows(() => YearMonth.fromString('2026-13'), InvalidValue);
});

Deno.test('Season should place months in a september to june season', () => {
  const season = Season.containing(YearMonth.fromString('2027-02'));
  assertEquals(season.label(), '2026/27');
  assertEquals(season.firstMonth().toString(), '2026-09');
  assertEquals(season.lastMonth().toString(), '2027-06');
  assertEquals(season.monthsFrom(YearMonth.fromString('2027-02')), 5);
  assert(season.includes(YearMonth.fromString('2026-09')));
  assertFalse(season.includes(YearMonth.fromString('2027-07')));
  assertEquals(Season.teachingSeason(YearMonth.fromString('2027-08')), null);
  assertEquals(
    Season.containing(YearMonth.fromString('2026-08')).label(),
    '2026/27',
    'el verano cuenta para la temporada que empieza',
  );
});
