import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue } from '../../src/domain/common/mod.ts';
import type { LedgerLine } from '../../src/application/accounting/mod.ts';
import {
  AcceptReconciliation,
  type BankMatch,
  type BankMatchRepository,
  type FeePayments,
  MovementAlreadyMatched,
  ReconcileStatement,
  type ReconciliationActions,
  ReleaseMatch,
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
    this.saved = [...this.saved.filter((s) => s.key !== match.key), match];
    return Promise.resolve();
  }
  rules() {
    return Promise.resolve(new Map(this.ruleMap));
  }
  saveRule(counterparty: string, category: string) {
    this.ruleMap.set(counterparty, category);
    return Promise.resolve();
  }
  payers = new Map<string, string[]>();
  payerStudents() {
    return Promise.resolve(new Map(this.payers));
  }
  savePayerStudents(counterparty: string, studentIds: string[]) {
    this.payers.set(counterparty, [
      ...new Set([...(this.payers.get(counterparty) ?? []), ...studentIds]),
    ]);
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

/** Un extracto que empieza con 1.000,00 € en el banco. */
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
  /** Solo Ana tiene una cuota por cobrar (la del mes del cobro, de 55,00 €), salvo que el test añada otras. */
  const feeCents = new Map([['ana', 5500]]);
  const fees: FeePayments = {
    payers: () =>
      Promise.resolve([
        { studentId: 'ana', name: 'Ana Gil Ruiz', names: ['Ana Gil Ruiz', 'Rosa Ruiz Duran'] },
        { studentId: 'pedro', name: 'Pedro Sanz', names: ['Pedro Sanz'] },
      ]),
    quote: (studentId, date) =>
      Promise.resolve(
        feeCents.has(studentId)
          ? {
            concept: date.startsWith('2026-11') ? 'Noviembre 2026' : 'Octubre 2026',
            amountCents: feeCents.get(studentId)!,
          }
          : null,
      ),
    register: (studentId, date) => {
      calls.push(`cobro ${studentId} ${date}`);
      return Promise.resolve(`payment-${studentId}`);
    },
  };
  const reconcile = (movements: BankMovement[]) =>
    new ReconcileStatement(fx, fx, fx, memory, names, fees).execute(movements);
  const accept = new AcceptReconciliation(fx, fx, memory, actions, fees);
  const release = new ReleaseMatch(memory);
  return { fx, memory, calls, reconcile, accept, release, feeCents };
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

Deno.test('ReconcileStatement should suggest moving to the bank day the card payments that complete a settlement', async () => {
  const { reconcile, accept, calls } = setUp([
    payment('p1', '2026-09-03', 'card', 9000, 'pedro'),
    payment('p2', '2026-09-09', 'cash', 9000, 'pedro'),
    payment('p3', '2026-09-09', 'transfer', 9000, 'pedro'),
  ]);
  const movements = statement(['2026-09-11', 'Liquidacion Efectuada El 10/09/2026', 9000]);
  const item = (await reconcile(movements)).items[0]!;
  assertEquals(item.status, 'suggested');
  assertEquals(item.proposal!.items.map((i) => i.sourceId), ['p1']);
  assertEquals(item.candidates.map((i) => i.sourceId), ['p1']);
  assertEquals(item.proposal!.changes, ['Pasar «Cuota · p1» (90,00 €) al 10/09/2026']);
  await accept.execute({
    movement: item.movement,
    items: [{ source: 'payment', sourceId: 'p1' }],
    record: null,
    transfer: false,
    fees: [],
  });
  assertEquals(calls, ['fecha p1 2026-09-10']);
  const again = (await reconcile(movements)).items[0]!;
  assertEquals([again.status, again.note], ['matched', 'Casado al conciliar.']);
});

Deno.test('ReconcileStatement should leave ambiguous settlements to be chosen by hand', async () => {
  const { reconcile } = setUp([
    payment('p1', '2026-09-03', 'card', 3600),
    payment('p2', '2026-09-04', 'card', 3600),
    payment('p3', '2026-09-04', 'cash', 3600),
  ]);
  const item =
    (await reconcile(statement(['2026-09-11', 'Liquidacion Efectuada El 10/09/2026', 3600])))
      .items[0]!;
  assertEquals(item.status, 'pending');
  assertEquals(item.candidates.map((i) => i.sourceId).sort(), ['p1', 'p2']);
});

Deno.test('ReconcileStatement should match a received transfer and suggest fixing the date of one paid by name', async () => {
  const { reconcile } = setUp([
    payment('p1', '2026-10-02', 'transfer', 5500, 'pedro'),
    payment('p2', '2026-09-28', 'cash', 2700),
    payment('p3', '2026-09-20', 'transfer', 2700),
  ]);
  const view = await reconcile(statement(
    ['2026-10-03', 'Transferencia De Pedro Sanz, Concepto Octubre', 5500],
    ['2026-10-05', 'Transferencia Inmediata De Rosa Ruiz Duran, Concepto Ana', 2700],
  ));
  assertEquals(view.items[0]!.status, 'matched');
  assertEquals(view.items[1]!.status, 'suggested');
  assertEquals(view.items[1]!.proposal!.items.map((i) => i.sourceId), ['p3']);
  assertEquals(view.items[1]!.proposal!.changes, ['Pasar «Cuota · p3» (27,00 €) al 05/10/2026']);
  assertEquals(view.items[1]!.candidates.map((i) => i.sourceId), ['p3']);
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
    fees: [],
  });
  assertEquals(calls, ['apunte expense 4376 utilities transfer']);
  assertEquals(memory.ruleMap.get('aguas del sur sa'), 'utilities');
  const next = statement(['2026-11-20', 'Recibo Aguas Del Sur Sa Nº Recibo 0049 5000', -3900]);
  assertEquals((await reconcile(next)).items[0]!.proposal!.record!.category, 'utilities');
});

