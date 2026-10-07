import { assert, assertEquals, assertMatch } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

const today = LocalDate.fromInstant(new Date()).toString();
const outsideSeason = Season.teachingSeason(YearMonth.of(LocalDate.fromString(today))) === null;

interface Fixture {
  client: ApiClient;
  student: string;
  teacher: string;
}

async function fixture(): Promise<Fixture> {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const teacher = await newTeacher(client);
  const group = await newGroup(client, teacher);
  const response = await client.json('POST', '/api/admin/students', {
    fullName: 'Martina López Herrera',
    birthDate: '2014-03-12',
    guardians: [{ name: 'Rocío Herrera', phone: '612481930' }],
    imageConsent: true,
    groupIds: [group],
  });
  assertEquals(response.status, 201);
  return { client, student: (response.body as { id: string }).id, teacher };
}

const body = <T>(response: { body: unknown }) => response.body as T;

Deno.test({
  name:
    'billing should list the charges of the month, quote and register a payment with receipt and invoice',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    const charges = body<{ month: string; items: Record<string, unknown>[]; totals: unknown }>(
      await fx.client.get('/api/admin/billing/charges'),
    );
    assertEquals(charges.month, today.slice(0, 7));
    const charge = charges.items[0] as Record<string, unknown>;
    assertEquals(charge.studentName, 'Martina López Herrera');
    assertEquals(charge.amountCents, 4500);
    assert(['due', 'overdue'].includes(String(charge.status)));
    assertEquals(charges.totals, {
      expectedCents: 4500,
      collectedCents: 0,
      pendingCents: 4500,
      overdueCount: charge.status === 'overdue' ? 1 : 0,
    });

    const request = {
      studentId: fx.student,
      kind: 'monthly',
      months: 1,
      method: 'cash',
      date: today,
      specialDiscount: { percent: 10, concept: 'Canje de puntos' },
    };
    const quote = await fx.client.json('POST', '/api/admin/billing/quote', request);
    assertEquals(quote.status, 200);
    assertEquals(body<{ totalCents: number }>(quote).totalCents, 4050);
    assertEquals(body<{ lines: { label: string }[] }>(quote).lines.map((l) => l.label), [
      '2 h semanales · 1 mes',
      'Canje de puntos −10 %',
    ]);

    const registered = await fx.client.json('POST', '/api/admin/billing/payments', request);
    assertEquals(registered.status, 201);
    const payment = body<{ id: string }>(registered).id;
    const receipt = body<Record<string, unknown>>(
      await fx.client.get(`/api/admin/billing/payments/${payment}`),
    );
    assertMatch(String(receipt.receiptNumber), /^R-\d{4}-0001$/);
    assertEquals(receipt.guardianName, 'Rocío Herrera');
    assertEquals(receipt.methodLabel, 'Efectivo');
    assertEquals((receipt.club as { name: string }).name, 'Club Ajedrez Puerta Elvira');

    const customer = {
      name: 'Rocío Herrera',
      taxId: '12345678Z',
      address: 'Calle Elvira 1, Granada',
    };
    assertEquals(
      (await fx.client.json('POST', `/api/admin/billing/payments/${payment}/invoice`, customer))
        .status,
      204,
    );
    assertError(
      await fx.client.json('POST', `/api/admin/billing/payments/${payment}/invoice`, customer),
      409,
      'invoice_already_issued',
    );
    assertMatch(
      String(
        body<Record<string, unknown>>(await fx.client.get(`/api/admin/billing/payments/${payment}`))
          .invoiceNumber,
      ),
      /^F-\d{4}-0001$/,
    );
    assertEquals(
      body<{ items: unknown[] }>(
        await fx.client.get(`/api/admin/billing/payments?studentId=${fx.student}`),
      ).items.length,
      1,
    );
    assertEquals(
      body<{ items: { status: string }[] }>(await fx.client.get('/api/admin/billing/charges'))
        .items[0]?.status,
      'paid',
    );
    assertEquals(
      (await fx.client.json('POST', `/api/admin/billing/charges/${charge.id}/reminded`)).status,
      204,
    );
  },
});

