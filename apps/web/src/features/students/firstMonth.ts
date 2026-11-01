import { centsFromText } from '@/features/billing/money';

import { todayIso } from './format';

/** Qué se cobra del mes de un alta a final de mes: entero, una parte o nada (empieza a pagar el siguiente). */
export type FirstMonthMode = 'full' | 'part' | 'none';

export interface FirstMonthValue {
  mode: FirstMonthMode;
  /** Lo que paga de ese mes, tal como se escribe (solo con «Una parte»). */
  amount: string;
}

/** Lo que espera la API en el alta y en «Dar de alta de nuevo». */
export interface FirstMonthPayload {
  mode: FirstMonthMode;
  amountCents?: number;
}

export const FULL_FIRST_MONTH: FirstMonthValue = { mode: 'full', amount: '' };

/** Desde este día del mes, el alta pregunta qué se cobra de ese mes. */
const LATE_JOIN_FROM_DAY = 16;

/**
 * El mes («2026-11») cuya cuota se decide al dar de alta con esa fecha: solo del día 16 en adelante del mes en curso y
 * en la temporada (septiembre a junio). Null si se cobra entero sin preguntar.
 */
export function lateJoinMonth(joinedOn: string, today = todayIso()): string | null {
  const month = joinedOn.slice(0, 7);
  if (month !== today.slice(0, 7) || Number(joinedOn.slice(8, 10)) < LATE_JOIN_FROM_DAY) {
    return null;
  }
  const number = Number(month.slice(5, 7));
  return number === 7 || number === 8 ? null : month;
}

/**
 * Lo que se envía a la API: nada si no hay que decidir o se cobra entero; `invalid` si se eligió una parte sin un
 * importe válido (no se puede guardar hasta corregirlo).
 */
export function firstMonthPayload(
  value: FirstMonthValue,
  joinedOn: string,
  hasClasses: boolean,
): FirstMonthPayload | undefined | 'invalid' {
  if (!hasClasses || lateJoinMonth(joinedOn) === null || value.mode === 'full') return undefined;
  if (value.mode === 'none') return { mode: 'none' };
  const cents = centsFromText(value.amount);
  return cents === null || cents <= 0 ? 'invalid' : { mode: 'part', amountCents: cents };
}