Deno.test('ReconcileStatement should match bank expenses and never a cash one', async () => {
  const { reconcile, accept, calls } = setUp([
    expense('e1', '2026-10-01', 'transfer', 1200),
    expense('e2', '2026-10-06', 'cash', 33580),
  ]);
  const view = await reconcile(statement(
    ['2026-10-03', 'Recibo Digi Spain Telecom Sa', -1200],
    ['2026-10-06', 'Transferencia A Favor De Angel Ruiz Concepto Nomina', -33580],
  ));
  assertEquals(view.items[0]!.status, 'matched');
  assertEquals(view.items[1]!.proposal!.items, []);
  assertEquals(view.items[1]!.candidates, []);
  await assertRejects(
    () =>
      accept.execute({
        movement: view.items[1]!.movement,
        items: [{ source: 'invoice', sourceId: 'e2' }],
        record: null,
        transfer: false,
        fees: [],
      }),
    InvalidValue,
    'efectivo',
  );
  assertEquals(calls, []);
});

Deno.test('ReconcileStatement should suggest a transfer to cash for a withdrawal', async () => {
  const { reconcile, accept, calls } = setUp([]);
  const item =
    (await reconcile(statement(['2026-10-02', 'Disposicion Efectivo En Oficina', -200000])))
      .items[0]!;
  assertEquals(item.proposal!.transfer, { from: 'bank', to: 'cash' });
  await accept.execute({
    movement: item.movement,
    items: [],
    record: null,
    transfer: true,
    fees: [],
  });
  assertEquals(calls, ['traspaso bank→cash 200000']);
});

Deno.test('AcceptReconciliation should refuse choices that do not add up, are taken or repeat a movement', async () => {
  const { reconcile, accept } = setUp([
    payment('p1', '2026-09-03', 'card', 9000),
    payment('p2', '2026-09-04', 'card', 4000),
    payment('p3', '2026-09-04', 'transfer', 9000),
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
      fees: [],
    });
  await assertRejects(() => choose(['p2']), InvalidValue);
  await assertRejects(() => choose(['p3']), InvalidValue, 'tarjeta');
  await choose(['p1']);
  await assertRejects(() => choose(['p1']), MovementAlreadyMatched);
});