Deno.test({
  name: 'billing should manage the student account and points',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    assertEquals(
      (await fx.client.json('PUT', `/api/admin/billing/accounts/${fx.student}`, {
        preferredPlan: 'three_months',
        member: true,
        privateRate: '35',
      })).status,
      204,
    );
    assertEquals(
      body<{ points: number }>(
        await fx.client.json('POST', `/api/admin/billing/accounts/${fx.student}/points`, {
          delta: 4,
        }),
      ).points,
      4,
    );
    const account = body<Record<string, unknown>>(
      await fx.client.get(`/api/admin/billing/accounts/${fx.student}`),
    );
    assertEquals(account.preferredPlan, 'three_months');
    assertEquals(account.member, true);
    assertEquals(account.privateRate, '35.00');
    assertEquals(account.points, 4);
    assert(Number.isInteger(account.suggestedMonths));
    assert(Number.isInteger(account.remainingMonths));
    assertError(
      await fx.client.json('POST', `/api/admin/billing/accounts/${fx.student}/points`, {
        delta: -5,
      }),
      422,
      'unprocessable',
    );
    assertError(
      await fx.client.get('/api/admin/billing/accounts/01990000-0000-7000-8000-000000000000'),
      404,
      'not_found',
    );
  },
});

Deno.test('billing settings should be read, updated and published as public prices', async () => {
  const fx = await fixture();
  const settings = body<Record<string, unknown>>(
    await fx.client.get('/api/admin/billing/settings'),
  );
  assertEquals(settings.threeHours, '55.00');
  assertEquals(settings.seasonPercent, 20);
  assertEquals(settings.privateRates, {});
  assertEquals(
    (await fx.client.json('PUT', '/api/admin/billing/settings', {
      ...settings,
      threeHours: '60',
      privateRates: { [fx.teacher]: '32.5' },
    })).status,
    204,
  );
  const updated = body<Record<string, unknown>>(await fx.client.get('/api/admin/billing/settings'));
  assertEquals(updated.threeHours, '60.00');
  assertEquals(updated.privateRates, { [fx.teacher]: '32.50' });

  const prices = body<Record<string, unknown>>(await new ApiClient().get('/api/public/prices'));
  assertMatch(String(prices.season), /^\d{4}\/\d{2}$/);
  assertEquals(prices.tiers, [
    { weeklyHours: 3, monthlyCents: 6000 },
    { weeklyHours: 2, monthlyCents: 4500 },
    { weeklyHours: 1.5, monthlyCents: 4000 },
    { weeklyHours: 1, monthlyCents: 3500 },
  ]);
  assertEquals(prices.membershipCents, 5000);
  assertEquals(prices.familyPercent, 10);
  assertEquals(prices.prepaymentPercent, { threeMonths: 10, sixMonths: 15, season: 20 });
  assertEquals(prices.privateHourCents, 3000);
});

Deno.test({
  name: 'billing should explain invalid payments and forbid teachers',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    assertError(
      await fx.client.json('POST', '/api/admin/billing/quote', {
        studentId: fx.student,
        kind: 'monthly',
        months: 11,
        method: 'cash',
        date: today,
      }),
      422,
      'invalid_months',
    );
    // Quien no es socio puede pagar la cuota de socio (y pasa a serlo); después ya no hay nada que cobrar.
    const membership = await fx.client.json('POST', '/api/admin/billing/quote', {
      studentId: fx.student,
      kind: 'membership',
      months: 1,
      method: 'cash',
      date: today,
    });
    assertEquals(membership.status, 200, JSON.stringify(membership.body));
    assertEquals((membership.body as { totalCents: number }).totalCents, 5000);
    assertEquals(
      (await fx.client.json('POST', '/api/admin/billing/payments', {
        studentId: fx.student,
        kind: 'membership',
        months: 1,
        method: 'cash',
        date: today,
      })).status,
      201,
    );
    const account = body<Record<string, unknown>>(
      await fx.client.get(`/api/admin/billing/accounts/${fx.student}`),
    );
    assertEquals(account.member, true);
    assertEquals(account.membershipPaid, true);
    assertError(
      await fx.client.json('POST', '/api/admin/billing/quote', {
        studentId: fx.student,
        kind: 'membership',
        months: 1,
        method: 'cash',
        date: today,
      }),
      409,
      'nothing_to_pay',
    );
    assertError(
      await fx.client.get('/api/admin/billing/payments/01990000-0000-7000-8000-000000000000'),
      404,
      'not_found',
    );
    await createUser('profe@club.es', 'teacher');
    const teacher = new ApiClient();
    await teacher.logIn('profe@club.es');
    assertError(await teacher.get('/api/admin/billing/charges'), 403, 'forbidden');
  },
});

