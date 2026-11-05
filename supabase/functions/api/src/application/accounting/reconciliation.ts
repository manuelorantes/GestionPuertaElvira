import { InvalidValue, LocalDate, Money, YearMonth } from '../../domain/common/mod.ts';
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
 * cuadra con algo de la app o trae una sugerencia; lo que cuadra y lo aceptado se recuerdan y lo demás se vuelve a
 * calcular cada vez.
 */

// ---- Puertos ---------------------------------------------------------------------------------

/** Algo de la app casado con un movimiento del extracto: un movimiento del libro o un traspaso (`transfer`). */
export interface MatchTarget {
  source: string;
  sourceId: string;
}

/**
 * Un movimiento del extracto ya conciliado. Sin `targets`, es uno cuyo casamiento se deshizo: no vuelve a casar solo y
 * espera a que se elija lo suyo.
 */
export interface BankMatch {
  key: string;
  operationDate: string;
  amountCents: number;
  concept: string;
  targets: MatchTarget[];
}

export interface BankMatchRepository {
  matches(): Promise<BankMatch[]>;
  /** Guarda el casamiento de un movimiento, sustituyendo el que tuviera. */
  saveMatch(match: BankMatch): Promise<void>;
  /** La categoría elegida para cada contraparte. */
  rules(): Promise<Map<string, string>>;
  saveRule(counterparty: string, category: string): Promise<void>;
  /** Los alumnos a los que paga cada remitente de transferencias, según lo que se casó con ellas. */
  payerStudents(): Promise<Map<string, string[]>>;
  /** Añade alumnos a los que paga un remitente. */
  savePayerStudents(counterparty: string, studentIds: string[]): Promise<void>;
}

/** Los nombres con los que puede aparecer en el banco quien paga a un alumno: el suyo y los de sus tutores. */
export interface PayerNames {
  names(studentIds: string[]): Promise<Map<string, string[]>>;
}

/** Un alumno activo y los nombres con los que puede aparecer en el banco quien le paga. */
export interface Payer {
  studentId: string;
  name: string;
  names: string[];
}

/** Lo que costaría el cobro de una cuota mensual: la pendiente más antigua o la del mes del cobro. */
export interface FeeQuote {
  concept: string;
  amountCents: number;
}

/** Las cuotas de los alumnos, para cobrar por transferencia la que llega al banco sin estar cobrada en la app. */
export interface FeePayments {
  payers(day: string): Promise<Payer[]>;
  /** Lo que costaría cobrar una cuota mensual ese día, o null si no hay nada que cobrar. */
  quote(studentId: string, date: string, kind?: 'monthly' | 'membership'): Promise<FeeQuote | null>;
  /** Cobra una cuota mensual ese día con esa forma de pago, como desde Cobros; devuelve el id del cobro. */
  register(
    studentId: string,
    date: string,
    method: 'transfer' | 'card',
    kind?: 'monthly' | 'membership',
  ): Promise<string>;
  /** Cobra a cuenta ese importe: queda como saldo a favor del alumno; devuelve el id del cobro. */
  registerCredit(
    studentId: string,
    date: string,
    method: 'transfer' | 'card',
    amountCents: number,
  ): Promise<string>;
  /** Corrige el importe de un cobro con una línea de corrección: lo de más queda a favor, lo de menos pendiente. */
  correct(paymentId: string, totalCents: number, reason: string): Promise<void>;
}

/**
 * Las operaciones de siempre con las que se aplica una sugerencia aceptada. La conciliación nunca cambia la forma de
 * pago: lo del banco solo casa con lo que ya es de tarjeta o transferencia (como mucho se corrige la fecha de un cobro).
 */
export interface ReconciliationActions {
  reschedulePayment(paymentId: string, date: string): Promise<void>;
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
  /** Primer mes al que corresponde («AAAA-MM»). */
  period: string;
}

