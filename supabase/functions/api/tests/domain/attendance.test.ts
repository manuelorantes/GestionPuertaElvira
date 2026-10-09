import { assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  ActivityCheck,
  RollCall,
  RollCallClosed,
  RollCallNotOpenYet,
} from '../../src/domain/attendance/mod.ts';

const TUESDAY = LocalDate.fromString('2026-10-13');
const ROSTER = ['s1', 's2', 's3'];
const START = 17 * 60;
/** Instante en Madrid (verano: +02:00). */
const at = (iso: string) => new Date(`${iso}+02:00`);

const take = (now: Date, absent: string[] = ['s2']) =>
  RollCall.take('g1', TUESDAY, START, 't1', ROSTER, { absent }, now);

Deno.test('RollCall should be taken from 15 minutes before the class until the end of the next day', () => {
  // Se abre 15 minutos antes de que empiece la clase (a las 16:45 para la de las 17:00).
  assertThrows(() => take(at('2026-10-13T16:44:00')), RollCallNotOpenYet);
  assertEquals(take(at('2026-10-13T16:45:00')).absent(), ['s2']);
  assertThrows(() => take(at('2026-10-12T20:00:00')), RollCallNotOpenYet);
  assertEquals(take(at('2026-10-13T17:00:00')).absent(), ['s2']);
  assertEquals(take(at('2026-10-14T23:59:00')).present(ROSTER), ['s1', 's3']);
  assertThrows(() => take(at('2026-10-15T00:00:00')), RollCallClosed);
});

Deno.test('RollCall should only mark students of that day as absent and can be corrected in time', () => {
  assertThrows(() => take(at('2026-10-13T18:00:00'), ['s9']), InvalidValue, 'lista');
  const roll = take(at('2026-10-13T18:00:00'));
  assertEquals(roll.kind(), 'taken');
  roll.correct(START, 't1', ROSTER, { absent: [] }, at('2026-10-14T10:00:00'));
  assertEquals(roll.absent(), []);
  assertThrows(
    () => roll.correct(START, 't1', ROSTER, { absent: ['s1'] }, at('2026-10-15T09:00:00')),
    RollCallClosed,
  );
  // Pasado el plazo, se cambia confirmando que es una lista pasada (pero no antes de que se abra).
  roll.correct(START, 't1', ROSTER, { absent: ['s1'] }, at('2026-11-20T09:00:00'), true);
  assertEquals(roll.absent(), ['s1']);
  assertThrows(
    () =>
      RollCall.take(
        'g1',
        TUESDAY,
        START,
        't1',
        ROSTER,
        { absent: [] },
        at('2026-10-12T09:00:00'),
        true,
      ),
    RollCallNotOpenYet,
  );
});

Deno.test('RollCall should keep the students from other classes who came (special attendance)', () => {
  const roll = RollCall.take(
    'g1',
    TUESDAY,
    START,
    't1',
    ROSTER,
    { absent: [], guests: ['s9', 's9'] },
    at('2026-10-13T18:00:00'),
  );
  assertEquals(roll.guests(), ['s9']);
  assertThrows(
    () =>
      roll.correct(START, 't1', ROSTER, { absent: [], guests: ['s1'] }, at('2026-10-13T18:05:00')),
    InvalidValue,
    'ya está en la lista',
  );
  // Una lista dada por buena sin lista no tiene a nadie.
  assertEquals(RollCall.confirm('g1', TUESDAY, 'u1', at('2026-10-16T09:00:00')).guests(), []);
});

Deno.test('RollCall can be confirmed by administration without a list', () => {
  const roll = RollCall.confirm('g1', TUESDAY, 'u1', at('2026-10-16T09:00:00'));
  assertEquals(roll.kind(), 'confirmed');
  assertEquals(roll.absent(), []);
});

Deno.test('ActivityCheck should be done by its manager in the same window as the roll calls', () => {
  const friday = LocalDate.fromString('2026-10-16');
  const start = 17 * 60;
  assertThrows(
    () => ActivityCheck.done('d1', friday, start, 't1', at('2026-10-16T16:44:00')),
    RollCallNotOpenYet,
  );
  assertEquals(
    ActivityCheck.done('d1', friday, start, 't1', at('2026-10-16T16:45:00')).kind,
    'done',
  );
  assertEquals(
    ActivityCheck.done('d1', friday, start, 't1', at('2026-10-17T23:00:00')).by.teacher,
    't1',
  );
  assertThrows(
    () => ActivityCheck.done('d1', friday, start, 't1', at('2026-10-18T09:00:00')),
    RollCallClosed,
  );
  assertEquals(
    ActivityCheck.confirm('d1', friday, 'u1', at('2026-10-19T09:00:00')).kind,
    'confirmed',
  );
});
