import { InvalidValue, LocalDate, YearMonth } from '../../domain/common/mod.ts';
import { FiscalYear, type Transfer, Treasury } from '../../domain/accounting/mod.ts';
import {
  type BankMovement,
  BankStatement,
  counterparty,
  daysBetween,
  movementKey,
  type MovementKind,
  movementKind,
  nameScore,
  paidByCard,
  settlementDay,
  shortConcept,
  subsetsSumming,
} from '../../domain/accounting/reconciliation.ts';
import type {
  LedgerLine,
  LedgerQuery,
  SeasonClosingRepository,
  TransferRepository,
} from './mod.ts';

/**
 * Conciliación con el extracto del banco (ver conciliacion-bancaria-con-extracto.md): cada movimiento del extracto
 * cuadra con algo de la app o trae una sugerencia; lo aceptado se recuerda y lo demás se vuelve a calcular cada vez.
 */

// ---- Puertos ---------------------------------------------------------------------------------

/** Algo de la app casado con un movimiento del extracto: un movimiento del libro o un traspaso (`transfer`). */
export interface MatchTarget {
  source: string;
  sourceId: string;
}

export interface BankMatch {
  key: string;
  operationDate: string;
  amountCents: number;
  concept: string;
  targets: MatchTarget[];
}

export interface BankMatchRepository {
  matches(): Promise<BankMatch[]>;
  saveMatch(match: BankMatch): Promise<void>;
  /** La categoría elegida para cada contraparte. */
  rules(): Promise<Map<string, string>>;
  saveRule(counterparty: string, category: string): Promise<void>;
}

/** Los nombres con los que puede aparecer en el banco quien paga a un alumno: el suyo y los de sus tutores. */
export interface PayerNames {
  names(studentIds: string[]): Promise<Map<string, string[]>>;
}

/** Las operaciones de siempre con las que se aplica una sugerencia aceptada. */
export interface ReconciliationActions {
  reschedulePayment(paymentId: string, date: string): Promise<void>;
  changePaymentMethod(paymentId: string, method: string): Promise<void>;
  /** Cambia la forma de pago de un movimiento del libro que no es un cobro (gasto, liquidación, apunte…). */
  changeLineMethod(line: LedgerLine, method: string): Promise<void>;
  recordEntry(input: {
    date: string;
    kind: 'income' | 'expense';
    concept: string;
    category: string;
    method: string;
    amountCents: number;
  }): Promise<string>;
  recordTransfer(
    input: { date: string; from: string; to: string; amountCents: number; note: string },
  ): Promise<string>;
}

// ---- Vistas ----------------------------------------------------------------------------------

/** Lo de la app que se enseña junto a un movimiento del extracto. */
export interface AppItem {
  source: string;
  sourceId: string;
  date: string;
  kind: string;
  concept: string;
  category: string;
  method: string;
  amountCents: number;
}

export interface Proposal {
  /** Lo de la app que le corresponde (con los cambios que diga `changes`). */
  items: AppItem[];
  /** Lo que se cambia al aceptar, en palabras. */
  changes: string[];
  /** Un ingreso o gasto nuevo. */
  record: { kind: 'income' | 'expense'; concept: string; category: string; method: string } | null;
  /** Un traspaso nuevo entre banco y caja. */
  transfer: { from: 'bank' | 'cash'; to: 'bank' | 'cash' } | null;
}

export type ItemStatus = 'matched' | 'suggested' | 'pending';

export interface ReconciliationItem {
  key: string;
  movement: BankMovement;
  kind: MovementKind;
  status: ItemStatus;
  /** Por qué cuadra o qué falta. */
  note: string;
  /** Lo que ya le corresponde (si cuadra). */
  matched: AppItem[];
  proposal: Proposal | null;
  /** Lo que se puede elegir a mano para casarlo (y lo que ya cuenta sin cambiar, en `fixed`). */
  candidates: AppItem[];
  fixed: AppItem[];
}

export interface ReconciliationView {
  from: string;
  to: string;
  bank: { openingCents: number; closingCents: number };
  app: { openingCents: number; closingCents: number };
  items: ReconciliationItem[];
}

// ---- Reglas ----------------------------------------------------------------------------------