/** Una cuota que se propone cobrar por transferencia. */
export interface FeeProposal {
  studentId: string;
  student: string;
  concept: string;
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
  /** Cuotas nuevas cobradas por transferencia. */
  fees: FeeProposal[];
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
  /** El día que llevan en la app los cobros o apuntes nuevos: el de la operación o, en una liquidación, el cobrado. */
  day: string;
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
/** Cuántos gastos se miran como mucho para combinarlos, y cuántos descuentos para restarlos de un pago. */
const MAX_COMBINED = 12;
const MAX_DEDUCTIONS = 4;

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
  period: l.period,
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
  period: t.date.toString().slice(0, 7),
});

const keyOf = (t: MatchTarget) => `${t.source}:${t.sourceId}`;
const sum = (items: readonly AppItem[]) => items.reduce((total, i) => total + i.amountCents, 0);
const euros = (cents: number) => Money.cents(cents).format();
const methodLabel = (method: string) =>
  ({ cash: 'efectivo', transfer: 'transferencia', card: 'tarjeta' } as Record<string, string>)[
    method
  ] ?? method;
const dayLabel = (iso: string) => iso.split('-').reverse().join('/');

/** Lo que cambia al casar unos cobros: su fecha, si se indica (la forma de pago nunca). */
function dateChanges(items: readonly AppItem[], date: string | null): string[] {
  return items.flatMap((i) =>
    date !== null && i.date !== date
      ? [`Pasar «${i.concept}» (${euros(i.amountCents)}) al ${dayLabel(date)}`]
      : []
  );
}

/** La fecha a la que pasa un cobro por transferencia: la del banco si la de la app está lejos. */
function transferDate(item: AppItem, movement: BankMovement): string | null {
  return Math.abs(daysBetween(item.date, movement.operationDate)) > CLOSE_DAYS.transfer
    ? movement.operationDate
    : null;
}

/** El día que llevan en la app los cobros o apuntes nuevos de un movimiento: el cobrado, en una liquidación. */
function appDay(m: BankMovement): string {
  return settlementDay(m) ?? m.operationDate;
}

/**
 * Reparte una diferencia a partes iguales entre `count` cuotas; los céntimos que sobran, a las primeras.
 * La web hace la misma cuenta para enseñarla antes de confirmar.
 */
export function evenShares(totalCents: number, count: number): number[] {
  const sign = totalCents < 0 ? -1 : 1;
  const whole = Math.floor(Math.abs(totalCents) / count);
  const rest = Math.abs(totalCents) - whole * count;
  return Array.from({ length: count }, (_, i) => sign * (whole + (i < rest ? 1 : 0)) || 0);
}

/**
 * La forma de pago que debe tener lo que casa con un movimiento: tarjeta para una liquidación del datáfono,
 * transferencia para una transferencia recibida y cualquiera del banco para un pago (lo de efectivo, nunca).
 */
function fitsMovement(item: AppItem, kind: MovementKind): boolean {
  if (kind === 'card_settlement') return item.method === 'card';
  if (kind === 'income') return item.method === 'transfer';
  if (kind === 'expense') return BANK_METHODS.has(item.method);
  return true;
}

/** Los meses del libro que hay que mirar para un periodo: dos antes y dos después. */
function window(from: string, to: string): [YearMonth, YearMonth] {
  return [
    YearMonth.of(LocalDate.fromString(from)).previous().previous(),
    YearMonth.of(LocalDate.fromString(to)).next().next(),
  ];
}

/**
 * Una sugerencia de ingreso que deja paso a cobrar una cuota: la de apuntar un ingreso suelto o la de pasar al día del
 * banco cobros de meses anteriores que ya estaban en el banco (los pagó otra transferencia).
 */
function replaceable(item: ReconciliationItem): boolean {
  const proposal = item.proposal;
  if (proposal === null) return false;
  if (proposal.record !== null) return true;
  const month = item.movement.operationDate.slice(0, 7);
  return proposal.items.length > 0 &&
    proposal.items.every((i) => i.method === 'transfer' && i.period < month);
}

