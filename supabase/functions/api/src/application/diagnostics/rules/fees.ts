// Reglas de cuotas y tarifas (specs/features/diagnostico/spec.md, reglas 1 a 5).
import { Money } from '../../../domain/common/mod.ts';
import { prepaymentIn } from '../../../domain/billing/mod.ts';
import type { Candidate, FactCharge, Facts, FactStudent, Rule } from '../facts.ts';
import {
  chainedPrepayment,
  discountedFee,
  euros,
  hoursLabel,
  isActive,
  monthLabel,
  studentRef,
} from './support.ts';

const monthlyOf = (facts: Facts, student: FactStudent): FactCharge[] =>
  facts.charges.filter((c) => c.studentId === student.id && c.kind === 'monthly');

const live = (charge: FactCharge): boolean => charge.status !== 'cancelled';

const percentsOf = (facts: Facts): number[] => facts.prepayments.map((p) => p.percent);

const PROPOSAL_FIX_FROM_RECORD =
  'Inscribirlo en su grupo o darlo de baja desde su ficha; el diagnóstico dejará de mostrarlo solo.';

/**
 * Regla 1: una cuota del mes en curso o futura que no es la que sale hoy de sus horas y descuentos. Los alumnos sin
 * grupos son de la regla 2. Si la diferencia es un pago adelantado sin apuntar (las importadas de la hoja), se propone
 * apuntarlo, también en los meses ya pasados.
 */
export const feeMismatch: Rule = (facts) => {
  const found: Candidate[] = [];
  for (const student of facts.students.filter((s) => isActive(s) && s.groups.length > 0)) {
    for (const charge of monthlyOf(facts, student)) {
      if (charge.manual || !live(charge)) continue;
      if (!facts.seasonMonths.includes(charge.period)) continue;
      // Los descuentos aplicados en cadena son de la regla siguiente.
      if (chainedPrepayment(student, charge.amountCents, percentsOf(facts)) !== null) continue;
      const unnoted = unnotedPrepayment(facts, student, charge);
      if (unnoted !== null) {
        found.push(unnoted);
        continue;
      }
      if (charge.period < facts.currentMonth) continue;
      const expected = discountedFee(student, charge.discountPercent);
      if (expected === charge.amountCents) continue;
      found.push({
        rule: 'fee_mismatch',
        entity: studentRef(student),
        data: { month: charge.period, amountCents: charge.amountCents, expectedCents: expected },
        explanation: feeExplanation(student, charge, expected),
        proposal: `Ajustar la cuota de ${monthLabel(charge.period)} a ${
          euros(expected)
        }: lo cobrado se reparte de nuevo y la diferencia queda pendiente o como saldo a favor. Si lo que falla es su horario, descarta el hallazgo y corrígelo desde su ficha.`,
        fix: { kind: 'reprice_charge', studentId: student.id, month: charge.period },
      });
    }
  }
  return found;
};

/**
 * La cuota lleva un descuento de pago adelantado de la tarifa que no tiene apuntado: se apunta sin tocar el importe.
 * Para no confundirlo con un importe equivocado, el alumno tiene que tener al menos los meses que pide ese descuento
 * con el mismo importe y sin porcentaje apuntado.
 */
function unnotedPrepayment(
  facts: Facts,
  student: FactStudent,
  charge: FactCharge,
): Candidate | null {
  if (charge.discountPercent > 0) return null;
  const family = student.familyDiscount ? student.familyPercent : 0;
  const alike =
    monthlyOf(facts, student).filter((c) =>
      live(c) && !c.manual && c.discountPercent === 0 && c.amountCents === charge.amountCents
    ).length;
  const percent = prepaymentIn(
    Money.cents(charge.amountCents),
    Money.cents(student.feeCents),
    facts.prepayments.filter((p) => alike >= p.months).map((p) => p.percent),
    family,
  );
  if (percent === null) return null;
  return {
    rule: 'fee_mismatch',
    entity: studentRef(student),
    data: { month: charge.period, amountCents: charge.amountCents, discountPercent: percent },
    explanation: `La cuota de ${monthLabel(charge.period)} es de ${
      euros(charge.amountCents)
    }: sobre su cuota de ${
      euros(student.feeCents)
    } lleva un ${percent} % de pago adelantado que no tiene apuntado${
      family > 0 ? ', así que en su ficha solo se ve el descuento familiar' : ''
    }.`,
    proposal: `Apuntar en la cuota el ${percent} % de pago adelantado, sin cambiar su importe.`,
    fix: { kind: 'note_discount', studentId: student.id, month: charge.period, percent },
  };
}