const BANK_METHODS = new Set(['transfer', 'card']);
/** Cuántos días puede separarse un apunte de la app de su movimiento en el banco. */
const CLOSE_DAYS = { transfer: 3, expense: 31, cash: 5, search: 45 };
const MAX_CANDIDATES = 40;

/** Categoría de un gasto o ingreso nuevo cuando no hay ninguna recordada para su contraparte. */
function guessCategory(m: BankMovement): string {
  const text = m.concept.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (m.amountCents > 0) {
    return /subvencion|ayuntamiento|junta de/.test(text) ? 'grants' : 'other_income';
  }
  if (/abast|aguas|emasagra/.test(text)) return 'water';
  if (/endesa|iberdrola|repsol|naturgy|electric/.test(text)) return 'electricity';
  if (/digi|movistar|vodafone|orange|telecom/.test(text)) return 'internet';
  if (/alquiler/.test(text)) return 'rent';
  if (/federacion/.test(text)) return 'federation';
  return 'other_expenses';
}

const toItem = (l: LedgerLine): AppItem => ({
  source: l.source,
  sourceId: l.sourceId,
  date: l.date,
  kind: l.kind,
  concept: l.concept,
  category: l.category,
  method: l.method,
  amountCents: l.amountCents,
});

const transferItem = (t: Transfer): AppItem => ({
  source: 'transfer',
  sourceId: t.id.value,
  date: t.date.toString(),
  kind: 'transfer',
  concept: `Traspaso ${t.from === 'bank' ? 'del banco a caja' : 'de caja al banco'}${
    t.note ? ` · ${t.note}` : ''
  }`,
  category: '',
  method: t.to,
  amountCents: t.amount.cents,
});

const keyOf = (t: MatchTarget) => `${t.source}:${t.sourceId}`;
const sum = (items: readonly AppItem[]) => items.reduce((total, i) => total + i.amountCents, 0);
const euros = (cents: number) =>
  `${
    (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } €`;
const methodLabel = (method: string) =>
  ({ cash: 'efectivo', transfer: 'transferencia', card: 'tarjeta' } as Record<string, string>)[
    method
  ] ?? method;
const dayLabel = (iso: string) => iso.split('-').reverse().join('/');

/** Lo que cambia al pasar un cobro al banco: su forma de pago y, si se indica, su fecha. */
function paymentChanges(items: readonly AppItem[], method: string, date: string | null): string[] {
  return items.flatMap((i) => {
    const parts: string[] = [];
    if (i.method !== method) parts.push(`a ${methodLabel(method)}`);
    if (date !== null && i.date !== date) parts.push(`al ${dayLabel(date)}`);
    return parts.length
      ? [`Pasar «${i.concept}» (${euros(i.amountCents)}) ${parts.join(' y ')}`]
      : [];
  });
}

/** La fecha a la que pasa un cobro por transferencia: la del banco si la de la app está lejos o no es transferencia. */
function transferDate(item: AppItem, movement: BankMovement): string | null {
  return item.method !== 'transfer' ||
      Math.abs(daysBetween(item.date, movement.operationDate)) > CLOSE_DAYS.transfer
    ? movement.operationDate
    : null;
}

/** Los meses del libro que hay que mirar para un periodo: dos antes y dos después. */
function window(from: string, to: string): [YearMonth, YearMonth] {
  return [
    YearMonth.of(LocalDate.fromString(from)).previous().previous(),
    YearMonth.of(LocalDate.fromString(to)).next().next(),
  ];
}

// ---- Casos de uso ----------------------------------------------------------------------------

/** Cruza el extracto con la app: qué cuadra y qué se sugiere. No guarda nada. */
export class ReconcileStatement {
  constructor(
    private readonly ledger: LedgerQuery,
    private readonly transfers: TransferRepository,
    private readonly closings: SeasonClosingRepository,
    private readonly matches: BankMatchRepository,
    private readonly payers: PayerNames,
  ) {}

