import { assertEquals, assertStringIncludes } from '@std/assert';

import { familyRules } from '../../src/application/diagnostics/rules/family.ts';
import { factsWith, student } from '../support/diagnostics.ts';

const ofRule = (facts: ReturnType<typeof factsWith>, rule: string) =>
  familyRules.flatMap((r) => r(facts)).filter((c) => c.rule === rule);

Deno.test('family_unlinked should pair active students sharing a contact email or a guardian phone', () => {
  const facts = factsWith({
    students: [
      student({ id: 'b', fullName: 'Irene Pérez Soto', contactEmail: 'Familia@Example.com' }),
      student({ id: 'a', fullName: 'Mario Pérez Soto', contactEmail: 'familia@example.com' }),
      student({
        id: 'c',
        fullName: 'Hugo Díaz Lara',
        guardians: [{ name: 'Ana', phone: '600-11-22-33' }],
      }),
      student({
        id: 'd',
        fullName: 'Lola Ruiz Mora',
        guardians: [{ name: 'Ana', phone: '600 11 22 33' }],
      }),
      student({
        id: 'e',
        fullName: 'Pepe Ruiz Mora',
        status: 'withdrawn',
        guardians: [{ name: 'Ana', phone: '600112233' }],
      }),
    ],
  });
  const found = ofRule(facts, 'family_unlinked');
  assertEquals(found.map((c) => c.data), [
    { a: 'a', b: 'b', reason: 'email' },
    { a: 'c', b: 'd', reason: 'phone' },
  ]);
  assertEquals(found[0]?.entity, { kind: 'student', id: 'a', label: 'Mario Pérez Soto' });
  assertStringIncludes(found[0]?.explanation ?? '', 'Irene Pérez Soto');
  assertStringIncludes(found[0]?.explanation ?? '', 'email');
  assertEquals(found[0]?.fix, { kind: 'link_family', a: 'a', b: 'b' });
});

Deno.test('family_unlinked should pair active students with the same two surnames and skip linked ones', () => {
  const facts = factsWith({
    students: [
      student({ id: 'luca', fullName: 'Luca Fernández Fernández' }),
      student({ id: 'fran', fullName: 'Francisco Fernandez Fernández' }),
      student({ id: 'p1', fullName: 'Pedro Molina García', siblingIds: ['p2'] }),
      student({ id: 'p2', fullName: 'Marta Molina García', siblingIds: ['p1'] }),
      student({ id: 'solo', fullName: 'Kala Rodríguez' }),
      student({ id: 'otro', fullName: 'Ana Fernández López' }),
    ],
  });
  const found = ofRule(facts, 'family_unlinked');
  assertEquals(found.map((c) => c.data), [{ a: 'fran', b: 'luca', reason: 'surnames' }]);
  assertStringIncludes(found[0]?.explanation ?? '', 'apellidos');
});

Deno.test('family_unlinked should ignore notes in brackets when comparing surnames', () => {
  const facts = factsWith({
    students: [
      student({ id: 'a', fullName: 'Candela Rodríguez Sánchez (Huétor)' }),
      student({ id: 'b', fullName: 'Claudia Cobo Sánchez (Huétor)' }),
      student({ id: 'c', fullName: 'Luna González Puche (Huétor)' }),
      student({ id: 'd', fullName: 'Mario González Puche (Huétor)' }),
    ],
  });
  assertEquals(ofRule(facts, 'family_unlinked').map((c) => c.data), [
    { a: 'c', b: 'd', reason: 'surnames' },
  ]);
});

Deno.test('family_unlinked should report each pair once even when several clues coincide', () => {
  const facts = factsWith({
    students: [
      student({
        id: 'a',
        fullName: 'Ana Gil Gil',
        contactEmail: 'x@y.es',
        guardians: [{ name: 'M', phone: '611111111' }],
      }),
      student({
        id: 'b',
        fullName: 'Bea Gil Gil',
        contactEmail: 'x@y.es',
        guardians: [{ name: 'M', phone: '611111111' }],
      }),
    ],
  });
  assertEquals(ofRule(facts, 'family_unlinked').length, 1);
});

Deno.test('family_not_mutual should flag a one-way link and propose completing it', () => {
  const facts = factsWith({
    students: [
      student({ id: 'a', fullName: 'Ana Gil Ríos', siblingIds: ['b'] }),
      student({ id: 'b', fullName: 'Bea Gil Ríos', siblingIds: [] }),
      student({ id: 'c', siblingIds: ['d'] }),
      student({ id: 'd', siblingIds: ['c'] }),
    ],
  });
  const found = ofRule(facts, 'family_not_mutual');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.data, { a: 'a', b: 'b' });
  assertEquals(found[0]?.fix, { kind: 'link_family', a: 'a', b: 'b' });
  // No se duplica con la regla de posibles familias: ya están (a medias) vinculados.
  assertEquals(ofRule(facts, 'family_unlinked').length, 0);
});