function feeExplanation(student: FactStudent, charge: FactCharge, expected: number): string {
  const discounts: string[] = [];
  if (student.familyDiscount) discounts.push(`descuento familiar del ${student.familyPercent} %`);
  if (charge.discountPercent > 0) {
    discounts.push(`pago adelantado del ${charge.discountPercent} %`);
  }
  const withDiscounts = discounts.length > 0 ? ` con ${discounts.join(' y ')}` : '';
  const privateLessons = student.privateLessonsCents > 0
    ? ` y clases particulares por ${euros(student.privateLessonsCents)} al mes`
    : '';
  const state = charge.status === 'paid'
    ? 'cobrada'
    : charge.coveredCents > 0
    ? 'pagada en parte'
    : 'sin cobrar';
  return `La cuota de ${monthLabel(charge.period)} es de ${
    euros(charge.amountCents)
  } (${state}). Hoy hace ${hoursLabel(student.weeklyHours)} semanales (tarifa de ${
    euros(student.tierCents)
  })${privateLessons}${withDiscounts}: le corresponden ${euros(expected)}.`;
}

export const CHAINED_EXTRA_CONCEPT = 'Extra por error en el cálculo de varios descuentos';

/**
 * Regla «Descuentos aplicados en cadena»: cuotas de la temporada (también pasadas y cobradas) cuyo importe sale de
 * aplicar el descuento familiar y después el de pago adelantado, en vez de sumarlos. Un hallazgo por alumno.
 */
export const chainedDiscounts: Rule = (facts) =>
  facts.students.filter((s) => isActive(s) && s.familyDiscount).flatMap((student): Candidate[] => {
    const matches = monthlyOf(facts, student)
      .filter((c) => !c.manual && live(c) && facts.seasonMonths.includes(c.period))
      .flatMap((c) => {
        const chained = chainedPrepayment(student, c.amountCents, percentsOf(facts));
        return chained === null ? [] : [{ charge: c, ...chained }];
      })
      .sort((a, b) => a.charge.period.localeCompare(b.charge.period));
    const first = matches[0];
    if (!first) return [];
    const extraCents = matches.reduce((sum, m) => sum + m.charge.amountCents - m.additiveCents, 0);
    const paidExtraCents = matches.reduce(
      (sum, m) =>
        sum + Math.max(0, Math.min(m.charge.coveredCents, m.charge.amountCents) - m.additiveCents),
      0,
    );
    const months = matches.map((m) => m.charge.period);
    const total = student.familyPercent + first.percent;
    return [{
      rule: 'chained_discounts',
      entity: studentRef(student),
      data: { months: months.join(','), percent: first.percent, extraCents },
      explanation: `En ${matches.length} ${matches.length === 1 ? 'cuota' : 'cuotas'} (${
        months.map(monthLabel).join(', ')
      }) se aplicó el ${student.familyPercent} % familiar y después el ${first.percent} % de pago adelantado (${
        euros(first.chainedCents)
      }), en vez de sumarlos (${total} %: ${euros(first.additiveCents)}). Son ${
        euros(extraCents)
      } de más${paidExtraCents > 0 ? `, de los que ya ha pagado ${euros(paidExtraCents)}` : ''}.`,
      proposal: `Dejar cada cuota en ${
        euros(first.additiveCents)
      } con el ${first.percent} % apuntado, descontar la diferencia de cada recibo (línea «Corrección») y registrar aparte un cobro de ${
        euros(paidExtraCents)
      } con el concepto «${CHAINED_EXTRA_CONCEPT}», que queda como saldo a favor.`,
      fix: { kind: 'unchain_discounts', studentId: student.id, months, percent: first.percent },
    }];
  });

/** Regla 2: alumno activo sin grupos con cuotas del mes en curso o futuras. */
export const chargeWithoutGroup: Rule = (facts) =>
  facts.students.filter((s) => isActive(s) && s.groups.length === 0).flatMap((student) => {
    const current = monthlyOf(facts, student).filter((c) =>
      live(c) && c.period >= facts.currentMonth
    );
    if (current.length === 0) return [];
    const months = current.map((c) => c.period).sort();
    return [{
      rule: 'charge_without_group',
      entity: studentRef(student),
      data: {
        months: months.join(', '),
        amountCents: current.reduce((sum, c) => sum + c.amountCents, 0),
      },
      explanation: `No está en ningún grupo, pero tiene cuota mensual de ${
        months.map(monthLabel).join(', ')
      } (${
        current.filter((c) => c.coveredCents > 0).length
      } de ${current.length} con algo cobrado).`,
      proposal: PROPOSAL_FIX_FROM_RECORD,
      fix: null,
    }];
  });