  async execute(movements: readonly BankMovement[]): Promise<ReconciliationView> {
    const statement = BankStatement.of(movements);
    const [first, last] = window(statement.from, statement.to);
    const lines = await this.ledger.linesBetween(first, last);
    const transfers = await this.transfers.transfersBetween(first.firstDay(), last.lastDay());
    const stored = await this.matches.matches();
    const rules = await this.matches.rules();
    const names = await this.payers.names([
      ...new Set(lines.flatMap((l) => (l.studentId ? [l.studentId] : []))),
    ]);
    const matcher = new Matcher(lines, transfers, stored, rules, names);
    return {
      from: statement.from,
      to: statement.to,
      bank: { openingCents: statement.openingCents, closingCents: statement.closingCents },
      app: {
        openingCents: await this.bankOn(LocalDate.fromString(statement.from).plusDays(-1)),
        closingCents: await this.bankOn(LocalDate.fromString(statement.to)),
      },
      items: matcher.run(statement.movements),
    };
  }

  /** El saldo del banco según la app al terminar un día. */
  private async bankOn(day: LocalDate): Promise<number> {
    const year = FiscalYear.of(day);
    let bankCents = 0;
    for (const closing of await this.closings.closings()) {
      if (closing.year.startYear < year.startYear) bankCents += closing.bankResult().cents;
    }
    const iso = day.toString();
    const lines = (await this.ledger.linesBetween(year.firstMonth(), YearMonth.of(day)))
      .filter((l) => l.date <= iso);
    const transfers = await this.transfers.transfersBetween(year.firstMonth().firstDay(), day);
    return Treasury.balances({ bankCents, cashCents: 0 }, lines, transfers).bankCents;
  }
}

/** El emparejamiento de una pasada: lo ya aceptado, lo que cuadra solo y, al final, las sugerencias. */
class Matcher {
  private readonly used = new Set<string>();
  private readonly storedByKey = new Map<string, BankMatch>();
  private readonly items: AppItem[];
  private readonly payments: AppItem[];
  private readonly studentOf = new Map<string, string>();

