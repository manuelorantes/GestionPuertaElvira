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
    // La luz del mes anterior, pagada hoy: gasto de hoy en caja, del mes anterior en lo que corresponde a cada mes.
    const previousMonth = YearMonth.fromString(today.slice(0, 7)).previous().toString();
    assertEquals(
      (await client.json('POST', '/api/admin/accounting/entries', {
        date: today,
        kind: 'expense',
        concept: 'Luz',
        category: 'electricity',
        method: 'transfer',
        amount: '30',
        period: previousMonth,
      })).status,
      201,
    );

    const response = await client.get('/api/admin/dashboard');
    assertEquals(response.status, 200);
    const summary = response.body as Record<string, unknown>;
    assertEquals(summary.collectedCents, 4500);
    // Las cifras del mes son solo sus cuotas; la cuota de socio pendiente va aparte.
    assertEquals(summary.expectedCents, 4500);
    assertEquals(summary.pendingCents, 0);
    assertEquals(summary.membershipPendingCents, 5000);
    assertEquals(summary.expensesCents, 5000);
    assertEquals(summary.activeStudents, 1);
    assertEquals(summary.registeredStudents, 1);
    // Dos gráficas de la temporada, de septiembre a agosto.
    type Chart = { month: string; incomeCents: number; expenseCents: number }[];
    const cash = summary.cashChart as Chart;
    const ofMonth = summary.monthChart as Chart;
    const season = Season.containing(YearMonth.fromString(today.slice(0, 7)));
    for (const chart of [cash, ofMonth]) {
      assertEquals(chart.length, 12);
      assertEquals(chart[0]?.month, season.firstMonth().toString());
      assertEquals(chart[11]?.month, `${season.startYear + 1}-08`);
    }
    const at = (chart: Chart, month: string) => chart.find((m) => m.month === month);
    // Lo que entra y sale en el mes: todo, por fecha.
    assertEquals(at(cash, today.slice(0, 7)), {
      month: today.slice(0, 7),
      incomeCents: 4500,
      expenseCents: 5000,
    });
    // Lo que corresponde a cada mes: solo las categorías del mes (las cuotas y la luz, no el material).
    assertEquals(at(ofMonth, today.slice(0, 7)), {
      month: today.slice(0, 7),
      incomeCents: 4500,
      expenseCents: 0,
    });
    if (season.includes(YearMonth.fromString(previousMonth))) {
      assertEquals(at(ofMonth, previousMonth)?.expenseCents, 3000);
    }
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
    assertEquals((summary.latest as unknown[]).length, 3);
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

Deno.test({
  name:
    'dashboard chart should count a three-month payment in the months it pays, not when it was paid',
  ignore: outsideSeason || ['05', '06'].includes(today.slice(5, 7)),
  async fn() {
    await resetDatabase();
    await createUser('junta@club.es');
    const client = new ApiClient();
    await client.logIn('junta@club.es');
    const group = await newGroup(client, await newTeacher(client));
    const student = ((await client.json('POST', '/api/admin/students', {
      fullName: 'Pablo López Herrera',
      groupIds: [group],
    })).body as { id: string }).id;
    const paid = await client.json('POST', '/api/admin/billing/payments', {
      studentId: student,
      kind: 'monthly',
      months: 3,
      method: 'cash',
      date: today,
    });
    assertEquals(paid.status, 201, JSON.stringify(paid.body));
    // 3 × 45 € con un 10 % = 121,50 €: 40,50 € en cada uno de los tres meses.
    const chart = ((await client.get('/api/admin/dashboard')).body as {
      monthChart: { month: string; incomeCents: number }[];
    }).monthChart;
    let month = YearMonth.fromString(today.slice(0, 7));
    const shares: number[] = [];
    for (let i = 0; i < 3; i++, month = month.next()) {
      shares.push(chart.find((m) => m.month === month.toString())?.incomeCents ?? -1);
    }
    assertEquals(shares, [4050, 4050, 4050]);
  },
});
