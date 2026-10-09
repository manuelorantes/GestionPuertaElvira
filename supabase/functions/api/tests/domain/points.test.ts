import { assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  monthBalance,
  PointMovement,
  PointsAlreadySpent,
  Tournament,
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

Deno.test('Tournament should give between 1 and 20 points per photo', () => {
  const t = Tournament.create('t1', 'Open de Granada', day('2026-10-17'), 1);
  assertEquals(t.photo('s1', 'u1').delta, 1);
  assertEquals(t.photo('s1', 'u1').date.toString(), '2026-10-17');
  assertThrows(() => Tournament.create('t2', ' ', day('2026-10-17'), 1), InvalidValue);
  assertThrows(() => Tournament.create('t2', 'Torneo', day('2026-10-17'), 0), InvalidValue);
});
