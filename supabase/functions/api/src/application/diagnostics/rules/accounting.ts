// Reglas de contabilidad (specs/features/diagnostico/spec.md, reglas 11 a 13).
import type { EntityRef } from '../../../domain/diagnostics/mod.ts';
import type { Candidate, FactEntry, FactInvoice, Facts, FactTeacher, Rule } from '../facts.ts';
import { euros, monthLabel, normalise } from './support.ts';

const GENERIC_CATEGORIES = new Set(['other_expenses', 'utilities']);

/** Palabra clave en el concepto → categoría propia. El orden importa: la primera que encaja gana. */
const KEYWORDS: [RegExp, string][] = [
  [/\blimpieza\b/, 'cleaning'],
  [/\bpresidente?\b/, 'president'],
  [/\b(luz|electric\w*)\b/, 'electricity'],
  [/\bagua\b/, 'water'],
  [/\b(internet|wifi|fibra|digi)\b/, 'internet'],
  [/\b(alquiler|comunidad)\b/, 'rent'],
];

const entryRef = (entry: FactEntry): EntityRef => ({
  kind: 'entry',
  id: entry.id,
  label: `${entry.concept} · ${euros(entry.amountCents)}`,
});

const invoiceRef = (invoice: FactInvoice): EntityRef => ({
  kind: 'invoice',
  id: invoice.id,
  label: `${invoice.supplier} · ${invoice.concept} · ${euros(invoice.amountCents)}`,
});

function targetCategory(concept: string): string | null {
  const text = normalise(concept);
  return KEYWORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** Regla 11: gasto en «Otros gastos» o «Suministros» cuyo concepto habla de una categoría que existe. */
export const genericCategory: Rule = (facts) => {
  const labels = new Map(facts.categories.map((c) => [c.code, c.label]));
  const candidate = (
    entity: EntityRef,
    source: 'manual' | 'invoice',
    id: string,
    concept: string,
    category: string,
  ): Candidate[] => {
    if (!GENERIC_CATEGORIES.has(category)) return [];
    const target = targetCategory(concept);
    if (target === null || !labels.has(target)) return [];
    return [{
      rule: 'generic_category',
      entity,
      data: { category, target, concept },
      explanation: `«${concept}» está en «${
        labels.get(category) ?? category
      }», y el club tiene la categoría «${
        labels.get(target)
      }». Fuera de su categoría no cuenta en «Lo que corresponde a cada mes».`,
      proposal: `Cambiar la categoría a «${labels.get(target)}».`,
      fix: { kind: 'set_category', source, id, category: target },
    }];
  };
  return [
    ...facts.entries.filter((e) => e.kind === 'expense').flatMap((e) =>
      candidate(entryRef(e), 'manual', e.id, e.concept, e.category)
    ),
    ...facts.invoices.flatMap((i) =>
      candidate(invoiceRef(i), 'invoice', i.id, i.concept, i.category)
    ),
  ];
};

const monthDistance = (a: string, b: string): number => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.abs((ay ?? 0) * 12 + (am ?? 0) - ((by ?? 0) * 12 + (bm ?? 0)));
};

/** Regla 12: factura con un apunte manual de gasto por el mismo importe (o un tercio) en un mes cercano. */
export const invoiceDuplicatesEntry: Rule = (facts) =>
  facts.invoices.flatMap((invoice) =>
    facts.entries.filter((e) =>
      e.kind === 'expense' && monthDistance(e.period, invoice.period) <= 1
    )
      .flatMap((entry): Candidate[] => {
        const match = entry.amountCents === invoice.amountCents
          ? 'equal'
          : entry.amountCents * 3 === invoice.amountCents
          ? 'third'
          : null;
        if (match === null) return [];
        return [{
          rule: 'invoice_duplicates_entry',
          entity: invoiceRef(invoice),
          data: { entryId: entry.id, match, amountCents: entry.amountCents },
          explanation: `La factura de ${invoice.supplier} (${euros(invoice.amountCents)}, ${
            monthLabel(invoice.period)
          }) coincide con el apunte manual «${entry.concept}» de ${euros(entry.amountCents)} de ${
            monthLabel(entry.period)
          }${
            match === 'third' ? ' (un tercio: parece la misma factura trimestral)' : ''
          }. Si la factura se paga, el gasto contará dos veces.`,
          proposal: 'Decidir cuál sobra desde Facturas o Movimientos y quitarlo.',
          fix: null,
        }];
      })
  );

/** Palabras del nombre de un profesor que sirven para reconocerlo en un concepto. */
function namesOf(teacher: FactTeacher): { full: string; first: string; surnames: string[] } {
  const words = normalise(teacher.fullName).split(' ');
  return { full: words.join(' '), first: words[0] ?? '', surnames: words.slice(1) };
}

function teacherNamedIn(concept: string, teachers: FactTeacher[]): FactTeacher | null {
  const text = ` ${normalise(concept)} `;
  const has = (word: string) => text.includes(` ${word} `);
  const byFull = teachers.find((t) => text.includes(` ${namesOf(t).full} `));
  if (byFull) return byFull;
  const byFirstAndSurname = teachers.find((t) => {
    const names = namesOf(t);
    return has(names.first) && names.surnames.some(has);
  });
  if (byFirstAndSurname) return byFirstAndSurname;
  const byFirst = teachers.filter((t) => has(namesOf(t).first));
  return byFirst.length === 1 ? byFirst[0] ?? null : null;
}

/** Regla 13: apunte manual de gasto en «Profesores» que nombra a un profesor. */
export const teacherExpenseAsEntry: Rule = (facts: Facts) =>
  facts.entries.filter((e) => e.kind === 'expense' && e.category === 'teachers').flatMap(
    (entry): Candidate[] => {
      const teacher = teacherNamedIn(entry.concept, facts.teachers);
      if (teacher === null) return [];
      return [{
        rule: 'teacher_expense_as_entry',
        entity: entryRef(entry),
        data: { teacherId: teacher.id, amountCents: entry.amountCents, date: entry.date },
        explanation: `El apunte «${entry.concept}» (${euros(entry.amountCents)}, ${
          entry.date.split('-').reverse().join('/')
        }) está en «Profesores» y nombra a ${teacher.fullName}. Como gasto manual no se descuenta de ninguna liquidación ni sale en sus pagos.`,
        proposal:
          `Convertirlo en un anticipo a ${teacher.fullName}, con la misma fecha e importe, a descontar de su primera liquidación sin pagar. Si no es un pago a cuenta (seguridad social, clases sueltas…), descarta el hallazgo.`,
        fix: { kind: 'entry_to_advance', entryId: entry.id, teacherId: teacher.id },
      }];
    },
  );

export const accountingRules: readonly Rule[] = [
  genericCategory,
  invoiceDuplicatesEntry,
  teacherExpenseAsEntry,
];
