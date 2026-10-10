// Reglas de integridad: cuadres que hoy se cumplen y deben seguir cumpliéndose (reglas 15 a 19 y 21). Señalan un
// fallo del sistema, así que no tienen arreglo automático.
import type { Candidate, FactCharge, FactPayment, Rule } from '../facts.ts';
import { euros, monthLabel, studentRef } from './support.ts';

const receiptNumber = (seasonYear: number, sequence: number): string =>
  `R-${seasonYear}-${String(sequence).padStart(4, '0')}`;

const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);

/** Regla 15: los recibos de cada mes frente a las líneas de cobro del libro. */
export const ledgerPaymentsMismatch: Rule = (facts) => {
  const months = facts.seasonMonths.filter((m) => m <= facts.currentMonth);
  return months.flatMap((month): Candidate[] => {
    const payments = facts.payments.filter((p) => p.paidOn.startsWith(month));
    const lines = facts.ledger.filter((l) => l.source === 'payment' && l.date.startsWith(month));
    const paymentsCents = sum(payments.map((p) => p.totalCents));
    const ledgerCents = sum(lines.map((l) => l.amountCents));
    const inLedger = new Set(lines.map((l) => l.sourceId));
    const missing = payments.filter((p) => !inLedger.has(p.id)).map((p) => p.receiptNumber).sort();
    if (paymentsCents === ledgerCents && missing.length === 0) return [];
    return [{
      rule: 'ledger_payments_mismatch',
      entity: { kind: 'club', id: `ledger-${month}`, label: `Libro de ${monthLabel(month)}` },
      data: { month, paymentsCents, ledgerCents, missing: missing.join(', ') },
      explanation: `Los recibos de ${monthLabel(month)} suman ${
        euros(paymentsCents)
      } y el libro recoge ${euros(ledgerCents)} en cobros${
        missing.length > 0 ? ` (no salen ${missing.join(', ')})` : ''
      }.`,
      proposal: 'Es un fallo del sistema: revisar el libro y los cobros de ese mes.',
      fix: null,
    }];
  });
};

/** Regla 16: la suma de lo cubierto en las cuotas frente a la suma de los recibos. */
export const coveredPaymentsMismatch: Rule = (facts) => {
  const coveredCents = sum(facts.charges.map((c) => c.coveredCents));
  const paymentsCents = sum(facts.payments.map((p) => p.totalCents));
  if (coveredCents === paymentsCents) return [];
  return [{
    rule: 'covered_payments_mismatch',
    entity: { kind: 'club', id: 'covered', label: 'Cuotas y cobros' },
    data: { coveredCents, paymentsCents },
    explanation: `Las cuotas tienen cubiertos ${euros(coveredCents)} y los recibos suman ${
      euros(paymentsCents)
    }.`,
    proposal: 'Es un fallo del sistema: revisar el reparto de los cobros entre las cuotas.',
    fix: null,
  }];
};

/** Regla 17: huecos o repetidos en la numeración de los recibos de cada temporada. */
export const receiptGaps: Rule = (facts) => {
  const seasons = new Map<number, FactPayment[]>();
  for (const p of facts.payments) {
    seasons.set(p.seasonYear, [...(seasons.get(p.seasonYear) ?? []), p]);
  }
  return [...seasons.entries()].flatMap(([seasonYear, payments]): Candidate[] => {
    const sequences = payments.map((p) => p.sequence).sort((a, b) => a - b);
    const present = new Set(sequences);
    const missing: string[] = [];
    for (let n = 1; n <= (sequences.at(-1) ?? 0); n++) {
      if (!present.has(n)) missing.push(receiptNumber(seasonYear, n));
    }
    const duplicated = [...new Set(sequences.filter((n, i) => sequences.indexOf(n) !== i))].map((
      n,
    ) => receiptNumber(seasonYear, n));
    if (missing.length === 0 && duplicated.length === 0) return [];
    return [{
      rule: 'receipt_gaps',
      entity: {
        kind: 'club',
        id: `receipts-${seasonYear}`,
        label: `Recibos de la temporada ${seasonYear}/${
          String((seasonYear + 1) % 100).padStart(2, '0')
        }`,
      },
      data: { missing: missing.join(', '), duplicated: duplicated.join(', ') },
      explanation: `${missing.length > 0 ? `Faltan los recibos ${missing.join(', ')}. ` : ''}${
        duplicated.length > 0 ? `Están repetidos ${duplicated.join(', ')}.` : ''
      }`.trim(),
      proposal: 'Es un fallo del sistema: la numeración debe ser correlativa y sin huecos.',
      fix: null,
    }];
  });
};

