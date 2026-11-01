import { assert, assertEquals } from '@std/assert';

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
    // La luz pagada hoy, repartida entre el mes anterior (10 €) y el siguiente (20 €): gasto de hoy en caja y de esos
    // meses en lo que corresponde a cada mes.
    const previousMonth = YearMonth.fromString(today.slice(0, 7)).previous().toString();
    const followingMonth = YearMonth.fromString(today.slice(0, 7)).next().toString();
    assertEquals(
      (await client.json('POST', '/api/admin/accounting/entries', {
        date: today,
        kind: 'expense',
        concept: 'Luz',
        category: 'electricity',
        method: 'transfer',
        amount: '30',
        shares: [
          { period: previousMonth, amountCents: 1000 },
          { period: followingMonth, amountCents: 2000 },
        ],
      })).status,
      201,
    );

    // Un socio sin clases: cuenta como activo, no entre los que están en alguna clase.
    assertEquals(
      (await client.json('POST', '/api/admin/students', {
        fullName: 'Tomás Ruiz Caro',
        birthDate: '1980-05-02',
        guardians: [],
        imageConsent: false,
        groupIds: [],
      })).status,
      201,
    );

    // Una socia de alta desde antes del mes, sin clase, que se da de baja hoy: resta en «este mes».
    const eve = LocalDate.fromString(today).startOfMonth().plusDays(-1).toString();
    const leaving = ((await client.json('POST', '/api/admin/students', {
      fullName: 'Lucía Pardo Gil',
      birthDate: '1985-01-20',
      guardians: [],
      imageConsent: false,
      groupIds: [],
      joinedOn: eve,
    })).body as { id: string }).id;
    assertEquals(
      (await client.json('POST', `/api/admin/students/${leaving}/withdrawal`, { date: today }))
        .status,
      204,
    );

    // Una clase de la profesora el mes pasado, aún sin pagar.
    const lastMonthDay = `${previousMonth}-10`;
    const owedBefore = Season.teachingSeason(YearMonth.fromString(previousMonth)) === null
      ? 0
      : await (async () => {
        assertEquals(
          (await client.json('POST', '/api/admin/payroll/sessions', {
            teacherId: teacher,
            groupId: group,
            date: lastMonthDay,
            hours: 1,
          })).status,
          201,
        );
        return ((await client.get(`/api/admin/payroll/settlements?month=${previousMonth}`))
          .body as { items: { toPayCents: number }[] }).items
          .reduce((total, s) => total + s.toPayCents, 0);
      })();

    const response = await client.get('/api/admin/dashboard');
    assertEquals(response.status, 200);
    const summary = response.body as Record<string, unknown>;
    // El saldo: sin ejercicios cerrados, lo cobrado (45 €) menos lo gastado (20 € + 30 €).
    assertEquals(summary.balanceCents, -500);
    assertEquals(summary.seasonResultCents, -500);
    // Las cifras del mes son solo sus cuotas; las cuotas de socio pendientes (una por socio, también la de quien se ha dado de baja) van aparte.
    assertEquals(summary.pendingCents, 0);
    assertEquals(summary.membershipPendingCents, 15000);
    // Dos altas este mes y una baja: uno más que al empezarlo; solo uno tiene clase, y empezó este mes.
    assertEquals(summary.activeStudents, 2);
    assertEquals(summary.studentsChange, 1);
    assertEquals(summary.studentsInClasses, 1);
    assertEquals(summary.inClassesChange, 1);
    // Dos gráficas de la temporada, de septiembre a agosto.
    type Chart = {
      month: string;
      incomeCents: number;
      expenseCents: number;
      expectedCents?: number;
      expectedExpenseCents?: number;
    }[];
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
    // Profesorado previsto: lo que Rentabilidad calcula para el mes (horario × tarifa), de este mes en adelante.
    const payrollOf = async (m: string) =>
      ((await client.get(`/api/admin/payroll/profitability?month=${m}`)).body as {
        items: { costCents: number }[];
      }).items.reduce((total, row) => total + row.costCents, 0);
    const currentPayroll = await payrollOf(today.slice(0, 7));
    assert(currentPayroll > 0, 'la profesora tiene clases este mes');
    // Cuotas vs gastos fijos: solo las categorías del mes (las cuotas y la luz, no el material). La cuota del mes ya
    // está cobrada: nada previsto; la liquidación de la profesora, aún sin pagar, sí.
    assertEquals(at(ofMonth, today.slice(0, 7)), {
      month: today.slice(0, 7),
      incomeCents: 4500,
      expenseCents: 0,
      expectedCents: 0,
      expectedExpenseCents: currentPayroll,
    });
    if (season.includes(YearMonth.fromString(previousMonth))) {
      assertEquals(at(ofMonth, previousMonth)?.expenseCents, 1000);
      // Un mes ya pasado prevé lo que aún se debe al profesorado (su liquidación sin pagar) hasta que se paga.
      assertEquals(at(ofMonth, previousMonth)?.expectedExpenseCents, owedBefore);
      assert(owedBefore > 0, 'la profesora dio una clase el mes pasado');
    }
    // En los meses que vienen, la cuota prevista de la alumna matriculada y el coste de la profesora según el
    // horario; en julio y agosto no hay clases.
    const nextMonth = YearMonth.fromString(today.slice(0, 7)).next();
    if (Season.teachingSeason(nextMonth) !== null) {
      const nextPayroll = await payrollOf(nextMonth.toString());
      assert(nextPayroll > 0);
      assertEquals(at(ofMonth, nextMonth.toString()), {
        month: nextMonth.toString(),
        incomeCents: 0,
        expenseCents: 2000,
        expectedCents: 4500,
        expectedExpenseCents: nextPayroll,
      });
    }
    for (const summer of [`${season.startYear + 1}-07`, `${season.startYear + 1}-08`]) {
      assertEquals(at(ofMonth, summer)?.expectedCents, 0);
      assertEquals(at(ofMonth, summer)?.expectedExpenseCents, 0);
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

    // Pagada la liquidación del mes pasado, ya es gasto y deja de preverse.
    if (season.includes(YearMonth.fromString(previousMonth))) {
      assertEquals(
        (await client.json(
          'POST',
          `/api/admin/payroll/settlements/${teacher}/${previousMonth}/payment`,
          { date: today },
        )).status,
        204,
      );
      const paid = (await client.get('/api/admin/dashboard')).body as { monthChart: Chart };
      assertEquals(at(paid.monthChart, previousMonth), {
        month: previousMonth,
        incomeCents: 0,
        expenseCents: 1000 + owedBefore,
        expectedCents: 0,
        expectedExpenseCents: 0,
      });
    }
  },
});