function uniqueItems(items: readonly AppItem[]): AppItem[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(keyOf(i)) && seen.add(keyOf(i)));
}

function matchOf(m: BankMovement, targets: readonly MatchTarget[]): BankMatch {
  return {
    key: movementKey(m),
    operationDate: m.operationDate,
    amountCents: m.amountCents,
    concept: [...m.concept].slice(0, 200).join(''),
    targets: targets.map(({ source, sourceId }) => ({ source, sourceId })),
  };
}

// ---- Casos de uso ----------------------------------------------------------------------------

/**
 * Cruza el extracto con la app: qué cuadra y qué se sugiere. Lo que cuadra solo se recuerda, para que no vuelva a casar
 * con otro movimiento en extractos posteriores; las sugerencias no se guardan.
 */
export class ReconcileStatement {
  constructor(
    private readonly ledger: LedgerQuery,
    private readonly transfers: TransferRepository,
    private readonly closings: SeasonClosingRepository,
    private readonly matches: BankMatchRepository,
    private readonly payers: PayerNames,
    private readonly fees: FeePayments,
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
    const payerStudents = await this.matches.payerStudents();
    const matcher = new Matcher(lines, transfers, stored, rules, names, payerStudents);
    const items = await this.offerFees(
      matcher.run(statement.movements),
      statement.from,
      payerStudents,
    );
    await this.remember(items, stored);
    return {
      from: statement.from,
      to: statement.to,
      bank: { openingCents: statement.openingCents, closingCents: statement.closingCents },
      app: {
        openingCents: await this.bankOn(LocalDate.fromString(statement.from).plusDays(-1)),
        closingCents: await this.bankOn(LocalDate.fromString(statement.to)),
      },
      items,
    };
  }

  /** Guarda lo que ha cuadrado solo en esta pasada. */
  private async remember(items: readonly ReconciliationItem[], stored: readonly BankMatch[]) {
    const known = new Set(stored.map((s) => s.key));
    for (const item of items) {
      if (item.status !== 'matched' || known.has(item.key)) continue;
      known.add(item.key);
      await this.matches.saveMatch(matchOf(item.movement, item.matched));
    }
  }

  /**
   * Una transferencia de quien paga a un alumno sin cobro suyo que casar (o con uno de un mes anterior que ya estaba en
   * el banco): si sus cuotas por cobrar suman el importe de una sola forma, se propone cobrarlas.
   */
  private async offerFees(
    items: ReconciliationItem[],
    day: string,
    payerStudents: Map<string, string[]>,
  ): Promise<ReconciliationItem[]> {
    const open = items.filter((i) => i.kind === 'income' && i.status === 'suggested');
    if (open.length === 0) return items;
    const payers = await this.fees.payers(day);
    const result: ReconciliationItem[] = [];
    for (const item of items) {
      const fees = open.includes(item) && replaceable(item)
        ? await this.feesFor(item.movement, payers, payerStudents)
        : null;
      result.push(
        fees === null ? item : {
          ...item,
          note: 'Es la cuota de quien paga, que aún no está cobrada.',
          proposal: {
            items: [],
            changes: fees.map((f) =>
              `Cobrar a ${f.student} «${f.concept}» (${
                euros(f.amountCents)
              }) por transferencia el ${dayLabel(item.movement.operationDate)}`
            ),
            record: null,
            transfer: null,
            fees,
          },
          candidates: uniqueItems([...(item.proposal?.items ?? []), ...item.candidates]),
        },
      );
    }
    return result;
  }

