import { assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  monthBalance,
  PointMovement,
  PointsAlreadySpent,
  TournamentPhoto,
} from '../../src/domain/points/mod.ts';

const day = (iso: string) => LocalDate.fromString(iso);

Deno.test('PointMovement should only give a Friday point on a Friday and need a reason to adjust by hand', () => {
  const friday = PointMovement.friday('s1', day('2026-09-04'), 'u1');
  assertEquals([friday.delta, friday.kind, friday.reference], [1, 'friday', '2026-09-04']);
  assertThrows(() => PointMovement.friday('s1', day('2026-09-03'), 'u1'), InvalidValue, 'viernes');
  assertThrows(() => PointMovement.manual('s1', day('2026-10-09'), 0, 'x', 'u1'), InvalidValue);
  assertThrows(
    () => PointMovement.manual('s1', day('2026-10-09'), 2, '  ', 'u1'),
    InvalidValue,
    'motivo',
  );
  assertEquals(
    PointMovement.manual('s1', day('2026-10-09'), -2, 'Error al apuntar', 'u1').delta,
    -2,
  );
});

Deno.test('points should only count in the month they were earned and never go below zero', () => {
  const movements = [
    PointMovement.friday('s1', day('2026-09-04'), 'u1'),
    PointMovement.friday('s1', day('2026-09-11'), 'u1'),
    PointMovement.friday('s1', day('2026-10-02'), 'u1'),
  ];
  assertEquals(monthBalance(movements, day('2026-09-30')), 2);
  assertEquals(
    monthBalance(movements, day('2026-10-09')),
    1,
    'los de septiembre no pasan a octubre',
  );
  assertThrows(
    () =>
      PointMovement.assertCanApply(
        movements,
        PointMovement.manual('s1', day('2026-10-09'), -2, 'x', 'u1'),
      ),
    PointsAlreadySpent,
  );
  PointMovement.assertCanApply(
    movements,
    PointMovement.manual('s1', day('2026-10-09'), -1, 'x', 'u1'),
  );
});

Deno.test('TournamentPhoto should accept images up to 5 MB of past days and give a point that day', () => {
  const today = day('2026-10-09');
  const photo = TournamentPhoto.take(
    's1',
    day('2026-10-04'),
    ' Open de Granada ',
    'image/jpeg',
    300_000,
    today,
  );
  assertEquals(photo.note, 'Open de Granada');
  assertEquals(photo.documentKey.startsWith(`photos/${photo.id}/`), true);
  assertEquals(photo.documentKey.endsWith('.jpg'), true);
  const movement = photo.movement('u1');
  assertEquals([movement.delta, movement.kind, movement.reference, movement.date.toString()], [
    1,
    'tournament',
    photo.id,
    '2026-10-04',
  ]);
  assertThrows(
    () => TournamentPhoto.take('s1', today, null, 'application/pdf', 10, today),
    InvalidValue,
    'imagen',
  );
  assertThrows(
    () => TournamentPhoto.take('s1', today, null, 'image/png', 6_000_000, today),
    InvalidValue,
    '5 MB',
  );
  assertThrows(
    () => TournamentPhoto.take('s1', day('2026-10-10'), null, 'image/png', 10, today),
    InvalidValue,
  );
});
