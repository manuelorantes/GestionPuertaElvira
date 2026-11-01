import { assertEquals, assertNotEquals, assertThrows } from '@std/assert';

import { InvalidValue } from '../../src/domain/common/mod.ts';
import {
  type BankMovement,
  BankStatement,
  counterparty,
  movementKey,
  movementKind,
  nameScore,
  paidByCard,
  settlementDay,
  shortConcept,
  subsetsSumming,
} from '../../src/domain/accounting/reconciliation.ts';

const movement = (amountCents: number, balanceCents: number, concept = 'Algo'): BankMovement => ({
  operationDate: '2026-09-02',
  valueDate: '2026-09-01',
  concept,
  amountCents,
  balanceCents,
});

Deno.test('BankStatement should accept the newest-first order of the bank and check the balances chain', () => {
  const statement = BankStatement.of([
    { ...movement(-1200, 18800), operationDate: '2026-09-05' },
    { ...movement(5000, 20000), operationDate: '2026-09-03' },
  ]);
  assertEquals(statement.movements.map((m) => m.amountCents), [5000, -1200]);
  assertEquals([statement.from, statement.to], ['2026-09-03', '2026-09-05']);
  assertEquals([statement.openingCents, statement.closingCents], [15000, 18800]);
});

Deno.test('BankStatement should refuse balances that do not chain or an empty statement', () => {
  assertThrows(
    () => BankStatement.of([movement(5000, 20000), movement(1000, 30000)]),
    InvalidValue,
  );
  assertThrows(() => BankStatement.of([]), InvalidValue);
});

Deno.test('movementKind should tell card settlements, cash and other income and expenses apart', () => {
  const settlement = movement(
    64800,
    1,
    'Liquidacion Efectuada El 24/09/2026 A Club De Ajedrez 0 596 3.343 1',
  );
  assertEquals(movementKind(settlement), 'card_settlement');
  assertEquals(settlementDay(settlement), '2026-09-24');
  assertEquals(
    movementKind(movement(-200000, 1, 'Disposicion Efectivo En Oficina 4948')),
    'cash_withdrawal',
  );
  assertEquals(movementKind(movement(5000, 1, 'Ingreso En Efectivo')), 'cash_deposit');
  assertEquals(
    movementKind(movement(5000, 1, 'Transferencia De Ana Gil, Concepto Cuota')),
    'income',
  );
  assertEquals(movementKind(movement(-1200, 1, 'Recibo Digi Spain Telecom Sa')), 'expense');
  assertEquals(settlementDay(movement(5000, 1, 'Transferencia')), null);
});

Deno.test('counterparty should take who charges or pays from the concept', () => {
  assertEquals(
    counterparty('Recibo Emp. Mpal. De Abast. Y Saneam. De Granad Nº Recibo 0049 4948 755 Bbkkwwx'),
    'emp mpal de abast y saneam de granad',
  );
  assertEquals(
    counterparty('Recibo Digi Spain Telecom Sa, Concepto: Factura Digi'),
    'digi spain telecom sa',
  );
  assertEquals(
    counterparty('Transferencia Inmediata A Favor De Pinturas Gil S.l. Concepto Pago Alquiler'),
    'pinturas gil s l',
  );
  assertEquals(
    counterparty('Transferencia Inmediata De Ana Gil Ruiz, Concepto Cuota Octubre'),
    'ana gil ruiz',
  );
  assertEquals(
    counterparty('Transaccion Contactless En Ferreteria Sant, Granada Es, Tarj. :*911074'),
    'ferreteria sant',
  );
  assertEquals(counterparty('Domiciliacion Impuesto: 2.026 Iva Autoliquidacion'), 'impuesto');
});

Deno.test('paidByCard and shortConcept should read card purchases and trim bank references', () => {
  assertEquals(paidByCard(movement(-2511, 1, 'Transaccion Contactless En Ferreteria Sant')), true);
  assertEquals(
    paidByCard(movement(-199, 1, 'Compra Google*google One, Ireland, Tarjeta 4176')),
    true,
  );
  assertEquals(paidByCard(movement(-1200, 1, 'Recibo Digi Spain Telecom Sa')), false);
  assertEquals(
    shortConcept(
      'Recibo Repsol Comercializadora Nº Recibo 0049 4948 755 Bbkjbld Ref. Mandato 0024',
    ),
    'Recibo Repsol Comercializadora',
  );
});

Deno.test('movementKey should identify a movement whatever the format cuts of its concept', () => {
  assertEquals(
    movementKey(movement(5000, 20000, 'Recibo Tgss. Cotizacion Autorizado: 059440')),
    movementKey(movement(5000, 20000, 'Recibo Tgss. Cotizacion')),
  );
  assertNotEquals(movementKey(movement(5000, 20000)), movementKey(movement(5000, 25000)));
});

Deno.test('nameScore should count the words of a name found in a bank concept', () => {
  const concept = 'Transferencia De Rios Duran Yolanda, Concepto Paula Lopez Rios - Cuota De Socio';
  assertEquals(nameScore(concept, 'Paula López Ríos'), 3);
  assertEquals(nameScore(concept, 'Pedro Molina García'), 0);
});

Deno.test('subsetsSumming should find the combinations of amounts reaching a target, telling ambiguity', () => {
  assertEquals(subsetsSumming([4000, 9000, 5000], 9000), [[1], [0, 2]]);
  assertEquals(subsetsSumming([4000, 9000, 5500], 9500), [[0, 2]]);
  // Dos cobros iguales: dos combinaciones.
  assertEquals(subsetsSumming([3600, 3600], 3600).length, 2);
  assertEquals(subsetsSumming([1000], 5000), []);
});
