// Ayudas comunes a las reglas: textos en español, normalización de nombres y la aritmética de los descuentos.
import { Money, YearMonth } from '../../../domain/common/mod.ts';
import type { EntityRef } from '../../../domain/diagnostics/mod.ts';
import type { FactStudent } from '../facts.ts';

export const euros = (cents: number): string => Money.cents(cents).format();

/** «octubre de 2026». */
export function monthLabel(month: string): string {
  return YearMonth.fromString(month).label();
}

/** «2 h», «1,5 h». */
export function hoursLabel(hours: number): string {
  return `${String(Math.round(hours * 100) / 100).replace('.', ',')} h`;
}

/** Minúsculas, sin tildes ni signos, espacios simples: para comparar nombres, emails y conceptos. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ@. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function digitsOf(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function studentRef(student: FactStudent): EntityRef {
  return { kind: 'student', id: student.id, label: student.fullName };
}

/**
 * Importe de una cuota con el descuento familiar y el de pago adelantado sumados sobre la tarifa base (la misma
 * cuenta que hace Cobros al recalcular): con 40 €, 10 % familiar y 20 % de temporada, 28 €.
 */
export function discountedFee(student: FactStudent, prepaymentPercent: number): number {
  const family = student.familyDiscount ? student.familyPercent : 0;
  if (prepaymentPercent <= 0) return student.feeCents;
  if (family <= 0) {
    return Money.cents(student.feeCents).minus(
      Money.cents(student.feeCents).percent(prepaymentPercent),
    ).cents;
  }
  return Math.round(
    (student.feeCents * Math.max(0, 100 - family - prepaymentPercent)) / (100 - family),
  );
}

export const isActive = (student: FactStudent): boolean => student.status === 'active';
