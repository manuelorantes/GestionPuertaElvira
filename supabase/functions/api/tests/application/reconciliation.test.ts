import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue } from '../../src/domain/common/mod.ts';
import type { LedgerLine } from '../../src/application/accounting/mod.ts';
import {
  AcceptReconciliation,
  type BankMatch,
  type BankMatchRepository,
  MovementAlreadyMatched,
  ReconcileStatement,
  type ReconciliationActions,
} from '../../src/application/accounting/reconciliation.ts';
import type { BankMovement } from '../../src/domain/accounting/reconciliation.ts';
import { AccountingFixture } from '../support/accounting.ts';

class Memory implements BankMatchRepository {
  saved: BankMatch[] = [];
  ruleMap = new Map<string, string>();
  matches() {
    return Promise.resolve([...this.saved]);
  }
  saveMatch(match: BankMatch) {
    this.saved.push(match);
    return Promise.resolve();
  }
  rules() {
    return Promise.resolve(new Map(this.ruleMap));
  }
  saveRule(counterparty: string, category: string) {
    this.ruleMap.set(counterparty, category);
    return Promise.resolve();
  }
}

const payment = (
  id: string,
  date: string,
  method: string,
  amountCents: number,
  studentId = 'ana',
): LedgerLine => ({
  source: 'payment',
  sourceId: id,
  date,
  kind: 'income',
  concept: `Cuota · ${id}`,
  category: 'fees',
  method,
  amountCents,
  studentId,
  period: date.slice(0, 7),
  shares: [{ period: date.slice(0, 7), amountCents }],
  corrected: false,
});

const expense = (id: string, date: string, method: string, amountCents: number): LedgerLine => ({
  ...payment(id, date, method, amountCents),
  source: 'invoice',
  kind: 'expense',
  category: 'water',
  studentId: null,
  concept: `Gasto · ${id}`,
});

/** Un extracto que empieza con 1.000 € en el banco. */
function statement(...rows: [string, string, number][]): BankMovement[] {
  let balance = 100_000;
  return rows.map(([date, concept, amountCents]) => {
    balance += amountCents;
    return { operationDate: date, valueDate: date, concept, amountCents, balanceCents: balance };
  });
}

function setUp(lines: LedgerLine[]) {
  const fx = new AccountingFixture('2026-11-01T10:00:00+01:00');
  fx.external = lines;
  const memory = new Memory();
  const calls: string[] = [];
  const actions: ReconciliationActions = {
    reschedulePayment: (id, date) => {
      calls.push(`fecha ${id} ${date}`);
      fx.external = fx.external.map((l) => (l.sourceId === id ? { ...l, date } : l));
      return Promise.resolve();
    },
    changePaymentMethod: (id, method) => {
      calls.push(`forma ${id} ${method}`);
      fx.external = fx.external.map((l) => (l.sourceId === id ? { ...l, method } : l));
      return Promise.resolve();
    },
    changeLineMethod: (line, method) => {
      calls.push(`forma ${line.sourceId} ${method}`);
      return Promise.resolve();
    },
    recordEntry: (input) => {
      calls.push(`apunte ${input.kind} ${input.amountCents} ${input.category} ${input.method}`);
      return Promise.resolve('entry-1');
    },
    recordTransfer: (input) => {
      calls.push(`traspaso ${input.from}→${input.to} ${input.amountCents}`);
      return Promise.resolve('transfer-1');
    },
  };
  const names = {
    names: (ids: string[]) =>
      Promise.resolve(
        new Map(
          ids.map((
            id,
          ) => [id, id === 'ana' ? ['Ana Gil Ruiz', 'Rosa Ruiz Duran'] : ['Pedro Sanz']]),
        ),
      ),
  };
  const reconcile = (movements: BankMovement[]) =>
    new ReconcileStatement(fx, fx, fx, memory, names).execute(movements);
  const accept = new AcceptReconciliation(fx, fx, memory, actions);
  return { fx, memory, calls, reconcile, accept };
}

Deno.test('ReconcileStatement should match a card settlement with the card payments of its day', async () => {
  const { reconcile } = setUp([
    payment('p1', '2026-09-24', 'card', 15800),
    payment('p2', '2026-09-24', 'card', 49000),
  ]);
  const view = await reconcile(
    statement(['2026-09-25', 'Liquidacion Efectuada El 24/09/2026', 64800]),
  );
  assertEquals(view.items[0]!.status, 'matched');
  assertEquals(view.items[0]!.matched.map((i) => i.sourceId), ['p1', 'p2']);
  assertEquals(view.bank, { openingCents: 100_000, closingCents: 164_800 });
});

Deno.test('ReconcileStatement should suggest moving to card the payments that complete a settlement', async () => {
  const { reconcile, accept, calls } = setUp([
    payment('p1', '2026-09-03', 'transfer', 9000, 'pedro'),
  ]);
  const movements = statement(['2026-09-11', 'Liquidacion Efectuada El 10/09/2026', 9000]);
  const item = (await reconcile(movements)).items[0]!;
  assertEquals(item.status, 'suggested');
  assertEquals(item.proposal!.items.map((i) => i.sourceId), ['p1']);
  assertEquals(item.proposal!.changes, ['Pasar «Cuota · p1» (90,00 €) a tarjeta y al 10/09/2026']);
  await accept.execute({
    movement: item.movement,
    items: [{ source: 'payment', sourceId: 'p1' }],
    record: null,
    transfer: false,
  });
  assertEquals(calls, ['fecha p1 2026-09-10', 'forma p1 card']);
  const again = (await reconcile(movements)).items[0]!;
  assertEquals([again.status, again.note], ['matched', 'Casado al conciliar.']);
});