/** Regla 18: recibos cuya fecha es anterior a la del recibo con el número anterior. Un solo hallazgo. */
export const receiptOrder: Rule = (facts) => {
  const ordered = [...facts.payments].sort((a, b) =>
    a.seasonYear - b.seasonYear || a.sequence - b.sequence
  );
  const outOfOrder = ordered.filter((p, i) => {
    const previous = ordered[i - 1];
    return previous !== undefined && previous.seasonYear === p.seasonYear &&
      p.paidOn < previous.paidOn;
  });
  if (outOfOrder.length === 0) return [];
  return [{
    rule: 'receipt_order',
    entity: { kind: 'receipt', id: 'order', label: 'Numeración de los recibos' },
    data: { count: outOfOrder.length, first: outOfOrder[0]?.receiptNumber ?? '' },
    explanation: `${outOfOrder.length} recibo${
      outOfOrder.length === 1 ? ' lleva' : 's llevan'
    } una fecha anterior a la del recibo que ${
      outOfOrder.length === 1 ? 'le' : 'les'
    } precede en la numeración (el primero, ${
      outOfOrder[0]?.receiptNumber
    }). Suele venir de recibos importados de la hoja con su fecha real. Si aparecen más, este hallazgo vuelve a salir con el número nuevo.`,
    proposal: 'No tiene arreglo: la numeración no se cambia. Descartar si se asume.',
    fix: null,
  }];
};

function coverProblem(charge: FactCharge): boolean {
  if (charge.coveredCents > charge.amountCents) return true;
  switch (charge.status) {
    case 'paid':
      return charge.coveredCents < charge.amountCents;
    case 'partial':
      return !(charge.coveredCents > 0 && charge.coveredCents < charge.amountCents);
    case 'due':
    case 'overdue':
    case 'expected':
      return charge.coveredCents !== 0;
    default:
      return false;
  }
}

/** Regla 19: lo cubierto de una cuota no casa con su estado. */
export const chargeCoverInconsistent: Rule = (facts) => {
  const students = new Map(facts.students.map((s) => [s.id, s]));
  return facts.charges.filter(coverProblem).flatMap((charge): Candidate[] => {
    const student = students.get(charge.studentId);
    if (!student) return [];
    return [{
      rule: 'charge_cover_inconsistent',
      entity: studentRef(student),
      data: {
        month: charge.period,
        kind: charge.kind,
        status: charge.status,
        amountCents: charge.amountCents,
        coveredCents: charge.coveredCents,
      },
      explanation: `La cuota ${
        charge.kind === 'membership' ? 'de socio' : `de ${monthLabel(charge.period)}`
      } (${euros(charge.amountCents)}) está como «${charge.status}» con ${
        euros(charge.coveredCents)
      } cubiertos.`,
      proposal: 'Es un fallo del sistema: revisar el reparto de los cobros de este alumno.',
      fix: null,
    }];
  });
};

/** Regla 21: los puntos del mes de un alumno frente a la suma de sus movimientos. */
export const pointsMismatch: Rule = (facts) =>
  facts.points.filter((p) => p.points !== p.movementsSum).map((p): Candidate => ({
    rule: 'points_mismatch',
    entity: { kind: 'student', id: p.studentId, label: p.studentName },
    data: { month: p.month, points: p.points, movementsSum: p.movementsSum },
    explanation: `En ${
      monthLabel(p.month)
    } tiene ${p.points} puntos, pero sus movimientos del mes suman ${p.movementsSum}.`,
    proposal: 'Es un fallo del sistema: revisar los movimientos de puntos de ese mes.',
    fix: null,
  }));

export const integrityRules: readonly Rule[] = [
  ledgerPaymentsMismatch,
  coveredPaymentsMismatch,
  receiptGaps,
  receiptOrder,
  chargeCoverInconsistent,
  pointsMismatch,
];