/** Regla 3: alumno activo sin grupos que pagó algún mes anterior y no tiene cuota del mes en curso. */
export const paidButNoGroup: Rule = (facts) =>
  facts.students.filter((s) => isActive(s) && s.groups.length === 0).flatMap((student) => {
    const charges = monthlyOf(facts, student).filter(live);
    if (charges.some((c) => c.period >= facts.currentMonth)) return [];
    const paid = charges.filter((c) => c.coveredCents > 0).sort((a, b) =>
      a.period.localeCompare(b.period)
    );
    const last = paid.at(-1);
    if (!last) return [];
    return [{
      rule: 'paid_but_no_group',
      entity: studentRef(student),
      data: { lastPaidMonth: last.period, amountCents: last.coveredCents },
      explanation: `Pagó ${euros(last.coveredCents)} de la cuota de ${
        monthLabel(last.period)
      } y hoy no está en ningún grupo ni tiene cuota de ${monthLabel(facts.currentMonth)}.`,
      proposal: PROPOSAL_FIX_FROM_RECORD,
      fix: null,
    }];
  });

/** Regla 4: socio sin clases que no ha pagado nunca nada y tiene la cuota de socio pendiente. */
export const memberNeverPaid: Rule = (facts) =>
  facts.students.filter((s) => isActive(s) && s.groups.length === 0).flatMap((student) => {
    if (facts.payments.some((p) => p.studentId === student.id)) return [];
    const membership = facts.charges.find((c) =>
      c.studentId === student.id && c.kind === 'membership' && live(c) && c.coveredCents === 0
    );
    if (!membership) return [];
    return [{
      rule: 'member_never_paid',
      entity: studentRef(student),
      data: { joinedOn: student.joinedOn, membershipCents: membership.amountCents },
      explanation: `Socio sin clases desde el ${
        student.joinedOn.split('-').reverse().join('/')
      }, sin ningún cobro y con la cuota de socio (${euros(membership.amountCents)}) pendiente.`,
      proposal: 'Cobrarle la cuota de socio o darlo de baja desde su ficha.',
      fix: null,
    }];
  });

/** Regla 5: todos sus grupos empiezan después de un mes que ya tiene pagado. */
export const enrolmentAfterPayment: Rule = (facts) =>
  facts.students.filter((s) => isActive(s) && s.groups.length > 0).flatMap((student) => {
    const since = student.groups.map((g) => g.since).sort()[0] ?? '';
    const paid = monthlyOf(facts, student).filter((c) =>
      live(c) && c.coveredCents > 0 && c.period < since.slice(0, 7)
    ).sort((a, b) => a.period.localeCompare(b.period));
    const first = paid[0];
    if (!first) return [];
    const canMove = student.joinedOn < since;
    return [{
      rule: 'enrolment_after_payment',
      entity: studentRef(student),
      data: { since, paidMonth: first.period, joinedOn: student.joinedOn },
      explanation: `Está en sus grupos desde el ${
        since.split('-').reverse().join('/')
      }, pero tiene pagada la cuota de ${monthLabel(first.period)} (${
        euros(first.coveredCents)
      }). Su alta en el club es del ${student.joinedOn.split('-').reverse().join('/')}.`,
      proposal: canMove
        ? `Poner «En el grupo desde» el ${
          student.joinedOn.split('-').reverse().join('/')
        } en los grupos que empiezan después (${
          student.groups.filter((g) => g.since > student.joinedOn).map((g) => g.name).join(', ')
        }).`
        : 'Revisar desde su ficha la fecha de alta y la de sus grupos.',
      fix: canMove
        ? {
          kind: 'set_enrolment_start',
          studentId: student.id,
          groupIds: student.groups.filter((g) => g.since > student.joinedOn).map((g) => g.id),
          date: student.joinedOn,
        }
        : null,
    }];
  });

export const feeRules: readonly Rule[] = [
  feeMismatch,
  chainedDiscounts,
  chargeWithoutGroup,
  paidButNoGroup,
  memberNeverPaid,
  enrolmentAfterPayment,
];