  constructor(
    lines: readonly LedgerLine[],
    transfers: readonly Transfer[],
    stored: readonly BankMatch[],
    private readonly rules: Map<string, string>,
    private readonly names: Map<string, string[]>,
  ) {
    this.items = [...lines.map(toItem), ...transfers.map(transferItem)]
      .sort((a, b) => a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId));
    this.payments = this.items.filter((i) => i.source === 'payment');
    for (const l of lines) if (l.studentId) this.studentOf.set(l.sourceId, l.studentId);
    for (const match of stored) {
      this.storedByKey.set(match.key, match);
      for (const t of match.targets) this.used.add(keyOf(t));
    }
  }

  run(movements: readonly BankMovement[]): ReconciliationItem[] {
    const results = new Map<number, ReconciliationItem>();
    movements.forEach((m, index) => {
      const stored = this.storedByKey.get(movementKey(m));
      if (stored) results.set(index, this.storedMatch(m, stored));
    });
    movements.forEach((m, index) => {
      if (results.has(index)) return;
      const exact = this.exact(m);
      if (exact) {
        this.take(exact);
        results.set(index, this.result(m, 'matched', 'Cuadra con la app.', { matched: exact }));
      }
    });
    // Las liquidaciones, al final: sus combinaciones no deben quitar a una transferencia el cobro con su nombre.
    const order = movements.map((m, index) => ({ m, index }))
      .sort((a, b) =>
        Number(movementKind(a.m) === 'card_settlement') -
        Number(movementKind(b.m) === 'card_settlement')
      );
    for (const { m, index } of order) {
      if (!results.has(index)) results.set(index, this.suggest(m));
    }
    return movements.map((_, index) => results.get(index)!);
  }

  private result(
    m: BankMovement,
    status: ItemStatus,
    note: string,
    parts: Partial<Pick<ReconciliationItem, 'matched' | 'proposal' | 'candidates' | 'fixed'>>,
  ): ReconciliationItem {
    return {
      key: movementKey(m),
      movement: m,
      kind: movementKind(m),
      status,
      note,
      matched: parts.matched ?? [],
      proposal: parts.proposal ?? null,
      candidates: parts.candidates ?? [],
      fixed: parts.fixed ?? [],
    };
  }

  private storedMatch(m: BankMovement, match: BankMatch): ReconciliationItem {
    const wanted = new Set(match.targets.map(keyOf));
    const matched = this.items.filter((i) => wanted.has(keyOf(i)));
    return this.result(m, 'matched', 'Casado al conciliar.', { matched });
  }

  private free(i: AppItem): boolean {
    return !this.used.has(keyOf(i));
  }

  private take(items: readonly AppItem[]): void {
    for (const i of items) this.used.add(keyOf(i));
  }

  private namesOf(i: AppItem): string[] {
    const student = this.studentOf.get(i.sourceId);
    return student ? this.names.get(student) ?? [] : [];
  }

  /** Cuánto se parece el concepto del banco a quien paga un cobro. */
  private score(m: BankMovement, i: AppItem): number {
    return Math.max(0, ...this.namesOf(i).map((n) => nameScore(m.concept, n)));
  }

  private near(i: AppItem, date: string, days: number): boolean {
    return Math.abs(daysBetween(i.date, date)) <= days;
  }

  /** Cobros con tarjeta del día de una liquidación. */
  private cardsOf(day: string): AppItem[] {
    return this.payments.filter((p) => this.free(p) && p.method === 'card' && p.date === day);
  }

  /** Lo que cuadra sin tocar nada: mismo importe, fecha cercana y forma de pago del banco. */
  private exact(m: BankMovement): AppItem[] | null {
    const amount = Math.abs(m.amountCents);
    const kind = movementKind(m);
    if (kind === 'card_settlement') {
      const cards = this.cardsOf(settlementDay(m)!);
      return cards.length > 0 && sum(cards) === amount ? cards : null;
    }
    if (kind === 'cash_withdrawal' || kind === 'cash_deposit') {
      const to = kind === 'cash_withdrawal' ? 'cash' : 'bank';
      const transfer = this.items.find((i) =>
        i.source === 'transfer' && this.free(i) && i.method === to && i.amountCents === amount &&
        this.near(i, m.operationDate, CLOSE_DAYS.cash)
      );
      return transfer ? [transfer] : null;
    }
    if (kind === 'income') {
      const close = this.items.filter((i) =>
        this.free(i) && i.kind === 'income' && i.method === 'transfer' &&
        this.near(i, m.operationDate, CLOSE_DAYS.transfer)
      );
      const single = close.filter((i) => i.amountCents === amount)
        .sort((a, b) =>
          this.score(m, b) - this.score(m, a) ||
          Math.abs(daysBetween(a.date, m.operationDate)) -
            Math.abs(daysBetween(b.date, m.operationDate))
        )[0];
      if (single) return [single];
      // Varios cobros de la misma familia en una transferencia.
      const family = close.filter((i) => i.source === 'payment' && this.score(m, i) >= 2);
      const combos = subsetsSumming(family.map((i) => i.amountCents), amount);
      return combos.length === 1 ? combos[0]!.map((index) => family[index]!) : null;
    }
    const expense =
      this.items.filter((i) =>
        this.free(i) && i.kind === 'expense' && BANK_METHODS.has(i.method) &&
        i.amountCents === amount &&
        this.near(i, m.operationDate, CLOSE_DAYS.expense)
      ).sort((a, b) =>
        Math.abs(daysBetween(a.date, m.operationDate)) -
        Math.abs(daysBetween(b.date, m.operationDate))
      )[0];
    return expense ? [expense] : null;
  }

  private suggest(m: BankMovement): ReconciliationItem {
    const kind = movementKind(m);
    if (kind === 'card_settlement') return this.suggestSettlement(m);
    if (kind === 'cash_withdrawal' || kind === 'cash_deposit') {
      const transfer = kind === 'cash_withdrawal'
        ? { from: 'bank' as const, to: 'cash' as const }
        : { from: 'cash' as const, to: 'bank' as const };
      return this.result(
        m,
        'suggested',
        'No hay ningún traspaso entre banco y caja que le corresponda.',
        {
          proposal: {
            items: [],
            changes: [
              `Apuntar un traspaso de ${euros(Math.abs(m.amountCents))} ${
                kind === 'cash_withdrawal' ? 'del banco a caja' : 'de caja al banco'
              } el ${dayLabel(m.operationDate)}`,
            ],
            record: null,
            transfer,
          },
        },
      );
    }
    return kind === 'income' ? this.suggestIncome(m) : this.suggestExpense(m);
  }

  /** Los cobros que pueden completar una liquidación: los que no están ya en el banco, cerca de ese día. */
  private settlementPool(day: string): AppItem[] {
    return this.payments
      .filter((p) =>
        this.free(p) && !(p.method === 'card' && p.date === day) &&
        this.near(p, day, CLOSE_DAYS.search)
      )
      .sort((a, b) => Math.abs(daysBetween(a.date, day)) - Math.abs(daysBetween(b.date, day)))
      .slice(0, MAX_CANDIDATES);
  }

  private suggestSettlement(m: BankMovement): ReconciliationItem {
    const day = settlementDay(m)!;
    const cards = this.cardsOf(day);
    const missing = m.amountCents - sum(cards);
    if (missing < 0) {
      return this.result(
        m,
        'pending',
        `En la app hay ${euros(-missing)} más con tarjeta el ${
          dayLabel(day)
        } de lo que abonó el banco.`,
        { fixed: cards },
      );
    }
    const pool = this.settlementPool(day);
    const combos = subsetsSumming(pool.map((p) => p.amountCents), missing);
    if (combos.length === 1) {
      const chosen = combos[0]!.map((index) => pool[index]!);
      this.take([...cards, ...chosen]);
      return this.result(
        m,
        'suggested',
        `Faltan ${euros(missing)} con tarjeta el ${dayLabel(day)}.`,
        {
          proposal: {
            items: [...cards, ...chosen],
            changes: paymentChanges(chosen, 'card', day),
            record: null,
            transfer: null,
          },
          candidates: pool,
          fixed: cards,
        },
      );
    }
    return this.result(
      m,
      'pending',
      combos.length === 0
        ? `Faltan ${euros(missing)} con tarjeta el ${
          dayLabel(day)
        } y ningún cobro cercano completa la cifra.`
        : `Faltan ${euros(missing)} con tarjeta el ${
          dayLabel(day)
        }: varios cobros completan la cifra, elígelos.`,
      { candidates: pool, fixed: cards },
    );
  }

  private suggestIncome(m: BankMovement): ReconciliationItem {
    const amount = m.amountCents;
    const pool = this.payments
      .filter((p) => this.free(p) && this.near(p, m.operationDate, CLOSE_DAYS.search))
      .sort((a, b) =>
        this.score(m, b) - this.score(m, a) ||
        Math.abs(daysBetween(a.date, m.operationDate)) -
          Math.abs(daysBetween(b.date, m.operationDate))
      );
    const named = pool.filter((p) => this.score(m, p) >= 2);
    const single = named.find((p) => p.amountCents === amount);
    const combos = single ? [] : subsetsSumming(named.map((p) => p.amountCents), amount);
    const chosen = single
      ? [single]
      : combos.length === 1
      ? combos[0]!.map((index) => named[index]!)
      : null;
    const candidates = pool.slice(0, MAX_CANDIDATES);
    if (chosen) {
      this.take(chosen);
      return this.result(
        m,
        'suggested',
        'Casa por importe y nombre con cobros con otra fecha o forma de pago.',
        {
          proposal: {
            items: chosen,
            changes: chosen.flatMap((i) => paymentChanges([i], 'transfer', transferDate(i, m))),
            record: null,
            transfer: null,
          },
          candidates,
        },
      );
    }
    const category = this.rules.get(counterparty(m.concept)) ?? guessCategory(m);
    return this.result(m, 'suggested', 'No hay ningún cobro ni ingreso que le corresponda.', {
      proposal: {
        items: [],
        changes: [`Apuntar un ingreso de ${euros(amount)} el ${dayLabel(m.operationDate)}`],
        record: { kind: 'income', concept: shortConcept(m.concept), category, method: 'transfer' },
        transfer: null,
      },
      candidates,
    });
  }

  private suggestExpense(m: BankMovement): ReconciliationItem {
    const amount = -m.amountCents;
    const method = paidByCard(m) ? 'card' : 'transfer';
    const pool = this.items
      .filter((i) =>
        this.free(i) && i.kind === 'expense' && this.near(i, m.operationDate, CLOSE_DAYS.search)
      )
      .sort((a, b) =>
        Number(b.amountCents === amount) - Number(a.amountCents === amount) ||
        Math.abs(daysBetween(a.date, m.operationDate)) -
          Math.abs(daysBetween(b.date, m.operationDate))
      );
    const candidates = pool.slice(0, MAX_CANDIDATES);
    const same = pool.find((i) => i.amountCents === amount);
    if (same) {
      this.take([same]);
      return this.result(
        m,
        'suggested',
        `Casa por importe con un gasto en ${methodLabel(same.method)}.`,
        {
          proposal: {
            items: [same],
            changes: same.method === 'cash' || !BANK_METHODS.has(same.method)
              ? [`Pasar «${same.concept}» (${euros(amount)}) a ${methodLabel(method)}`]
              : [],
            record: null,
            transfer: null,
          },
          candidates,
        },
      );
    }
    const category = this.rules.get(counterparty(m.concept)) ?? guessCategory(m);
    // Varios meses de un gasto pagados de una vez (el alquiler de un trimestre): los de su categoría que suman.
    const sameCategory = category === 'other_expenses'
      ? []
      : pool.filter((i) => i.category === category).slice(0, 12);
    const combos = subsetsSumming(sameCategory.map((i) => i.amountCents), amount);
    if (combos.length === 1) {
      const chosen = combos[0]!.map((index) => sameCategory[index]!);
      this.take(chosen);
      return this.result(
        m,
        'suggested',
        'Casa con varios gastos de la misma categoría pagados de una vez.',
        {
          proposal: {
            items: chosen,
            changes: chosen.filter((i) => !BANK_METHODS.has(i.method))
              .map((i) =>
                `Pasar «${i.concept}» (${euros(i.amountCents)}) a ${methodLabel(method)}`
              ),
            record: null,
            transfer: null,
          },
          candidates,
        },
      );
    }
    return this.result(m, 'suggested', 'No hay ningún gasto que le corresponda.', {
      proposal: {
        items: [],
        changes: [`Apuntar un gasto de ${euros(amount)} el ${dayLabel(m.operationDate)}`],
        record: { kind: 'expense', concept: shortConcept(m.concept), category, method },
        transfer: null,
      },
      candidates,
    });
  }
}

