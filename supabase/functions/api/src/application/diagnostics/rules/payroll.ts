// Reglas de profesorado (specs/features/diagnostico/spec.md, reglas 14 y 20).
import type { EntityRef } from '../../../domain/diagnostics/mod.ts';
import type { Candidate, FactTeacherMonth, Rule } from '../facts.ts';
import { euros, monthLabel } from './support.ts';

const teacherRef = (month: FactTeacherMonth): EntityRef => ({
  kind: 'teacher',
  id: month.teacherId,
  label: month.teacherName,
});

const hours = (minutes: number): string => `${String(minutes / 60).replace('.', ',')} h`;

/** Regla 14: mes pasado con ingresos atribuidos y sin horas ni liquidación. */
export const incomeWithoutHours: Rule = (facts) =>
  facts.teacherMonths.filter((m) =>
    m.month < facts.currentMonth && m.incomeCents > 0 && m.sessionMinutes === 0 &&
    m.settlement === null
  ).map((m): Candidate => ({
    rule: 'income_without_hours',
    entity: teacherRef(m),
    data: { month: m.month, incomeCents: m.incomeCents },
    explanation: `En ${monthLabel(m.month)} se le atribuyen ${
      euros(m.incomeCents)
    } de cuotas de sus alumnos, pero no tiene ninguna hora apuntada ni liquidación: sus clases de ese mes no constan en Profesorado.`,
    proposal:
      'Apuntar sus horas de ese mes desde Profesores → Registro de horas (o quitar sus grupos si no dio clase).',
    fix: null,
  }));

/** Regla 20: liquidación pagada cuyas horas o importe no coinciden con las sesiones del mes. */
export const settlementSessionsMismatch: Rule = (facts) =>
  facts.teacherMonths.filter((m) =>
    m.settlement !== null && m.settlement.paid &&
    (m.settlement.minutes !== m.sessionMinutes || m.settlement.amountCents !== m.sessionCostCents)
  ).map((m): Candidate => {
    const settlement = m.settlement as NonNullable<FactTeacherMonth['settlement']>;
    return {
      rule: 'settlement_sessions_mismatch',
      entity: teacherRef(m),
      data: {
        month: m.month,
        sessionMinutes: m.sessionMinutes,
        settlementMinutes: settlement.minutes,
        sessionCostCents: m.sessionCostCents,
        settlementCents: settlement.amountCents,
      },
      explanation: `La liquidación de ${monthLabel(m.month)} se pagó por ${
        hours(settlement.minutes)
      } (${euros(settlement.amountCents)}), pero las sesiones apuntadas de ese mes suman ${
        hours(m.sessionMinutes)
      } (${euros(m.sessionCostCents)}).`,
      proposal: 'Revisar el registro de horas de ese mes: una liquidación pagada no se recalcula.',
      fix: null,
    };
  });

export const payrollRules: readonly Rule[] = [incomeWithoutHours, settlementSessionsMismatch];
