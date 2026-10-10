import { assertEquals, assertStringIncludes } from '@std/assert';

import { studentRules } from '../../src/application/diagnostics/rules/students.ts';
import { factsWith, student } from '../support/diagnostics.ts';

const ofRule = (facts: ReturnType<typeof factsWith>, rule: string) =>
  studentRules.flatMap((r) => r(facts)).filter((c) => c.rule === rule);

Deno.test('adult_guardian_is_self should flag an adult whose only guardian is themselves', () => {
  const facts = factsWith({
    students: [
      student({
        id: 'antonio',
        fullName: 'Antonio Ruiz Cano',
        age: 61,
        guardians: [{ name: 'Antonio', phone: '611 22 33 44' }],
      }),
      student({
        id: 'jose',
        fullName: 'José Ortiz Flores',
        age: 64,
        guardians: [{ name: 'Jose Ortiz', phone: '622 33 44 55' }],
      }),
      student({
        id: 'menor',
        fullName: 'Pablo Ruiz Cano',
        age: 10,
        guardians: [{ name: 'Pablo', phone: '611 22 33 44' }],
      }),
      student({
        id: 'con-tel',
        fullName: 'Eva Mora Gil',
        age: 30,
        ownPhone: '600 00 00 00',
        guardians: [{ name: 'Eva', phone: '611 22 33 44' }],
      }),
      student({
        id: 'sin-tel',
        fullName: 'Luis Mora Gil',
        age: 30,
        guardians: [{ name: 'Luis', phone: null }],
      }),
    ],
  });
  const found = ofRule(facts, 'adult_guardian_is_self');
  assertEquals(found.map((c) => c.entity.id), ['antonio', 'jose']);
  assertEquals(found[0]?.data, { guardian: 'Antonio', phone: '611 22 33 44' });
  assertEquals(found[0]?.fix, { kind: 'own_phone_from_guardian', studentId: 'antonio' });
});

Deno.test('name_format should propose the corrected name for lowercase words and stray spaces', () => {
  const facts = factsWith({
    students: [
      student({ id: 'a', fullName: 'Lisardo garcia Jimenez' }),
      student({ id: 'b', fullName: 'Vera García de Marina kopacz' }),
      student({ id: 'c', fullName: 'Conchita el Kaoutit' }),
      student({ id: 'd', fullName: 'José Ángel de la Rosa' }),
      student({ id: 'e', fullName: 'Noa  Torres' }),
      student({ id: 'f', fullName: 'Kala Rodríguez', status: 'withdrawn' }),
    ],
  });
  const found = ofRule(facts, 'name_format');
  assertEquals(found.map((c) => c.fix), [
    { kind: 'rename_student', studentId: 'a', fullName: 'Lisardo Garcia Jimenez' },
    { kind: 'rename_student', studentId: 'b', fullName: 'Vera García de Marina Kopacz' },
    { kind: 'rename_student', studentId: 'e', fullName: 'Noa Torres' },
  ]);
  assertEquals(found[0]?.data, {
    fullName: 'Lisardo garcia Jimenez',
    corrected: 'Lisardo Garcia Jimenez',
  });
  assertStringIncludes(found[0]?.explanation ?? '', 'minúscula');
});

Deno.test('member_number_duplicate should flag each repeated number once with the students involved', () => {
  const facts = factsWith({
    students: [
      student({ id: 'a', fullName: 'Ana Gil', memberNumber: 7 }),
      student({ id: 'b', fullName: 'Bea Gil', memberNumber: 7 }),
      student({ id: 'c', fullName: 'Cris Gil', memberNumber: 8 }),
    ],
  });
  const found = ofRule(facts, 'member_number_duplicate');
  assertEquals(found.length, 1);
  assertEquals(found[0]?.entity, { kind: 'club', id: 'member-7', label: 'Número de socio 7' });
  assertEquals(found[0]?.data, { memberNumber: 7, students: 'a, b' });
  assertStringIncludes(found[0]?.explanation ?? '', 'Ana Gil');
  assertEquals(found[0]?.fix, null);
});
