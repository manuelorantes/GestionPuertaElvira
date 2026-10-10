// Reglas sobre los datos de los alumnos (specs/features/diagnostico/spec.md, reglas 8 a 10).
import type { Candidate, Rule } from '../facts.ts';
import { isActive, normalise, studentRef } from './support.ts';

const ADULT_AGE = 18;

/** Regla 8: adulto cuyo único tutor se llama como él y tiene teléfono: es su propio teléfono. */
export const adultGuardianIsSelf: Rule = (facts) =>
  facts.students.filter(isActive).flatMap((student) => {
    const [guardian] = student.guardians;
    if (
      student.age === null || student.age < ADULT_AGE || student.guardians.length !== 1 ||
      !guardian || guardian.phone === null || student.ownPhone !== null
    ) return [];
    const firstName = normalise(student.fullName).split(' ')[0];
    if (normalise(guardian.name).split(' ')[0] !== firstName) return [];
    return [{
      rule: 'adult_guardian_is_self',
      entity: studentRef(student),
      data: { guardian: guardian.name, phone: guardian.phone },
      explanation:
        `Tiene ${student.age} años y su único tutor es «${guardian.name}» (${guardian.phone}): parece su propio teléfono guardado como tutor, y sale en «Datos pendientes» como adulto sin teléfono.`,
      proposal: `Pasar ${guardian.phone} a su teléfono propio y quitar el tutor.`,
      fix: { kind: 'own_phone_from_guardian', studentId: student.id },
    }];
  });

/** Partículas que van en minúscula dentro de un nombre. */
const PARTICLES = new Set([
  'de',
  'la',
  'del',
  'el',
  'y',
  'los',
  'las',
  'van',
  'der',
  'di',
  'da',
  'dos',
]);

/** Nombre con espacios simples y cada palabra (salvo las partículas) con la inicial en mayúscula. */
export function correctedName(fullName: string): string {
  return fullName.trim().split(/\s+/).map((word, index) => {
    if (index > 0 && PARTICLES.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toLocaleUpperCase('es') + word.slice(1);
  }).join(' ');
}

/** Regla 9: nombres con palabras en minúscula o espacios de más. */
export const nameFormat: Rule = (facts) =>
  facts.students.filter(isActive).flatMap((student): Candidate[] => {
    const corrected = correctedName(student.fullName);
    if (corrected === student.fullName) return [];
    const reasons: string[] = [];
    if (student.fullName !== student.fullName.trim() || /\s{2,}/.test(student.fullName)) {
      reasons.push('espacios de más');
    }
    if (corrected !== student.fullName.trim().split(/\s+/).join(' ')) {
      reasons.push('palabras en minúscula');
    }
    return [{
      rule: 'name_format',
      entity: studentRef(student),
      data: { fullName: student.fullName, corrected },
      explanation: `El nombre «${student.fullName}» tiene ${reasons.join(' y ')}.`,
      proposal: `Escribirlo como «${corrected}».`,
      fix: { kind: 'rename_student', studentId: student.id, fullName: corrected },
    }];
  });

/** Regla 10: dos alumnos con el mismo número de socio. */
export const memberNumberDuplicate: Rule = (facts) => {
  const byNumber = new Map<number, typeof facts.students>();
  for (const student of facts.students) {
    byNumber.set(student.memberNumber, [...(byNumber.get(student.memberNumber) ?? []), student]);
  }
  return [...byNumber.entries()].filter(([, students]) => students.length > 1).map(
    ([number, students]): Candidate => ({
      rule: 'member_number_duplicate',
      entity: { kind: 'club', id: `member-${number}`, label: `Número de socio ${number}` },
      data: { memberNumber: number, students: students.map((s) => s.id).sort().join(', ') },
      explanation: `El número de socio ${number} lo tienen ${
        students.map((s) => s.fullName).join(' y ')
      }.`,
      proposal: 'Repartir los números desde Alumnos (cambiar el número de socio).',
      fix: null,
    }),
  );
};

export const studentRules: readonly Rule[] = [
  adultGuardianIsSelf,
  nameFormat,
  memberNumberDuplicate,
];