// ---- Aceptar ---------------------------------------------------------------------------------

export interface AcceptInput {
  movement: BankMovement;
  /** Lo de la app que le corresponde (cobros, gastos…), elegido o propuesto. */
  items: MatchTarget[];
  /** Apuntar un ingreso o gasto nuevo con este concepto y categoría. */
  record: { concept: string; category: string } | null;
  /** Apuntar el traspaso entre banco y caja. */
  transfer: boolean;
}

export class MovementAlreadyMatched extends Error {
  constructor() {
    super('Ese movimiento del banco ya está conciliado.');
    this.name = 'MovementAlreadyMatched';
  }
}

/**
 * Acepta una sugerencia (o una elección a mano): cambia lo que haga falta con las operaciones de siempre y recuerda
 * qué le corresponde al movimiento del extracto.
 */
export class AcceptReconciliation {
  constructor(
    private readonly ledger: LedgerQuery,
    private readonly transfers: TransferRepository,
    private readonly matches: BankMatchRepository,
    private readonly actions: ReconciliationActions,
  ) {}

  async execute(input: AcceptInput): Promise<void> {
    const m = BankStatement.of([input.movement]).movements[0]!;
    const key = movementKey(m);
    const stored = await this.matches.matches();
    if (stored.some((s) => s.key === key)) throw new MovementAlreadyMatched();
    const used = new Set(stored.flatMap((s) => s.targets.map(keyOf)));
    const kind = movementKind(m);
    const amount = Math.abs(m.amountCents);
    const targets = await this.apply(m, kind, amount, input, used);
    await this.matches.saveMatch({
      key,
      operationDate: m.operationDate,
      amountCents: m.amountCents,
      concept: [...m.concept].slice(0, 200).join(''),
      targets,
    });
  }