Deno.test({
  name:
    'dashboard chart should count the unpaid fees of the month as expected until they are cancelled',
  ignore: outsideSeason,
  async fn() {
    await resetDatabase();
    await createUser('junta@club.es');
    const client = new ApiClient();
    await client.logIn('junta@club.es');
    const group = await newGroup(client, await newTeacher(client));
    await client.json('POST', '/api/admin/students', {
      fullName: 'Lucía López Herrera',
      groupIds: [group],
    });
    const month = today.slice(0, 7);
    const expectedOf = async () => {
      const bar = ((await client.get('/api/admin/dashboard')).body as {
        monthChart: { month: string; incomeCents: number; expectedCents: number }[];
      }).monthChart.find((m) => m.month === month);
      return {
        month: bar?.month,
        incomeCents: bar?.incomeCents,
        expectedCents: bar?.expectedCents,
      };
    };
    // Su cuota del mes está emitida y sin cobrar: prevista, sin ingreso.
    assertEquals(await expectedOf(), { month, incomeCents: 0, expectedCents: 4500 });
    // Cancelada, deja de preverse.
    const charge = ((await client.get(`/api/admin/billing/charges?month=${month}&kind=monthly`))
      .body as { items: { id: string }[] }).items[0]?.id ?? '';
    assertEquals(
      (await client.json('POST', `/api/admin/billing/charges/${charge}/cancel`)).status,
      204,
    );
    assertEquals(await expectedOf(), { month, incomeCents: 0, expectedCents: 0 });
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
      monthChart: { month: string; incomeCents: number; expectedCents: number }[];
    }).monthChart;
    let month = YearMonth.fromString(today.slice(0, 7));
    const shares: number[] = [];
    const expected: number[] = [];
    for (let i = 0; i < 3; i++, month = month.next()) {
      shares.push(chart.find((m) => m.month === month.toString())?.incomeCents ?? -1);
      expected.push(chart.find((m) => m.month === month.toString())?.expectedCents ?? -1);
    }
    assertEquals(shares, [4050, 4050, 4050]);
    // Los meses pagados por adelantado no se prevén; el siguiente, si es lectivo, sí (45 € con la tarifa de hoy).
    assertEquals(expected, [0, 0, 0]);
    if (Season.teachingSeason(month) !== null) {
      assertEquals(chart.find((m) => m.month === month.toString())?.expectedCents, 4500);
    }
  },
});
