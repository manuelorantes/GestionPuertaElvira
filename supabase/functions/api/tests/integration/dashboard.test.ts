import { assertEquals } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

const today = LocalDate.fromInstant(new Date()).toString();
const outsideSeason = Season.teachingSeason(YearMonth.fromString(today.slice(0, 7))) === null;

Deno.test({
  name: 'dashboard should summarise the club with real figures',
  ignore: outsideSeason,
  async fn() {
    await resetDatabase();
    await createUser('junta@club.es');
    const client = new ApiClient();
    await client.logIn('junta@club.es');
    const teacher = await newTeacher(client);
    const group = await newGroup(client, teacher, { capacity: 4 });
    const student = ((await client.json('POST', '/api/admin/students', {
      fullName: 'Martina López Herrera',
      birthDate: '2014-03-12',
      guardians: [{ name: 'Rocío Herrera', phone: '612481930' }],
      imageConsent: true,
      groupIds: [group],
    })).body as { id: string }).id;
    assertEquals(
      (await client.json('POST', '/api/admin/billing/payments', {
        studentId: student,
        kind: 'monthly',
        months: 1,
        method: 'cash',
        date: today,
      })).status,
      201,
    );
    assertEquals(
      (await client.json('POST', '/api/admin/accounting/entries', {
        date: today,
        kind: 'expense',
        concept: 'Material',
        category: 'material',
        method: 'card',
        amount: '20',
      })).status,
      201,
    );

    const response = await client.get('/api/admin/dashboard');
    assertEquals(response.status, 200);
    const summary = response.body as Record<string, unknown>;
    assertEquals(summary.collectedCents, 4500);
    assertEquals(summary.pendingCents, 0);
    assertEquals(summary.expensesCents, 2000);
    assertEquals(summary.activeStudents, 1);
    assertEquals(summary.registeredStudents, 1);
    const chart = summary.chart as Record<string, unknown>[];
    assertEquals(chart.length, 12);
    assertEquals(chart[11], { month: today.slice(0, 7), incomeCents: 4500, expenseCents: 2000 });
    assertEquals(summary.occupancy, {
      percent: 25,
      fullGroups: 0,
      emptiest: [{
        id: group,
        name: 'Iniciación A',
        teacherName: 'Lucía Moreno Gil',
        occupied: 1,
        capacity: 4,
      }],
    });
    assertEquals((summary.latest as unknown[]).length, 2);
    assertEquals(summary.overdue, []);
  },
});

Deno.test('dashboard should be reserved to administrators', async () => {
  await resetDatabase();
  await createUser('profe@club.es', 'teacher');
  const client = new ApiClient();
  await client.logIn('profe@club.es');
  assertError(await client.get('/api/admin/dashboard'), 403, 'forbidden');
});