Deno.test({
  name: 'billing should change the payment method of a registered payment, also in accounting',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    const registered = await fx.client.json('POST', '/api/admin/billing/payments', {
      studentId: fx.student,
      kind: 'membership',
      method: 'transfer',
      date: today,
    });
    assertEquals(registered.status, 201, JSON.stringify(registered.body));
    const payment = body<{ id: string }>(registered).id;

    const changed = await fx.client.json('PUT', `/api/admin/billing/payments/${payment}/method`, {
      method: 'cash',
    });
    assertEquals(changed.status, 204, JSON.stringify(changed.body));
    const receipt = body<Record<string, unknown>>(
      await fx.client.get(`/api/admin/billing/payments/${payment}`),
    );
    assertEquals(receipt.methodLabel, 'Efectivo');
    const ledger = body<{ items: { sourceId: string; method: string }[] }>(
      await fx.client.get(`/api/admin/accounting/ledger?month=${today.slice(0, 7)}`),
    );
    assertEquals(ledger.items.find((i) => i.sourceId === payment)?.method, 'cash');

    const firstOfMonth = `${today.slice(0, 7)}-01`;
    const moved = await fx.client.json('PUT', `/api/admin/billing/payments/${payment}/date`, {
      date: firstOfMonth,
    });
    assertEquals(moved.status, 204, JSON.stringify(moved.body));
    const corrected = await fx.client.json('PUT', `/api/admin/billing/payments/${payment}/amount`, {
      amountCents: 6000,
      reason: 'Incluye el carné',
    });
    assertEquals(corrected.status, 204, JSON.stringify(corrected.body));
    const after = body<{ paidOn: string; totalCents: number; lines: { label: string }[] }>(
      await fx.client.get(`/api/admin/billing/payments/${payment}`),
    );
    assertEquals([after.paidOn, after.totalCents], [firstOfMonth, 6000]);
    assertEquals(after.lines.at(-1)?.label, 'Corrección: Incluye el carné');
    assertError(
      await fx.client.json('PUT', `/api/admin/billing/payments/${payment}/date`, {
        date: '2099-01-01',
      }),
      422,
      'unprocessable',
    );

    assertError(
      await fx.client.json('PUT', `/api/admin/billing/payments/${payment}/method`, {
        method: 'bizum',
      }),
      422,
      'unprocessable',
    );
    assertError(
      await fx.client.json(
        'PUT',
        '/api/admin/billing/payments/01a11381-2833-782f-9c2b-ddc95b817821/method',
        { method: 'cash' },
      ),
      404,
      'not_found',
    );
  },
});