Deno.test('AcceptReconciliation should split a transfer between payments and new fees and remember who sends it', async () => {
  const { reconcile, accept, calls, memory, feeCents } = setUp([
    payment('p1', '2026-10-01', 'transfer', 5500),
  ]);
  feeCents.set('pedro', 4500);
  const concept = 'Transferencia Inmediata De Luis Mora Vela, Concepto Clases';
  const item = (await reconcile(statement(['2026-10-02', concept, 10000]))).items[0]!;
  assertEquals(item.proposal!.fees, []);
  assertEquals(item.proposal!.record!.kind, 'income');
  await accept.execute({
    movement: item.movement,
    items: [{ source: 'payment', sourceId: 'p1' }],
    record: null,
    transfer: false,
    fees: ['pedro'],
  });
  assertEquals(calls, ['cobro pedro 2026-10-02']);
  assertEquals(memory.saved.at(-1)!.targets, [
    { source: 'payment', sourceId: 'p1' },
    { source: 'payment', sourceId: 'payment-pedro' },
  ]);
  assertEquals(memory.payers.get('luis mora vela'), ['ana', 'pedro']);

  feeCents.set('ana', 5500);
  const next = (await reconcile(statement(['2026-11-03', concept, 10000]))).items[0]!;
  assertEquals(next.status, 'suggested');
  assertEquals(next.proposal!.fees.map((f) => f.studentId).sort(), ['ana', 'pedro']);
});

