// Reglas de familia directa (specs/features/diagnostico/spec.md, reglas 6 y 7).
import type { Candidate, Facts, FactStudent, Rule } from '../facts.ts';
import { digitsOf, isActive, normalise, studentRef } from './support.ts';

type Clue = 'email' | 'phone' | 'surnames';

const CLUE_TEXT: Record<Clue, string> = {
  email: 'comparten el email de contacto',
  phone: 'comparten el teléfono de un tutor',
  surnames: 'tienen los mismos dos apellidos',
};

const linked = (a: FactStudent, b: FactStudent): boolean =>
  a.siblingIds.includes(b.id) || b.siblingIds.includes(a.id);

/** Los dos apellidos (las dos últimas palabras) de un nombre con al menos tres palabras. */
function surnamesOf(student: FactStudent): string | null {
  const words = normalise(student.fullName).split(' ');
  return words.length >= 3 ? words.slice(-2).join(' ') : null;
}

function cluesBetween(a: FactStudent, b: FactStudent): Clue | null {
  if (a.contactEmail && b.contactEmail && normalise(a.contactEmail) === normalise(b.contactEmail)) {
    return 'email';
  }
  const phonesA = new Set(a.guardians.map((g) => digitsOf(g.phone)).filter((p) => p !== null));
  if (b.guardians.some((g) => phonesA.has(digitsOf(g.phone) ?? ''))) return 'phone';
  const surnames = surnamesOf(a);
  if (surnames !== null && surnames === surnamesOf(b)) return 'surnames';
  return null;
}

/** Regla 6: dos alumnos activos con pistas de ser familia y sin vincular. Cada par sale una vez. */
export const familyUnlinked: Rule = (facts: Facts) => {
  const active = facts.students.filter(isActive).sort((x, y) => x.id.localeCompare(y.id));
  const found: Candidate[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i] as FactStudent;
      const b = active[j] as FactStudent;
      if (linked(a, b)) continue;
      const clue = cluesBetween(a, b);
      if (clue === null) continue;
      found.push({
        rule: 'family_unlinked',
        entity: studentRef(a),
        data: { a: a.id, b: b.id, reason: clue },
        explanation: `${a.fullName} y ${b.fullName} ${
          CLUE_TEXT[clue]
        } y no constan como familia directa, así que ninguno tiene el descuento familiar por el otro.`,
        proposal:
          `Vincularlos como familia directa (sus cuotas se recalculan con el descuento). Si no son familia, descarta el hallazgo.`,
        fix: { kind: 'link_family', a: a.id, b: b.id },
      });
    }
  }
  return found;
};

/** Regla 7: A tiene a B como familia y B no tiene a A. */
export const familyNotMutual: Rule = (facts: Facts) => {
  const byId = new Map(facts.students.map((s) => [s.id, s]));
  const found: Candidate[] = [];
  for (const a of facts.students) {
    for (const id of a.siblingIds) {
      const b = byId.get(id);
      if (!b || b.siblingIds.includes(a.id)) continue;
      found.push({
        rule: 'family_not_mutual',
        entity: studentRef(a),
        data: { a: a.id, b: b.id },
        explanation:
          `${a.fullName} tiene a ${b.fullName} como familia directa, pero ${b.fullName} no tiene a ${a.fullName}.`,
        proposal: 'Completar la relación para que sea mutua.',
        fix: { kind: 'link_family', a: a.id, b: b.id },
      });
    }
  }
  return found;
};

export const familyRules: readonly Rule[] = [familyUnlinked, familyNotMutual];