  /** Las cuotas de los alumnos de quien transfiere: los nombrados en el concepto y a los que ya pagó antes. */
  private async feesFor(
    m: BankMovement,
    payers: readonly Payer[],
    payerStudents: Map<string, string[]>,
  ): Promise<FeeProposal[] | null> {
    const remembered = new Set(payerStudents.get(counterparty(m.concept)) ?? []);
    const named = payers.filter((p) =>
      remembered.has(p.studentId) || p.names.some((n) => nameScore(m.concept, n) >= 2)
    );
    const quoted: FeeProposal[] = [];
    for (const p of named) {
      const quote = await this.fees.quote(p.studentId, m.operationDate);
      if (quote) quoted.push({ studentId: p.studentId, student: p.name, ...quote });
    }
    const combos = subsetsSumming(quoted.map((f) => f.amountCents), m.amountCents);
    return combos.length === 1 ? combos[0]!.map((index) => quoted[index]!) : null;
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
  /** Movimientos cuyo casamiento se deshizo: no casan solos. */
  private readonly released = new Set<string>();
  private readonly items: AppItem[];
  private readonly payments: AppItem[];
  private readonly studentOf = new Map<string, string>();

  constructor(
    lines: readonly LedgerLine[],
    transfers: readonly Transfer[],
    stored: readonly BankMatch[],
    private readonly rules: Map<string, string>,
    private readonly names: Map<string, string[]>,
    private readonly payerStudents: Map<string, string[]>,
  ) {
    this.items = [...lines.map(toItem), ...transfers.map(transferItem)]
      .sort((a, b) => a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId));
    this.payments = this.items.filter((i) => i.source === 'payment');
    for (const l of lines) if (l.studentId) this.studentOf.set(l.sourceId, l.studentId);
    for (const match of stored) {
      if (match.targets.length === 0) {
        this.released.add(match.key);
        continue;
      }
      this.storedByKey.set(match.key, match);
      for (const t of match.targets) this.used.add(keyOf(t));
    }
  }