Deno.test({
  name:
    'billing should recalculate charges when groups change and let administration fix one by hand',
  // Hacen falta tres meses de clase por delante (de septiembre a abril).
  ignore: outsideSeason || ['05', '06'].includes(today.slice(5, 7)),
  async fn() {
    const fx = await fixture();
    await fx.client.get('/api/admin/billing/charges');
    const paid = await fx.client.json('POST', '/api/admin/billing/payments', {
      studentId: fx.student,
      kind: 'monthly',
      months: 3,
      method: 'cash',
      date: today,
    });
    assertEquals(paid.status, 201, JSON.stringify(paid.body));

    // Pagó 3 meses a 45 € con un 10 % (40,50 €). Pasa a 3 h (55 €): las cuotas se recalculan aunque estén cobradas,
    // conservando el 10 % (49,50 €).
    const friday = await newGroup(fx.client, fx.teacher, {
      name: 'Viernes',
      days: ['fri'],
      start: '18:00',
      end: '19:00',
    });
    const enrolled = await fx.client.json('POST', `/api/admin/students/${fx.student}/enrolments`, {
      groupId: friday,
    });
    assertEquals(enrolled.status, 204, JSON.stringify(enrolled.body));

    type Row = { period: string; amountCents: number; pendingCents: number; manual: boolean };
    const charges = async () =>
      body<{ charges: Row[] }>(await fx.client.get(`/api/admin/billing/accounts/${fx.student}`))
        .charges;
    const includesThisMonth = Number(today.slice(8, 10)) <= 10;
    const rows = await charges();
    assertEquals(rows.length, 3);
    assertEquals(rows[0]?.amountCents, includesThisMonth ? 4950 : 4050);
    assertEquals(
      rows.slice(1).map((r) => [r.amountCents, r.pendingCents]),
      // Lo que falta (9 € por mes recalculado) queda en el último: el reparto cubre primero los más antiguos.
      [[4950, 0], [4950, includesThisMonth ? 2700 : 1800]],
    );

    // Fijar a mano el último mes y volver a la calculada.
    const last = rows[2]?.period ?? '';
    const fixed = await fx.client.json(
      'PUT',
      `/api/admin/billing/accounts/${fx.student}/charges/${last}`,
      { amountCents: 3500, reason: 'Precio acordado', scope: 'one' },
    );
    assertEquals(fixed.status, 204, JSON.stringify(fixed.body));
    const afterFix = (await charges()).find((r) => r.period === last);
    assertEquals([afterFix?.amountCents, afterFix?.manual], [3500, true]);
    const list = body<{ items: { studentId: string; kind: string; status: string }[] }>(
      await fx.client.get(`/api/admin/billing/charges?month=${last}`),
    );
    assertEquals(
      list.items.find((i) => i.studentId === fx.student && i.kind === 'monthly')?.status,
      'partial',
    );

    const reset = await fx.client.json(
      'POST',
      `/api/admin/billing/accounts/${fx.student}/charges/${last}/reset`,
      {},
    );
    assertEquals(reset.status, 204);
    const afterReset = (await charges()).find((r) => r.period === last);
    assertEquals(
      [afterReset?.amountCents, afterReset?.manual],
      [4950, false],
      'calculada, con su 10 %',
    );
  },
});

Deno.test({
  name:
    'billing should list only the monthly charges of a month or the membership fees of its season',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    await fx.client.json('PUT', `/api/admin/billing/accounts/${fx.student}`, {
      preferredPlan: 'monthly',
      member: true,
      privateRate: null,
    });
    const month = today.slice(0, 7);
    const monthly = body<{ items: { kind: string }[] }>(
      await fx.client.get(`/api/admin/billing/charges?month=${month}&kind=monthly`),
    );
    assert(monthly.items.length > 0 && monthly.items.every((i) => i.kind === 'monthly'));
    const members = body<{ items: { kind: string; period: string }[] }>(
      await fx.client.get(`/api/admin/billing/charges?month=${month}&kind=membership`),
    );
    const season = Season.containing(YearMonth.fromString(month)).firstMonth().toString();
    assertEquals(members.items.map((i) => [i.kind, i.period]), [['membership', season]]);
    assertError(
      await fx.client.get(`/api/admin/billing/charges?month=${month}&kind=otra`),
      422,
      'unprocessable',
    );
  },
});

Deno.test({
  name:
    'billing should show the expected charges of a future month for students who have not paid it yet',
  ignore: outsideSeason || ['06'].includes(today.slice(5, 7)),
  async fn() {
    const fx = await fixture();
    const next = YearMonth.fromString(today.slice(0, 7)).next().toString();
    const list = body<{
      items: { studentId: string; status: string; amountCents: number; period: string }[];
      totals: { expectedCents: number; collectedCents: number };
    }>(await fx.client.get(`/api/admin/billing/charges?month=${next}&kind=monthly`));
    assertEquals(list.items.map((i) => [i.studentId, i.status, i.amountCents, i.period]), [
      [fx.student, 'expected', 4500, next],
    ]);
    assertEquals([list.totals.expectedCents, list.totals.collectedCents], [4500, 0]);

    // Al pagarlo por adelantado deja de ser prevista.
    await fx.client.get('/api/admin/billing/charges');
    await fx.client.json('POST', '/api/admin/billing/payments', {
      studentId: fx.student,
      kind: 'monthly',
      months: 2,
      method: 'cash',
      date: today,
    });
    const paid = body<{ items: { status: string }[] }>(
      await fx.client.get(`/api/admin/billing/charges?month=${next}&kind=monthly`),
    );
    assertEquals(paid.items.map((i) => i.status), ['paid']);
  },
});
