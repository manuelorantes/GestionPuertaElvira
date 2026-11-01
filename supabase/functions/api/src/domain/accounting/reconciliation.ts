import { InvalidValue, LocalDate } from '../common/mod.ts';

/**
 * Conciliación con el extracto del banco: sus movimientos, qué es cada uno y con qué se casa en la app
 * (ver conciliacion-bancaria-con-extracto.md).
 */

/** Un movimiento del extracto tal como lo lee la web: fechas ISO, importe con signo y saldo tras él, en céntimos. */
export interface BankMovement {
  operationDate: string;
  valueDate: string;
  concept: string;
  amountCents: number;
  balanceCents: number;
}

export type MovementKind =
  | 'card_settlement'
  | 'cash_withdrawal'
  | 'cash_deposit'
  | 'income'
  | 'expense';

/** El extracto ordenado del más antiguo al más reciente, con sus saldos comprobados. */
export class BankStatement {
  private constructor(readonly movements: readonly BankMovement[]) {}

  /**
   * Los bancos listan del más reciente al más antiguo: se acepta cualquiera de los dos órdenes, siempre que cada saldo
   * sea el anterior más el importe.
   */
  static of(movements: readonly BankMovement[]): BankStatement {
    if (movements.length === 0) {
      throw new InvalidValue('movements', 'El extracto no tiene movimientos.');
    }
    for (const m of movements) {
      LocalDate.fromString(m.operationDate);
      LocalDate.fromString(m.valueDate);
      if (
        !Number.isInteger(m.amountCents) || !Number.isInteger(m.balanceCents) || m.amountCents === 0
      ) {
        throw new InvalidValue('movements', 'Hay un movimiento sin importe.');
      }
    }
    const chained = (list: readonly BankMovement[]) =>
      list.every((m, i) => i === 0 || list[i - 1]!.balanceCents + m.amountCents === m.balanceCents);
    if (chained(movements)) return new BankStatement([...movements]);
    const reversed = [...movements].reverse();
    if (chained(reversed)) return new BankStatement(reversed);
    throw new InvalidValue(
      'movements',
      'Los saldos del extracto no encadenan: falta algún movimiento.',
    );
  }

  get from(): string {
    return this.movements[0]!.operationDate;
  }

  get to(): string {
    return this.movements[this.movements.length - 1]!.operationDate;
  }

  /** Lo que había antes del primer movimiento. */
  get openingCents(): number {
    const first = this.movements[0]!;
    return first.balanceCents - first.amountCents;
  }

  get closingCents(): number {
    return this.movements[this.movements.length - 1]!.balanceCents;
  }
}

/** Sin tildes, en minúsculas y con los espacios normalizados: para comparar textos del banco con los de la app. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * La huella de un movimiento: lo identifica aunque el extracto se suba otra vez, se solape con otro o venga en otro
 * formato (el PDF corta algunos conceptos, así que el concepto no cuenta; el saldo tras él ya lo hace único).
 */
export function movementKey(m: BankMovement): string {
  return [m.operationDate, m.valueDate, m.amountCents, m.balanceCents].join('|');
}

const SETTLEMENT = /liquidacion efectuada el (\d{2})\/(\d{2})\/(\d{4})/i;

export function movementKind(m: BankMovement): MovementKind {
  const concept = normalizeText(m.concept);
  if (m.amountCents > 0 && SETTLEMENT.test(m.concept.normalize('NFD').replace(/[̀-ͯ]/g, ''))) {
    return 'card_settlement';
  }
  if (m.amountCents < 0 && /disposicion efectivo|reintegro|retirada de efectivo/.test(concept)) {
    return 'cash_withdrawal';
  }
  if (m.amountCents > 0 && /ingreso (en )?efectivo|ingreso de efectivo/.test(concept)) {
    return 'cash_deposit';
  }
  return m.amountCents > 0 ? 'income' : 'expense';
}

/** El día de las ventas con tarjeta que abona una liquidación del datáfono. */
export function settlementDay(m: BankMovement): string | null {
  const match = SETTLEMENT.exec(m.concept.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** Un gasto pagado con la tarjeta del club (no por transferencia ni recibo). */
export function paidByCard(m: BankMovement): boolean {
  return /contactless|tarjeta|tarj /.test(normalizeText(m.concept));
}

/**
 * Quién cobra o paga, sacado del concepto: la empresa de un recibo, el destinatario o el ordenante de una transferencia,
 * o el comercio de una compra. Sirve para recordar la categoría elegida.
 */
export function counterparty(concept: string): string {
  const text = concept.replace(/\s+/g, ' ').trim();
  const patterns = [
    /^recibo (.+?)(?:,| n[ºo°] | concepto|$)/i,
    /a favor de (.+?)(?: concepto|,|$)/i,
    /transferencia (?:inmediata )?de (.+?)(?:,| concepto|$)/i,
    /(?:contactless|compra) en (.+?)(?:,|$)/i,
    /^compra (.+?)(?:,|$)/i,
    /^domiciliacion (.+?)(?:\d|,|$)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return normalizeText(text).split(' ').slice(0, 4).join(' ');
}

/** Un concepto corto para apuntar el movimiento (el del banco, sin referencias largas). */
export function shortConcept(concept: string): string {
  const text = concept.replace(/\s+/g, ' ').trim()
    .replace(/\s*(?:N[ºo°]\s*Recibo|Ref\. Mandato|Autorizado:|Tarjeta \d|Tarj\. :).*$/i, '')
    .replace(/,\s*$/, '');
  return [...text].slice(0, 120).join('');
}

/**
 * Cuánto se parece un texto del banco a un nombre: las palabras del nombre (de más de dos letras) que aparecen en el
 * concepto. Dos o más es un nombre reconocido.
 */
export function nameScore(concept: string, name: string): number {
  const words = new Set(normalizeText(concept).split(' '));
  return normalizeText(name).split(' ').filter((w) => w.length > 2 && words.has(w)).length;
}

/** Días entre dos fechas ISO (positivo si `b` es posterior). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Combinaciones de importes que suman `target` (índices de `amounts`), como mucho `limit`: para saber si unos cobros
 * completan una cifra de una sola forma.
 */
export function subsetsSumming(amounts: readonly number[], target: number, limit = 2): number[][] {
  const found: number[][] = [];
  const order = amounts.map((a, i) => [a, i] as const).filter(([a]) => a > 0)
    .sort((x, y) => y[0] - x[0]);
  const suffix = new Array<number>(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1]! + order[i]![0];
  let steps = 0;
  const walk = (start: number, left: number, chosen: number[]) => {
    if (found.length >= limit || ++steps > 200_000) return;
    if (left === 0) {
      found.push([...chosen].sort((a, b) => a - b));
      return;
    }
    if (start >= order.length || suffix[start]! < left) return;
    for (let i = start; i < order.length; i++) {
      const [amount, index] = order[i]!;
      if (amount > left) continue;
      // Cada cobro cuenta por separado: dos cobros del mismo importe son dos combinaciones distintas (ambiguas).
      chosen.push(index);
      walk(i + 1, left - amount, chosen);
      chosen.pop();
      if (found.length >= limit) return;
    }
  };
  walk(0, target, []);
  return found;
}