  run(movements: readonly BankMovement[]): ReconciliationItem[] {
    const results = new Map<number, ReconciliationItem>();
    const released = new Set<number>();
    movements.forEach((m, index) => {
      const stored = this.storedByKey.get(movementKey(m));
      if (stored) results.set(index, this.storedMatch(m, stored));
      if (this.released.has(movementKey(m))) released.add(index);
    });
    const decided = (index: number) => results.has(index) || released.has(index);
    // Primero lo que casa con nombre: un cobro de otra familia con el mismo importe no debe quitarle el suyo a nadie.
    for (const namedOnly of [true, false]) {
      movements.forEach((m, index) => {
        if (decided(index)) return;
        const exact = this.exact(m, namedOnly);
        if (exact) {
          this.take(exact);
          results.set(index, this.result(m, 'matched', 'Cuadra con la app.', { matched: exact }));
        }
      });
    }
    // Luego las combinaciones: varios gastos pagados de una vez o cobros menos lo que se descontó.
    movements.forEach((m, index) => {
      if (decided(index)) return;
      const combined = this.combined(m);
      if (combined) {
        this.take(combined);
        results.set(index, this.result(m, 'matched', 'Cuadra con la app.', { matched: combined }));
      }
    });
    this.samePayerGroups(movements, results, released);
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
      day: appDay(m),
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

  /**
   * Cuánto se parece el concepto del banco a quien paga un cobro: un alumno al que ya pagó ese remitente cuenta como su
   * nombre.
   */
  private score(m: BankMovement, i: AppItem): number {
    const student = this.studentOf.get(i.sourceId);
    const remembered = student !== undefined &&
      (this.payerStudents.get(counterparty(m.concept)) ?? []).includes(student);
    return Math.max(remembered ? 2 : 0, ...this.namesOf(i).map((n) => nameScore(m.concept, n)));
  }

  private near(i: AppItem, date: string, days: number): boolean {
    return Math.abs(daysBetween(i.date, date)) <= days;
  }

  /** Lo cobrado con tarjeta el día de una liquidación: cobros y apuntes de ingreso (una venta de libros…). */
  private cardsOf(day: string): AppItem[] {
    return this.items.filter((i) =>
      this.free(i) && i.kind === 'income' && i.method === 'card' && i.date === day
    );
  }

  /** Cobros por transferencia cercanos a una fecha cuyo nombre aparece en el concepto del banco. */
  private namedTransfers(concepts: readonly BankMovement[], date: string): AppItem[] {
    return this.payments.filter((p) =>
      this.free(p) && p.method === 'transfer' && this.near(p, date, CLOSE_DAYS.transfer) &&
      concepts.some((m) => this.score(m, p) >= 2)
    );
  }

  /** La única combinación de `pool` que suma `amount`, si la hay. */
  private only(pool: readonly AppItem[], amount: number): AppItem[] | null {
    const combos = subsetsSumming(pool.map((i) => i.amountCents), amount);
    return combos.length === 1 ? combos[0]!.map((index) => pool[index]!) : null;
  }

  /** Lo que cuadra sin tocar nada: mismo importe, fecha cercana y forma de pago del banco. */
  private exact(m: BankMovement, namedOnly = false): AppItem[] | null {
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
      const single = close.filter((i) =>
        i.amountCents === amount && (!namedOnly || this.score(m, i) >= 2)
      )
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
    if (namedOnly) return null;
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

  /**
   * Lo que cuadra combinando, con una sola combinación posible: varios gastos en el banco de esos días que suman el
   * pago, o los cobros de quien transfiere menos los gastos que lo nombran (lo que el club pagó por él y se descontó).
   */
  private combined(m: BankMovement): AppItem[] | null {
    const kind = movementKind(m);
    if (kind === 'expense') {
      const pool = this.items.filter((i) =>
        this.free(i) && i.kind === 'expense' && BANK_METHODS.has(i.method) &&
        this.near(i, m.operationDate, CLOSE_DAYS.transfer)
      ).slice(0, MAX_COMBINED);
      const chosen = this.only(pool, -m.amountCents);
      return chosen && chosen.length > 1 ? chosen : null;
    }
    if (kind !== 'income') return null;
    const family = this.namedTransfers([m], m.operationDate);
    if (family.length === 0) return null;
    const names = [...new Set(family.flatMap((p) => this.namesOf(p)))];
    const deductions = this.items.filter((i) =>
      this.free(i) && i.kind === 'expense' && BANK_METHODS.has(i.method) &&
      this.near(i, m.operationDate, CLOSE_DAYS.transfer) &&
      names.some((n) => nameScore(i.concept, n) >= 2)
    ).slice(0, MAX_DEDUCTIONS);
    const found: AppItem[][] = [];
    for (let mask = 1; mask < 1 << deductions.length && found.length < 2; mask++) {
      const taken = deductions.filter((_, bit) => mask & (1 << bit));
      const combos = subsetsSumming(
        family.map((p) => p.amountCents),
        m.amountCents + sum(taken),
      );
      for (const combo of combos) found.push([...combo.map((index) => family[index]!), ...taken]);
    }
    return found.length === 1 ? found[0]! : null;
  }

  /**
   * Varias transferencias de la misma persona en pocos días que juntas pagan cobros de su familia (un pago y luego «el
   * resto»): cuadran juntas, cada una con todos esos cobros.
   */
  private samePayerGroups(
    movements: readonly BankMovement[],
    results: Map<number, ReconciliationItem>,
    released: ReadonlySet<number>,
  ): void {
    const open = movements.map((m, index) => ({ m, index }))
      .filter(({ m, index }) =>
        !results.has(index) && !released.has(index) && movementKind(m) === 'income'
      );
    const groups = new Map<string, { m: BankMovement; index: number }[]>();
    for (const entry of open) {
      const who = counterparty(entry.m.concept);
      groups.set(who, [...(groups.get(who) ?? []), entry]);
    }
    for (const group of groups.values()) {
      const dates = group.map(({ m }) => m.operationDate).sort();
      if (
        group.length < 2 ||
        Math.abs(daysBetween(dates[0]!, dates[dates.length - 1]!)) > CLOSE_DAYS.transfer
      ) continue;
      const concepts = group.map(({ m }) => m);
      const pool = this.namedTransfers(concepts, dates[0]!).filter((p) =>
        this.near(p, dates[dates.length - 1]!, CLOSE_DAYS.transfer)
      );
      const chosen = this.only(pool, group.reduce((total, { m }) => total + m.amountCents, 0));
      if (!chosen) continue;
      this.take(chosen);
      for (const { m, index } of group) {
        results.set(
          index,
          this.result(
            m,
            'matched',
            `Cuadra junto con ${
              group.length - 1 === 1
                ? 'otra transferencia'
                : `otras ${group.length - 1} transferencias`
            } de la misma persona.`,
            { matched: chosen },
          ),
        );
      }
    }
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
            fees: [],
          },
        },
      );
    }
    return kind === 'income' ? this.suggestIncome(m) : this.suggestExpense(m);
  }

  /** Lo cobrado con tarjeta otro día cercano que puede completar una liquidación (apuntado con otra fecha). */
  private settlementPool(day: string): AppItem[] {
    return this.items
      .filter((p) =>
        this.free(p) && p.kind === 'income' && p.method === 'card' && p.date !== day &&
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
            changes: dateChanges(chosen, day),
            record: null,
            transfer: null,
            fees: [],
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
      .filter((p) =>
        this.free(p) && p.method === 'transfer' && this.near(p, m.operationDate, CLOSE_DAYS.search)
      )
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
            changes: chosen.flatMap((i) => dateChanges([i], transferDate(i, m))),
            record: null,
            transfer: null,
            fees: [],
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
        fees: [],
      },
      candidates,
    });
  }

  private suggestExpense(m: BankMovement): ReconciliationItem {
    const amount = -m.amountCents;
    const method = paidByCard(m) ? 'card' : 'transfer';
    const pool = this.items
      .filter((i) =>
        this.free(i) && i.kind === 'expense' && BANK_METHODS.has(i.method) &&
        this.near(i, m.operationDate, CLOSE_DAYS.search)
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
            changes: [],
            record: null,
            transfer: null,
            fees: [],
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
            changes: [],
            record: null,
            transfer: null,
            fees: [],
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
        fees: [],
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
  /** Lo que se cobra a cada alumno (por transferencia, o con tarjeta en una liquidación). */
  fees: FeeChoice[];
  /**
   * Si lo elegido no suma el importe, repartir la diferencia a partes iguales entre esas cuotas:
   * lo pagado de más queda a favor de cada alumno y lo de menos, pendiente.
   */
  adjust: boolean;
}

/**
 * Lo que se cobra a un alumno al casar un movimiento: la cuota del mes que le toca, su cuota de socio o un pago a cuenta
 * (con su importe) que queda como saldo a favor, por ejemplo de un socio provisional del que aún no se sabe a qué va.
 */
export interface FeeChoice {
  studentId: string;
  kind: 'monthly' | 'membership' | 'credit';
  /** Solo en un pago a cuenta. */
  amountCents: number | null;
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
    private readonly fees: FeePayments,
  ) {}

  async execute(input: AcceptInput): Promise<void> {
    const m = BankStatement.of([input.movement]).movements[0]!;
    const key = movementKey(m);
    const stored = await this.matches.matches();
    if (stored.some((s) => s.key === key && s.targets.length > 0)) {
      throw new MovementAlreadyMatched();
    }
    const used = new Set(stored.flatMap((s) => s.targets.map(keyOf)));
    const kind = movementKind(m);
    const amount = Math.abs(m.amountCents);
    const { targets, students } = await this.apply(m, kind, amount, input, used);
    await this.matches.saveMatch(matchOf(m, targets));
    if (students.length > 0) {
      await this.matches.savePayerStudents(counterparty(m.concept), students);
    }
  }

  /** Lo que costaría cada cuota elegida; falla si alguna no se puede cobrar o se repite. */
  private async feeQuotes(m: BankMovement, kind: MovementKind, choices: FeeChoice[]) {
    if (choices.length === 0) return [];
    if (kind !== 'income' && kind !== 'card_settlement') {
      throw new InvalidValue(
        'fees',
        'Solo se cobran cuotas con una transferencia recibida o una liquidación del datáfono.',
      );
    }
    if (new Set(choices.map((c) => `${c.studentId}:${c.kind}`)).size !== choices.length) {
      throw new InvalidValue('fees', 'Hay cuotas repetidas.');
    }
    const quotes: number[] = [];
    for (const choice of choices) {
      if (choice.kind === 'credit') {
        if (choice.amountCents === null || choice.amountCents <= 0) {
          throw new InvalidValue('fees', 'Indica cuánto se cobra a cuenta.');
        }
        quotes.push(choice.amountCents);
        continue;
      }
      const quote = await this.fees.quote(choice.studentId, appDay(m), choice.kind);
      if (quote === null) {
        throw new InvalidValue(
          'fees',
          choice.kind === 'membership'
            ? 'Algún alumno elegido ya tiene pagada la cuota de socio.'
            : 'Algún alumno elegido no tiene ninguna cuota por cobrar.',
        );
      }
      quotes.push(quote.amountCents);
    }
    return quotes;
  }

  /** Lo que se cobra en cada cuota: lo que cuesta más su parte de la diferencia, si se reparte. */
  private feeAmounts(quotes: number[], difference: number, adjust: boolean): number[] {
    if (difference === 0) return quotes;
    if (!adjust || quotes.length === 0) {
      throw new InvalidValue('items', 'Lo elegido no suma el importe del movimiento.');
    }
    const amounts = evenShares(difference, quotes.length).map((share, i) => quotes[i]! + share);
    if (amounts.some((a) => a <= 0)) {
      throw new InvalidValue('items', 'Falta tanto que alguna cuota se quedaría sin cobrar nada.');
    }
    return amounts;
  }

  private async apply(
    m: BankMovement,
    kind: MovementKind,
    amount: number,
    input: AcceptInput,
    used: Set<string>,
  ): Promise<{ targets: MatchTarget[]; students: string[] }> {
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
      return { targets: [{ source: 'transfer', sourceId: id }], students: [] };
    }
    if (input.record) {
      if (kind !== 'income' && kind !== 'expense' && kind !== 'card_settlement') {
        throw new InvalidValue('record', 'Este movimiento no se apunta como ingreso ni gasto.');
      }
      const id = await this.actions.recordEntry({
        date: appDay(m),
        kind: kind === 'expense' ? 'expense' : 'income',
        concept: input.record.concept,
        category: input.record.category,
        method: kind === 'card_settlement' || (kind === 'expense' && paidByCard(m))
          ? 'card'
          : 'transfer',
        amountCents: amount,
      });
      await this.matches.saveRule(counterparty(m.concept), input.record.category);
      return { targets: [{ source: 'manual', sourceId: id }], students: [] };
    }
    return await this.link(m, kind, amount, input, used);
  }

  /**
   * Casa el movimiento con lo elegido: cobros, gastos o traspasos que ya están en el banco (con la forma de pago que
   * corresponde al movimiento; como mucho se corrige su fecha) y, en una transferencia, cuotas nuevas de los alumnos
   * elegidos. Todo junto debe sumar el importe.
   */
  private async link(
    m: BankMovement,
    kind: MovementKind,
    amount: number,
    input: AcceptInput,
    used: Set<string>,
  ): Promise<{ targets: MatchTarget[]; students: string[] }> {
    const targets = input.items;
    if (targets.length === 0 && input.fees.length === 0) {
      throw new InvalidValue('items', 'Elige lo que le corresponde.');
    }
    const wanted = new Set(targets.map(keyOf));
    if (wanted.size !== targets.length) throw new InvalidValue('items', 'Hay elegidos repetidos.');
    const quotes = await this.feeQuotes(m, kind, input.fees);
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
    const charges = this.feeAmounts(
      quotes,
      amount - sum(chosen) - quotes.reduce((a, b) => a + b, 0),
      input.adjust,
    );
    const expected = kind === 'expense'
      ? 'expense'
      : kind === 'card_settlement' || kind === 'income'
      ? 'income'
      : 'transfer';
    if (chosen.some((i) => i.kind !== expected)) {
      throw new InvalidValue('items', 'Lo elegido no es del mismo tipo que el movimiento.');
    }
    if (chosen.some((i) => !fitsMovement(i, kind))) {
      throw new InvalidValue(
        'items',
        kind === 'card_settlement'
          ? 'Una liquidación del datáfono solo casa con lo cobrado con tarjeta.'
          : kind === 'income'
          ? 'Una transferencia solo casa con cobros por transferencia.'
          : 'Lo de efectivo no pasa por el banco: no se casa con un movimiento del extracto.',
      );
    }
    for (const item of chosen) {
      if (item.source !== 'payment') continue;
      const date = kind === 'card_settlement'
        ? settlementDay(m)
        : kind === 'income'
        ? transferDate(item, m)
        : null;
      if (date !== null && item.date !== date) {
        await this.actions.reschedulePayment(item.sourceId, date);
      }
    }
    const charged: MatchTarget[] = [];
    const method = kind === 'card_settlement' ? 'card' : 'transfer';
    for (const [i, choice] of input.fees.entries()) {
      // Un pago a cuenta se cobra ya con su parte de lo que no cuadra: todo es saldo a favor.
      const id = choice.kind === 'credit'
        ? await this.fees.registerCredit(choice.studentId, appDay(m), method, charges[i]!)
        : await this.fees.register(choice.studentId, appDay(m), method, choice.kind);
      const share = choice.kind === 'credit' ? 0 : charges[i]! - quotes[i]!;
      if (share !== 0) {
        const paid = `${kind === 'card_settlement' ? 'con tarjeta' : 'por transferencia'} el ${
          dayLabel(appDay(m))
        }`;
        await this.fees.correct(
          id,
          charges[i]!,
          share > 0
            ? `pagado de más ${paid}, ${euros(share)} a su favor`
            : `pagado de menos ${paid}, faltan ${euros(-share)}`,
        );
      }
      charged.push({ source: 'payment', sourceId: id });
    }
    const studentOf = new Map(lines.map((l) => [`${l.source}:${l.sourceId}`, l.studentId]));
    const students = kind === 'income'
      ? [
        ...new Set([
          ...chosen.flatMap((i) => studentOf.get(keyOf(i)) ?? []),
          ...input.fees.map((f) => f.studentId),
        ]),
      ]
      : [];
    return {
      targets: [...chosen.map((i) => ({ source: i.source, sourceId: i.sourceId })), ...charged],
      students,
    };
  }
}

/**
 * Lo que se le puede cobrar a un alumno con un movimiento de ese día, para repartirlo a mano: la cuota del mes y la de
 * socio, si las tiene pendientes (además, siempre, un pago a cuenta).
 */
export class QuoteFee {
  constructor(private readonly fees: FeePayments) {}

  async execute(
    studentId: string,
    day: string,
  ): Promise<{ monthly: FeeQuote | null; membership: FeeQuote | null }> {
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) {
      throw new InvalidValue('studentId', 'Elige un alumno.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new InvalidValue('day', 'Fecha no válida.');
    return {
      monthly: await this.fees.quote(studentId, day, 'monthly'),
      membership: await this.fees.quote(studentId, day, 'membership'),
    };
  }
}

/** Deshace el casamiento de un movimiento del extracto: vuelve a salir para elegir lo suyo y ya no casa solo. */
export class ReleaseMatch {
  constructor(private readonly matches: BankMatchRepository) {}

  async execute(movement: BankMovement): Promise<void> {
    const m = BankStatement.of([movement]).movements[0]!;
    await this.matches.saveMatch(matchOf(m, []));
  }
}