Deno.test('ReconcileStatement should leave ambiguous settlements to be chosen by hand', async () => {
  const { reconcile } = setUp([
    payment('p1', '2026-09-03', 'transfer', 3600),
    payment('p2', '2026-09-04', 'cash', 3600),
  ]);
  const item =
    (await reconcile(statement(['2026-09-11', 'Liquidacion Efectuada El 10/09/2026', 3600])))
      .items[0]!;
  assertEquals(item.status, 'pending');
  assertEquals(item.candidates.map((i) => i.sourceId).sort(), ['p1', 'p2']);
});

Deno.test('ReconcileStatement should match a received transfer and suggest fixing one paid by name', async () => {
  const { reconcile } = setUp([
    payment('p1', '2026-10-02', 'transfer', 5500, 'pedro'),
    payment('p2', '2026-09-20', 'cash', 2700),
  ]);
  const view = await reconcile(statement(
    ['2026-10-03', 'Transferencia De Pedro Sanz, Concepto Octubre', 5500],
    ['2026-10-05', 'Transferencia Inmediata De Rosa Ruiz Duran, Concepto Ana', 2700],
  ));
  assertEquals(view.items[0]!.status, 'matched');
  assertEquals(view.items[1]!.status, 'suggested');
  assertEquals(view.items[1]!.proposal!.changes, [
    'Pasar «Cuota · p2» (27,00 €) a transferencia y al 05/10/2026',
  ]);
});

Deno.test('ReconcileStatement should suggest recording an unknown receipt, remembering its category', async () => {
  const { reconcile, accept, calls, memory } = setUp([]);
  const movements = statement(['2026-10-20', 'Recibo Aguas Del Sur Sa Nº Recibo 0049 4948', -4376]);
  const item = (await reconcile(movements)).items[0]!;
  assertEquals(item.proposal!.record, {
    kind: 'expense',
    concept: 'Recibo Aguas Del Sur Sa',
    category: 'water',
    method: 'transfer',
  });
  await accept.execute({
    movement: item.movement,
    items: [],
    record: { concept: 'Agua de octubre', category: 'utilities' },
    transfer: false,
  });
  assertEquals(calls, ['apunte expense 4376 utilities transfer']);
  assertEquals(memory.ruleMap.get('aguas del sur sa'), 'utilities');
  const next = statement(['2026-11-20', 'Recibo Aguas Del Sur Sa Nº Recibo 0049 5000', -3900]);
  assertEquals((await reconcile(next)).items[0]!.proposal!.record!.category, 'utilities');
});

Deno.test('ReconcileStatement should match bank expenses and suggest moving a cash one to the bank', async () => {
  const { reconcile, accept, calls } = setUp([
    expense('e1', '2026-10-01', 'transfer', 1200),
    expense('e2', '2026-10-06', 'cash', 33580),
  ]);
  const view = await reconcile(statement(
    ['2026-10-03', 'Recibo Digi Spain Telecom Sa', -1200],
    ['2026-10-06', 'Transferencia A Favor De Angel Ruiz Concepto Nomina', -33580],
  ));
  assertEquals(view.items[0]!.status, 'matched');
  assertEquals(view.items[1]!.proposal!.items.map((i) => i.sourceId), ['e2']);
  await accept.execute({
    movement: view.items[1]!.movement,
    items: [{ source: 'invoice', sourceId: 'e2' }],
    record: null,
    transfer: false,
  });
  assertEquals(calls, ['forma e2 transfer']);
});

Deno.test('ReconcileStatement should suggest a transfer to cash for a withdrawal', async () => {
  const { reconcile, accept, calls } = setUp([]);
  const item =
    (await reconcile(statement(['2026-10-02', 'Disposicion Efectivo En Oficina', -200000])))
      .items[0]!;
  assertEquals(item.proposal!.transfer, { from: 'bank', to: 'cash' });
  await accept.execute({ movement: item.movement, items: [], record: null, transfer: true });
  assertEquals(calls, ['traspaso bank→cash 200000']);
});

Deno.test('AcceptReconciliation should refuse choices that do not add up, are taken or repeat a movement', async () => {
  const { reconcile, accept } = setUp([
    payment('p1', '2026-09-03', 'transfer', 9000),
    payment('p2', '2026-09-04', 'transfer', 4000),
  ]);
  const movement =
    (await reconcile(statement(['2026-09-11', 'Liquidacion Efectuada El 10/09/2026', 9000])))
      .items[0]!.movement;
  const choose = (ids: string[]) =>
    accept.execute({
      movement,
      items: ids.map((sourceId) => ({ source: 'payment', sourceId })),
      record: null,
      transfer: false,
    });
  await assertRejects(() => choose(['p2']), InvalidValue);
  await choose(['p1']);
  await assertRejects(() => choose(['p1']), MovementAlreadyMatched);
});

Deno.test('ReconcileStatement should match several months of an expense paid at once', async () => {
  const rent = (id: string, date: string) => ({
    ...expense(id, date, 'transfer', 51000),
    category: 'rent',
  });
  const { reconcile } = setUp([
    rent('r8', '2026-08-01'),
    rent('r9', '2026-09-01'),
    rent('r10', '2026-10-01'),
  ]);
  const item = (await reconcile(
    statement([
      '2026-09-07',
      'Transferencia Inmediata A Favor De Pinturas Gil Concepto Alquiler',
      -153000,
    ]),
  )).items[0]!;
  assertEquals(item.status, 'suggested');
  assertEquals(item.proposal!.items.map((i) => i.sourceId).sort(), ['r10', 'r8', 'r9']);
  assertEquals(item.proposal!.changes, []);
});