Deno.test('AcceptReconciliation should refuse fees that do not add up with the payments chosen', async () => {
  const { reconcile, accept, calls } = setUp([payment('p1', '2026-10-01', 'transfer', 5500)]);
  const item = (await reconcile(
    statement(['2026-10-02', 'Transferencia De Luis Mora Vela, Concepto Clases', 10000]),
  )).items[0]!;
  const choose = (fees: string[]) =>
    accept.execute({
      movement: item.movement,
      items: [{ source: 'payment', sourceId: 'p1' }],
      record: null,
      transfer: false,
      fees,
    });
  await assertRejects(() => choose(['ana']), InvalidValue, 'suma');
  await assertRejects(() => choose(['pedro']), InvalidValue, 'cuota');
  assertEquals(calls, []);
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

const income = (id: string, date: string, method: string, amountCents: number): LedgerLine => ({
  ...payment(id, date, method, amountCents),
  source: 'manual',
  category: 'material_sales',
  studentId: null,
  concept: `Venta · ${id}`,
});

Deno.test('ReconcileStatement should count card income entries in a card settlement', async () => {
  const { reconcile } = setUp([
    payment('p1', '2026-09-08', 'card', 4000),
    income('i1', '2026-09-08', 'card', 1500),
  ]);
  const item =
    (await reconcile(statement(['2026-09-09', 'Liquidacion Efectuada El 08/09/2026', 5500])))
      .items[0]!;
  assertEquals(item.status, 'matched');
  assertEquals(item.matched.map((i) => i.sourceId), ['i1', 'p1']);
});

Deno.test('ReconcileStatement should match a transfer with the payment of its payer before one of the same amount', async () => {
  const { reconcile } = setUp([
    payment('pedro1', '2026-09-03', 'transfer', 5000, 'pedro'),
    payment('ana1', '2026-10-05', 'transfer', 5000),
  ]);
  const view = await reconcile(statement(
    ['2026-10-05', 'Transferencia De Pedro Sanz, Concepto Socio', 5000],
    ['2026-10-06', 'Transferencia De Rosa Ruiz Duran, Concepto Ana', 5000],
  ));
  assertEquals(view.items[1]!.status, 'matched');
  assertEquals(view.items[1]!.matched.map((m) => m.sourceId), ['ana1']);
  // El de Pedro tiene otra fecha: se sugiere corregirla en vez de quitarle el suyo a Ana.
  assertEquals(view.items[0]!.status, 'suggested');
  assertEquals(view.items[0]!.proposal!.items.map((i) => i.sourceId), ['pedro1']);
});

Deno.test('ReconcileStatement should match several transfers of the same payer that together pay the payments', async () => {
  const { reconcile } = setUp(
    Array.from({ length: 18 }, (_, i) => payment(`p${i}`, '2026-10-06', 'transfer', 3850)),
  );
  const view = await reconcile(statement(
    ['2026-10-06', 'Transferencia Inmediata De Rosa Ruiz Duran, Concepto Ana Gil Cuotas', 64800],
    ['2026-10-07', 'Transferencia Inmediata De Rosa Ruiz Duran, Concepto Ana Gil Resto', 4500],
  ));
  assertEquals(view.items.map((i) => i.status), ['matched', 'matched']);
  assertEquals(view.items[0]!.matched.length, 18);
  assertEquals(view.items[1]!.matched.length, 18);
});

Deno.test('ReconcileStatement should match a transfer with its payments minus an expense that names the student', async () => {
  const { reconcile } = setUp([
    payment('p1', '2026-09-07', 'transfer', 5000, 'pedro'),
    payment('p2', '2026-09-07', 'transfer', 44000, 'pedro'),
    {
      ...expense('e1', '2026-09-07', 'transfer', 11920),
      concept: 'Gasolina y comida del equipo · Pedro Sanz (descontado de su pago)',
    },
  ]);
  const item = (await reconcile(
    statement(['2026-09-07', 'Transferencia De Pedro Sanz, Concepto Curso', 37080]),
  ))
    .items[0]!;
  assertEquals(item.status, 'matched');
  assertEquals(item.matched.map((i) => i.sourceId).sort(), ['e1', 'p1', 'p2']);
});

Deno.test('ReconcileStatement should match a payment with several bank expenses of those days that add up to it', async () => {
  const { reconcile } = setUp([
    expense('e1', '2026-10-20', 'transfer', 19000),
    expense('e2', '2026-10-20', 'transfer', 9500),
    expense('e3', '2026-10-20', 'transfer', 15920),
  ]);
  const view = await reconcile(statement(
    ['2026-10-20', 'Domiciliacion Impuesto: 2.026 Abonare A.e.a.t', -15920],
    ['2026-10-20', 'Domiciliacion Impuesto: 2.026 Irpf', -28500],
  ));
  assertEquals(view.items.map((i) => i.status), ['matched', 'matched']);
  assertEquals(view.items[1]!.matched.map((i) => i.sourceId).sort(), ['e1', 'e2']);
});

Deno.test('ReconcileStatement should not match several expenses when more than one combination adds up', async () => {
  const { reconcile } = setUp([
    expense('e1', '2026-10-20', 'transfer', 10000),
    expense('e2', '2026-10-20', 'transfer', 10000),
    expense('e3', '2026-10-20', 'transfer', 10000),
  ]);
  const item = (await reconcile(statement(['2026-10-20', 'Recibo Varios', -20000]))).items[0]!;
  assertEquals(item.status === 'matched', false);
});

Deno.test('ReconcileStatement should remember what matches on its own, so it never matches another movement', async () => {
  const { reconcile, memory } = setUp([payment('oct', '2026-10-03', 'transfer', 5500)]);
  const october = statement([
    '2026-10-03',
    'Transferencia De Rosa Ruiz Duran, Concepto Ana Octubre',
    5500,
  ]);
  assertEquals((await reconcile(october)).items[0]!.status, 'matched');
  assertEquals(memory.saved.map((s) => s.targets), [[{ source: 'payment', sourceId: 'oct' }]]);
  const again = (await reconcile(october)).items[0]!;
  assertEquals([again.status, again.note], ['matched', 'Casado al conciliar.']);
  // Otro extracto, solo de noviembre: la cuota de octubre ya está casada y no se ofrece.
  const november = statement([
    '2026-11-03',
    'Transferencia De Rosa Ruiz Duran, Concepto Ana Noviembre',
    5500,
  ]);
  const item = (await reconcile(november)).items[0]!;
  assertEquals(item.proposal!.items, []);
  assertEquals(item.candidates.some((c) => c.sourceId === 'oct'), false);
});

Deno.test('ReconcileStatement should suggest charging the fee of a payer whose payment is missing', async () => {
  const { reconcile, accept, calls, memory } = setUp([]);
  const movements = statement([
    '2026-11-03',
    'Transferencia De Rosa Ruiz Duran, Concepto Ana Noviembre',
    5500,
  ]);
  const item = (await reconcile(movements)).items[0]!;
  assertEquals(item.status, 'suggested');
  assertEquals(item.note, 'Es la cuota de quien paga, que aún no está cobrada.');
  assertEquals(item.proposal!.record, null);
  assertEquals(item.proposal!.fees, [
    { studentId: 'ana', student: 'Ana Gil Ruiz', concept: 'Noviembre 2026', amountCents: 5500 },
  ]);
  assertEquals(item.proposal!.changes, [
    'Cobrar a Ana Gil Ruiz «Noviembre 2026» (55,00 €) por transferencia el 03/11/2026',
  ]);
  await accept.execute({
    movement: item.movement,
    items: [],
    record: null,
    transfer: false,
    fees: ['ana'],
  });
  assertEquals(calls, ['cobro ana 2026-11-03']);
  assertEquals(memory.saved[0]!.targets, [{ source: 'payment', sourceId: 'payment-ana' }]);
});

Deno.test('ReconcileStatement should charge the missing fee before moving a payment of an earlier month already in the bank', async () => {
  const { reconcile } = setUp([payment('oct', '2026-10-03', 'transfer', 5500)]);
  const item = (await reconcile(
    statement(['2026-11-03', 'Transferencia De Rosa Ruiz Duran, Concepto Ana Noviembre', 5500]),
  )).items[0]!;
  assertEquals(item.proposal!.items, []);
  assertEquals(item.proposal!.fees.map((f) => f.studentId), ['ana']);
  assertEquals(item.candidates.map((c) => c.sourceId), ['oct']);
});

Deno.test('AcceptReconciliation should refuse fees that do not add up to the movement', async () => {
  const { reconcile, accept } = setUp([]);
  const movement =
    (await reconcile(statement(['2026-11-03', 'Transferencia De Rosa Ruiz Duran', 9000])))
      .items[0]!.movement;
  await assertRejects(
    () => accept.execute({ movement, items: [], record: null, transfer: false, fees: ['ana'] }),
    InvalidValue,
  );
});

Deno.test('ReleaseMatch should undo a match so it is chosen again and not matched on its own', async () => {
  const { reconcile, accept, release, memory } = setUp([
    payment('p1', '2026-10-03', 'transfer', 5500),
    payment('p2', '2026-10-04', 'transfer', 5500, 'pedro'),
  ]);
  const movements = statement([
    '2026-10-03',
    'Transferencia De Rosa Ruiz Duran, Concepto Ana',
    5500,
  ]);
  const item = (await reconcile(movements)).items[0]!;
  assertEquals(item.matched.map((m) => m.sourceId), ['p1']);
  await release.execute(item.movement);
  const freed = (await reconcile(movements)).items[0]!;
  assertEquals(freed.status === 'matched', false);
  assertEquals(freed.candidates.map((c) => c.sourceId).sort(), ['p1', 'p2']);
  await accept.execute({
    movement: freed.movement,
    items: [{ source: 'payment', sourceId: 'p2' }],
    record: null,
    transfer: false,
    fees: [],
  });
  assertEquals(memory.saved[0]!.targets, [{ source: 'payment', sourceId: 'p2' }]);
  assertEquals((await reconcile(movements)).items[0]!.matched.map((m) => m.sourceId), ['p2']);
});