  private async apply(
    m: BankMovement,
    kind: MovementKind,
    amount: number,
    input: AcceptInput,
    used: Set<string>,
  ): Promise<MatchTarget[]> {
    if (input.transfer) {
      if (kind !== 'cash_withdrawal' && kind !== 'cash_deposit') {
        throw new InvalidValue(
          'transfer',
          'Solo se apunta un traspaso al sacar o ingresar efectivo.',
        );
      }
      const id = await this.actions.recordTransfer({
        date: m.operationDate,
        from: kind === 'cash_withdrawal' ? 'bank' : 'cash',
        to: kind === 'cash_withdrawal' ? 'cash' : 'bank',
        amountCents: amount,
        note: 'Conciliación con el banco',
      });
      return [{ source: 'transfer', sourceId: id }];
    }
    if (input.record) {
      if (kind !== 'income' && kind !== 'expense') {
        throw new InvalidValue('record', 'Este movimiento no se apunta como ingreso ni gasto.');
      }
      const recordKind = kind;
      const id = await this.actions.recordEntry({
        date: m.operationDate,
        kind: recordKind,
        concept: input.record.concept,
        category: input.record.category,
        method: kind === 'expense' && paidByCard(m) ? 'card' : 'transfer',
        amountCents: amount,
      });
      await this.matches.saveRule(counterparty(m.concept), input.record.category);
      return [{ source: 'manual', sourceId: id }];
    }
    return await this.link(m, kind, amount, input.items, used);
  }

