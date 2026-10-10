import { assertEquals, assertStringIncludes } from '@std/assert';

import { accountingRules } from '../../src/application/diagnostics/rules/accounting.ts';
import { entry, factsWith, invoice } from '../support/diagnostics.ts';

const ofRule = (facts: ReturnType<typeof factsWith>, rule: string) =>
  accountingRules.flatMap((r) => r(facts)).filter((c) => c.rule === rule);

Deno.test('generic_category should move entries and invoices from a generic category to their own', () => {
  const facts = factsWith({
    entries: [
      entry({
        id: 'e1',
        concept: 'Limpieza, Mª Ángeles',
        category: 'other_expenses',
        amountCents: 15000,
      }),
      entry({ id: 'e2', concept: 'Manuel, presidente', category: 'other_expenses' }),
      entry({ id: 'e3', concept: 'Recibo de la luz', category: 'utilities' }),
      entry({ id: 'e4', concept: 'Recibo Digi', category: 'utilities' }),
      entry({ id: 'e5', concept: 'Comunidad', category: 'rent' }),
      entry({ id: 'e6', concept: 'Cuota Google', category: 'utilities' }),
      entry({ id: 'e7', concept: 'Gestoría', category: 'other_expenses' }),
      entry({ id: 'e8', concept: 'Subvención limpieza', kind: 'income', category: 'grants' }),
    ],
    invoices: [
      invoice({
        id: 'i1',
        supplier: 'Repsol',
        concept: 'Consumo electrico',
        category: 'utilities',
      }),
    ],
  });
  const found = ofRule(facts, 'generic_category');
  assertEquals(found.map((c) => [c.entity.kind, c.entity.id, c.data.target]), [
    ['entry', 'e1', 'cleaning'],
    ['entry', 'e2', 'president'],
    ['entry', 'e3', 'electricity'],
    ['entry', 'e4', 'internet'],
    ['invoice', 'i1', 'electricity'],
  ]);
  assertEquals(found[0]?.data, {
    category: 'other_expenses',
    target: 'cleaning',
    concept: 'Limpieza, Mª Ángeles',
  });
  assertEquals(found[0]?.fix, {
    kind: 'set_category',
    source: 'manual',
    id: 'e1',
    category: 'cleaning',
  });
  assertEquals(found[4]?.fix, {
    kind: 'set_category',
    source: 'invoice',
    id: 'i1',
    category: 'electricity',
  });
  assertStringIncludes(found[0]?.explanation ?? '', 'Limpieza');
  assertStringIncludes(found[0]?.explanation ?? '', 'Otros gastos');
  assertEquals(found[0]?.entity.label, 'Limpieza, Mª Ángeles · 150 €');
});

Deno.test('generic_category should not propose a category the club does not have', () => {
  const facts = factsWith({
    categories: [{ code: 'other_expenses', label: 'Otros gastos', kind: 'expense' }],
    entries: [entry({ concept: 'Limpieza', category: 'other_expenses' })],
  });
  assertEquals(ofRule(facts, 'generic_category'), []);
});

Deno.test('invoice_duplicates_entry should match an invoice with an entry of the same amount or a third of it nearby', () => {
  const facts = factsWith({
    invoices: [
      invoice({
        id: 'gestoria',
        supplier: 'Consilium',
        concept: 'Gestión trimestral',
        amountCents: 32670,
        period: '2026-09',
      }),
      invoice({
        id: 'luz',
        supplier: 'Repsol',
        concept: 'Consumo',
        amountCents: 6135,
        period: '2026-10',
      }),
    ],
    entries: [
      entry({ id: 'tercio', concept: 'Gestoría', amountCents: 10890, period: '2026-09' }),
      entry({ id: 'igual', concept: 'Repsol octubre', amountCents: 6135, period: '2026-11' }),
      entry({ id: 'lejos', concept: 'Repsol', amountCents: 6135, period: '2027-01' }),
      entry({
        id: 'ingreso',
        concept: 'Donativo',
        kind: 'income',
        amountCents: 6135,
        period: '2026-10',
      }),
    ],
  });
  const found = ofRule(facts, 'invoice_duplicates_entry');
  assertEquals(found.map((c) => [c.entity.id, c.data.entryId, c.data.match]), [
    ['gestoria', 'tercio', 'third'],
    ['luz', 'igual', 'equal'],
  ]);
  assertStringIncludes(found[0]?.explanation ?? '', '326,70 €');
  assertStringIncludes(found[0]?.explanation ?? '', '108,90 €');
  assertEquals(found[0]?.fix, null);
  assertEquals(found[0]?.entity.label, 'Consilium · Gestión trimestral · 326,70 €');
});

Deno.test('teacher_expense_as_entry should flag a «Profesores» entry naming a teacher and propose an advance', () => {
  const facts = factsWith({
    teachers: [
      { id: 'jorge', fullName: 'Jorge Rivas Pérez', active: true },
      { id: 'angel', fullName: 'Ángel Castillo Rodríguez', active: true },
      { id: 'manuel1', fullName: 'Manuel Orantes Martín', active: true },
      { id: 'manuel2', fullName: 'Manuel Orantes Taboada', active: true },
    ],
    entries: [
      entry({
        id: 'e1',
        concept: 'Pago de más a Jorge Rivas Pérez en septiembre',
        category: 'teachers',
        amountCents: 9000,
        date: '2026-09-30',
      }),
      entry({
        id: 'e2',
        concept: 'Angel, Seguridad Social',
        category: 'teachers',
        amountCents: 11599,
      }),
      entry({
        id: 'e3',
        concept: 'Clases, Manuel Orantes Martín',
        category: 'teachers',
        amountCents: 15000,
      }),
      entry({ id: 'e4', concept: 'Manuel, extras', category: 'teachers', amountCents: 1000 }),
      entry({
        id: 'e5',
        concept: 'Curso de árbitro, Jorge Rivas',
        category: 'federation',
        amountCents: 9000,
      }),
      entry({ id: 'e6', concept: 'Material', category: 'teachers', amountCents: 500 }),
    ],
  });
  const found = ofRule(facts, 'teacher_expense_as_entry');
  assertEquals(found.map((c) => [c.entity.id, c.data.teacherId]), [
    ['e1', 'jorge'],
    ['e2', 'angel'],
    ['e3', 'manuel1'],
  ]);
  assertEquals(found[0]?.data, { teacherId: 'jorge', amountCents: 9000, date: '2026-09-30' });
  assertEquals(found[0]?.fix, { kind: 'entry_to_advance', entryId: 'e1', teacherId: 'jorge' });
  assertStringIncludes(found[0]?.proposal ?? '', 'anticipo');
  assertStringIncludes(found[0]?.proposal ?? '', 'Jorge Rivas Pérez');
});
