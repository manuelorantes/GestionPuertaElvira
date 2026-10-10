import { assert, assertEquals } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { SqlDiagnosticsFacts } from '../../src/infrastructure/diagnostics/facts.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, createUser, db, resetDatabase } from '../support/http.ts';

const today = LocalDate.fromInstant(new Date());
const outsideSeason = Season.teachingSeason(YearMonth.of(today)) === null;

Deno.test({
  name:
    'SqlDiagnosticsFacts should load students, charges, categories, teachers and months from every context',
  ignore: outsideSeason,
  async fn() {
    await resetDatabase();
    await createUser('junta@club.es');
    const client = new ApiClient();
    await client.logIn('junta@club.es');
    const teacher = await newTeacher(client, 'Lucía Moreno Gil');
    const group = await newGroup(client, teacher);
    const created = await client.json('POST', '/api/admin/students', {
      fullName: 'Martina López Herrera',
      birthDate: '2014-03-12',
      contactEmail: 'rocio@example.com',
      guardians: [{ name: 'Rocío Herrera', phone: '612481930' }],
      imageConsent: true,
      groupIds: [group],
    });
    assertEquals(created.status, 201);
    const studentId = (created.body as { id: string }).id;
    await client.json('POST', '/api/admin/accounting/entries', {
      date: today.toString(),
      kind: 'expense',
      concept: 'Limpieza del local',
      category: 'other_expenses',
      method: 'transfer',
      amount: '150',
    });

    const facts = await new SqlDiagnosticsFacts(db(), { now: () => new Date() }).load();

    assertEquals(facts.today, today.toString());
    assertEquals(facts.currentMonth, YearMonth.of(today).toString());
    assertEquals(facts.seasonMonths.length, 10);
    assertEquals(facts.seasonMonths[0], `${facts.seasonYear}-09`);

    assertEquals(facts.students.length, 1);
    const martina = facts.students[0];
    assertEquals(martina?.id, studentId);
    assertEquals(martina?.fullName, 'Martina López Herrera');
    assertEquals(martina?.status, 'active');
    assertEquals(martina?.contactEmail, 'rocio@example.com');
    assertEquals(martina?.guardians, [{ name: 'Rocío Herrera', phone: '612 48 19 30' }]);
    assertEquals(martina?.groups.map((g) => [g.id, g.since]), [[group, today.toString()]]);
    assertEquals(martina?.weeklyHours, 2);
    assertEquals(martina?.tierCents, 4500);
    assertEquals(martina?.feeCents, 4500);
    assertEquals(martina?.familyDiscount, false);
    assertEquals(martina?.familyPercent, 10);

    const charges = facts.charges.map((
      c,
    ) => [c.kind, c.period, c.amountCents, c.coveredCents, c.discountPercent]);
    assert(
      charges.some(([kind, period, amount]) =>
        kind === 'monthly' && period === facts.currentMonth && amount === 4500
      ),
    );
    assert(charges.some(([kind, , amount]) => kind === 'membership' && amount === 5000));
    assertEquals(facts.charges.every((c) => c.status !== 'expected'), true);
    assertEquals(facts.payments, []);
    assertEquals(facts.ledger.length, 1);
    assertEquals(facts.entries.map((e) => [e.concept, e.category, e.amountCents, e.period]), [[
      'Limpieza del local',
      'other_expenses',
      15000,
      facts.currentMonth,
    ]]);
    assert(facts.categories.some((c) => c.code === 'teachers' && c.kind === 'expense'));
    assertEquals(facts.teachers.map((t) => [t.id, t.fullName, t.active]), [[
      teacher,
      'Lucía Moreno Gil',
      true,
    ]]);
    const thisMonth = facts.teacherMonths.find((m) =>
      m.teacherId === teacher && m.month === facts.currentMonth
    );
    assertEquals(thisMonth?.incomeCents, 4500);
    assertEquals(facts.points, []);
  },
});