  /** Casa el movimiento con lo elegido, pasándolo al banco (y al día de la liquidación, si es tarjeta). */
  private async link(
    m: BankMovement,
    kind: MovementKind,
    amount: number,
    targets: MatchTarget[],
    used: Set<string>,
  ): Promise<MatchTarget[]> {
    if (targets.length === 0) throw new InvalidValue('items', 'Elige lo que le corresponde.');
    const wanted = new Set(targets.map(keyOf));
    if (wanted.size !== targets.length) throw new InvalidValue('items', 'Hay elegidos repetidos.');
    const [first, last] = window(m.operationDate, m.operationDate);
    const lines = await this.ledger.linesBetween(first, last);
    const transfers = await this.transfers.transfersBetween(first.firstDay(), last.lastDay());
    const chosen = [...lines.map(toItem), ...transfers.map(transferItem)].filter((i) =>
      wanted.has(keyOf(i))
    );
    if (chosen.length !== targets.length) {
      throw new InvalidValue(
        'items',
        'Algo de lo elegido no está cerca de la fecha del movimiento.',
      );
    }
    if (chosen.some((i) => used.has(keyOf(i)))) {
      throw new InvalidValue(
        'items',
        'Algo de lo elegido ya está casado con otro movimiento del banco.',
      );
    }
    if (sum(chosen) !== amount) {
      throw new InvalidValue('items', 'Lo elegido no suma el importe del movimiento.');
    }
    const expected = kind === 'expense'
      ? 'expense'
      : kind === 'card_settlement' || kind === 'income'
      ? 'income'
      : 'transfer';
    if (chosen.some((i) => i.kind !== expected)) {
      throw new InvalidValue('items', 'Lo elegido no es del mismo tipo que el movimiento.');
    }
    for (const item of chosen) {
      if (kind === 'card_settlement') await this.toBank(item, 'card', settlementDay(m), lines);
      else if (kind === 'income') await this.toBank(item, 'transfer', transferDate(item, m), lines);
      else if (kind === 'expense' && !BANK_METHODS.has(item.method)) {
        await this.toBank(item, paidByCard(m) ? 'card' : 'transfer', null, lines);
      }
    }
    return chosen.map((i) => ({ source: i.source, sourceId: i.sourceId }));
  }

  private async toBank(
    item: AppItem,
    method: string,
    date: string | null,
    lines: readonly LedgerLine[],
  ): Promise<void> {
    if (item.source === 'payment') {
      if (date !== null && item.date !== date) {
        await this.actions.reschedulePayment(item.sourceId, date);
      }
      if (item.method !== method) await this.actions.changePaymentMethod(item.sourceId, method);
      return;
    }
    if (item.method === method) return;
    const line = lines.find((l) => l.source === item.source && l.sourceId === item.sourceId)!;
    await this.actions.changeLineMethod(line, method);
  }
}
