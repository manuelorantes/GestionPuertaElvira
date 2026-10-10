import { assert, assertEquals } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, db, resetDatabase } from '../support/http.ts';
import { inTransaction } from '../../src/infrastructure/persistence/sql.ts';
import { runCommand } from '../../scripts/console.ts';

const today = LocalDate.fromInstant(new Date());
const month = YearMonth.of(today);
const outsideSeason = Season.teachingSeason(month) === null;
const body = <T>(response: { body: unknown }) => response.body as T;

interface Finding {
  id: string;
  rule: string;
  severity: string;
  entity: { kind: string; id: string; label: string };
  explanation: string;
  proposal: string;
  hasFix: boolean;
  status: string;
  closedBy: string | null;
}

interface Diagnosis {
  run: { launchedBy: string; openCount: number; newCount: number; resolvedCount: number } | null;
  items: Finding[];
}

/** Un club pequeño con un caso de cada regla que tiene arreglo (salvo «En el grupo desde», probada en unitario). */
async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const teacher = await newTeacher(client, 'Lucía Moreno Gil');
  const group = await newGroup(client, teacher);
  const newStudent = async (fields: Record<string, unknown>) => {
    const response = await client.json('POST', '/api/admin/students', {
      birthDate: '2014-03-12',
      imageConsent: false,
      groupIds: [group],
      ...fields,
    });
    assertEquals(response.status, 201, JSON.stringify(response.body));
    return body<{ id: string }>(response).id;
  };
  const ana = await newStudent({
    fullName: 'ana garcía lópez',
    guardians: [{ name: 'Rocío López', phone: '612481930' }],
  });
  const hugo = await newStudent({
    fullName: 'Hugo Díaz Lara',
    guardians: [{ name: 'Marta Lara', phone: '655000111' }],
  });
  const lola = await newStudent({
    fullName: 'Lola Ruiz Mora',
    guardians: [{ name: 'Marta Lara', phone: '655 00 01 11' }],
  });
  const antonio = await newStudent({
    fullName: 'Antonio Ruiz Cano',
    birthDate: '1965-04-02',
    guardians: [{ name: 'Antonio', phone: '611223344' }],
  });
  // Importada de la hoja con un importe que no es su tarifa (2 h: 45 €).
  await db()`UPDATE billing_charge SET amount_cents = 3600
    WHERE student_id = ${ana} AND kind = 'monthly' AND period = ${month.toString()}`;
  const entry = async (concept: string, category: string, amount: string) =>
    body<{ id: string }>(
      await client.json('POST', '/api/admin/accounting/entries', {
        date: today.toString(),
        kind: 'expense',
        concept,
        category,
        method: 'transfer',
        amount,
      }),
    ).id;
  const cleaning = await entry('Limpieza del local', 'other_expenses', '150');
  const overpaid = await entry('Pago de más a Lucía Moreno Gil', 'teachers', '90');
  const form = new FormData();
  for (
    const [key, value] of Object.entries({
      date: today.toString(),
      number: 'F-77',
      supplier: 'Eléctrica',
      concept: 'Consumo eléctrico',
      category: 'utilities',
      amount: '61.35',
    })
  ) form.append(key, value);
  const invoice = body<{ id: string }>(
    await client.request('POST', '/api/admin/accounting/invoices', {
      body: form,
      headers: { 'X-Requested-With': 'fetch' },
    }),
  ).id;
  return { client, teacher, group, ana, hugo, lola, antonio, cleaning, overpaid, invoice };
}

async function diagnose(client: ApiClient): Promise<Diagnosis> {
  const run = await client.json('POST', '/api/admin/diagnostics/run');
  assertEquals(run.status, 200, JSON.stringify(run.body));
  return body<Diagnosis>(await client.get('/api/admin/diagnostics'));
}

const byRule = (diagnosis: Diagnosis, rule: string) =>
  diagnosis.items.filter((f) => f.rule === rule);

Deno.test({
  name: 'diagnostics should find the cases, accept each kind of fix and apply it',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    const first = await diagnose(fx.client);
    assertEquals(first.run?.launchedBy, 'Lucía Moreno Gil');
    assertEquals(first.run?.newCount, first.items.length);
    assertEquals(
      [...new Set(first.items.map((f) => f.rule))].sort(),
      [
        'adult_guardian_is_self',
        'family_unlinked',
        'fee_mismatch',
        'generic_category',
        'name_format',
        'teacher_expense_as_entry',
      ],
    );
    // Dinero antes que datos del club, y estos antes que la forma.
    const severities = first.items.map((f) => f.severity);
    const rank = (s: string) => ['money', 'club', 'form'].indexOf(s);
    assertEquals(severities, [...severities].sort((a, b) => rank(a) - rank(b)));
    assert(first.items.every((f) => f.hasFix && f.status === 'open'));

    const accept = async (finding: Finding | undefined) => {
      assert(finding, 'falta el hallazgo');
      const response = await fx.client.json(
        'POST',
        `/api/admin/diagnostics/findings/${finding.id}/accept`,
      );
      assertEquals(response.status, 204, JSON.stringify(response.body));
    };

    // Cuota repreciada a la tarifa.
    await accept(byRule(first, 'fee_mismatch')[0]);
    const account = body<{ charges: { period: string; amountCents: number }[] }>(
      await fx.client.get(`/api/admin/billing/accounts/${fx.ana}`),
    );
    assertEquals(account.charges.find((c) => c.period === month.toString())?.amountCents, 4500);

    // Familia vinculada (mutua).
    await accept(byRule(first, 'family_unlinked')[0]);
    const hugo = body<{ siblings: { id: string }[] }>(
      await fx.client.get(`/api/admin/students/${fx.hugo}`),
    );
    assertEquals(hugo.siblings.map((s) => s.id), [fx.lola]);

    // Nombre corregido.
    await accept(byRule(first, 'name_format')[0]);
    assertEquals(
      body<{ fullName: string }>(await fx.client.get(`/api/admin/students/${fx.ana}`)).fullName,
      'Ana García López',
    );

    // Teléfono propio en vez de tutor.
    await accept(byRule(first, 'adult_guardian_is_self')[0]);
    const antonio = body<{ ownPhone: string | null; guardians: unknown[] }>(
      await fx.client.get(`/api/admin/students/${fx.antonio}`),
    );
    assertEquals(antonio.ownPhone, '611 22 33 44');
    assertEquals(antonio.guardians, []);

    // Categorías propias en el apunte y en la factura.
    for (const finding of byRule(first, 'generic_category')) await accept(finding);
    const ledger = body<{ items: { sourceId: string; category: string }[] }>(
      await fx.client.get(`/api/admin/accounting/ledger?month=${month.toString()}`),
    );
    assertEquals(ledger.items.find((i) => i.sourceId === fx.cleaning)?.category, 'cleaning');
    const invoices = body<{ items: { id: string; category: string }[] }>(
      await fx.client.get('/api/admin/accounting/invoices'),
    );
    assertEquals(invoices.items.find((i) => i.id === fx.invoice)?.category, 'electricity');

    // El pago de más pasa a ser un anticipo de septiembre y el apunte desaparece.
    await accept(byRule(first, 'teacher_expense_as_entry')[0]);
    const september = `${Season.containing(month).startYear}-09`;
    const settlements = body<{ items: { teacherId: string; advancesCents: number }[] }>(
      await fx.client.get(`/api/admin/payroll/settlements?month=${september}`),
    );
    assertEquals(settlements.items.find((s) => s.teacherId === fx.teacher)?.advancesCents, 9000);
    const after = body<{ items: { sourceId: string; source: string }[] }>(
      await fx.client.get(`/api/admin/accounting/ledger?month=${month.toString()}`),
    );
    assertEquals(after.items.some((i) => i.sourceId === fx.overpaid), false);
    assert(after.items.some((i) => i.source === 'advance'));

    const accepted = body<Diagnosis>(await fx.client.get('/api/admin/diagnostics?status=accepted'));
    assertEquals(accepted.items.length, first.items.length);
    assert(accepted.items.every((f) => f.closedBy === 'Lucía Moreno Gil'));

    // Todo lo aceptado queda en el historial a nombre de quien aceptó.
    const actions =
      await db()`SELECT label, user_name FROM audit_action WHERE label = 'Aceptar hallazgo'`;
    assertEquals(actions.length, first.items.length);
    assert(actions.every((a) => a.user_name === 'Lucía Moreno Gil'));

    const second = await diagnose(fx.client);
    const stillOpen = new Set(second.items.map((f) => f.rule));
    for (
      const rule of [
        'adult_guardian_is_self',
        'family_unlinked',
        'generic_category',
        'name_format',
        'teacher_expense_as_entry',
      ]
    ) assertEquals(stillOpen.has(rule), false, rule);
  },
});

Deno.test({
  name:
    'diagnostics should keep a dismissed finding hidden and resolve by itself what stops reproducing',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    const first = await diagnose(fx.client);
    const name = byRule(first, 'name_format')[0];
    assert(name);
    assertEquals(
      (await fx.client.json('POST', `/api/admin/diagnostics/findings/${name.id}/dismiss`)).status,
      204,
    );
    const dismissed = body<Diagnosis>(
      await fx.client.get('/api/admin/diagnostics?status=dismissed'),
    );
    assertEquals(dismissed.items.map((f) => [f.rule, f.closedBy]), [[
      'name_format',
      'Lucía Moreno Gil',
    ]]);
    assertError(
      await fx.client.json('POST', `/api/admin/diagnostics/findings/${name.id}/dismiss`),
      409,
      'finding_closed',
    );

    const second = await diagnose(fx.client);
    assertEquals(byRule(second, 'name_format'), []);
    assertEquals(second.run?.newCount, 0);

    // Se arregla a mano el teléfono de Antonio: su hallazgo se resuelve solo.
    const antonio = body<Record<string, unknown>>(
      await fx.client.get(`/api/admin/students/${fx.antonio}`),
    );
    assertEquals(
      (await fx.client.json('PUT', `/api/admin/students/${fx.antonio}`, {
        fullName: antonio.fullName,
        birthDate: antonio.birthDate,
        nationalId: null,
        contactEmail: null,
        guardians: [],
        ownPhone: '611223344',
        federationLicence: null,
        imageConsent: false,
      })).status,
      204,
    );
    const third = await diagnose(fx.client);
    assertEquals(third.run?.resolvedCount, 1);
    const resolved = body<Diagnosis>(await fx.client.get('/api/admin/diagnostics?status=resolved'));
    assertEquals(resolved.items.map((f) => [f.rule, f.closedBy]), [[
      'adult_guardian_is_self',
      null,
    ]]);
  },
});

Deno.test({
  name: 'diagnostics should refuse to accept a finding whose data changed and reject other roles',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    const first = await diagnose(fx.client);
    const name = byRule(first, 'name_format')[0];
    assert(name);
    const ana = body<Record<string, unknown>>(await fx.client.get(`/api/admin/students/${fx.ana}`));
    await fx.client.json('PUT', `/api/admin/students/${fx.ana}`, {
      fullName: 'Ana García lópez',
      birthDate: ana.birthDate,
      nationalId: null,
      contactEmail: null,
      guardians: ana.guardians,
      ownPhone: null,
      federationLicence: null,
      imageConsent: false,
    });
    assertError(
      await fx.client.json('POST', `/api/admin/diagnostics/findings/${name.id}/accept`),
      409,
      'finding_outdated',
    );
    assertEquals(
      body<{ fullName: string }>(await fx.client.get(`/api/admin/students/${fx.ana}`)).fullName,
      'Ana García lópez',
    );
    assertError(await fx.client.get('/api/admin/diagnostics?status=weird'), 422, 'unprocessable');
    assertError(
      await fx.client.json(
        'POST',
        '/api/admin/diagnostics/findings/01a10000-0000-7000-8000-000000000000/dismiss',
      ),
      404,
      'not_found',
    );

    await createUser('profe@club.es', 'teacher');
    const teacher = new ApiClient();
    await teacher.logIn('profe@club.es');
    assertError(await teacher.get('/api/admin/diagnostics'), 403, 'forbidden');
    assertError(await teacher.json('POST', '/api/admin/diagnostics/run'), 403, 'forbidden');
  },
});

Deno.test({
  name: 'app:diagnostics:run should diagnose as the nightly task',
  ignore: outsideSeason,
  async fn() {
    const fx = await fixture();
    const code = await inTransaction(db(), (tx) => runCommand(tx, 4, ['app:diagnostics:run']));
    assertEquals(code, 0);
    const diagnosis = body<Diagnosis>(await fx.client.get('/api/admin/diagnostics'));
    assertEquals(diagnosis.run?.launchedBy, 'Tarea nocturna');
    assert((diagnosis.run?.openCount ?? 0) > 0);
    assertEquals(diagnosis.items.length, diagnosis.run?.openCount);
  },
});

Deno.test({
  name:
    'diagnostics should unchain family and prepayment discounts, correcting receipts and separating the extra',
  ignore: outsideSeason,
  async fn() {
    await resetDatabase();
    await createUser('junta@club.es');
    const client = new ApiClient();
    await client.logIn('junta@club.es');
    const teacher = await newTeacher(client, 'Lucía Moreno Gil');
    const group = await newGroup(client, teacher);
    const newStudent = async (fullName: string) =>
      body<{ id: string }>(
        await client.json('POST', '/api/admin/students', {
          fullName,
          birthDate: '2016-05-01',
          guardians: [{ name: 'Francisco', phone: '608002669' }],
          imageConsent: false,
          groupIds: [group],
        }),
      ).id;
    const irene = await newStudent('Irene Pérez Soto');
    const mario = await newStudent('Mario Pérez Soto');
    assertEquals(
      (await client.json('POST', `/api/admin/students/${irene}/siblings`, { siblingId: mario }))
        .status,
      204,
    );
    // Irene paga el mes (2 h con familia: 40,50 €) y después se deja la cuota y el recibo como en la hoja: 32,40 €.
    const registered = await client.json('POST', '/api/admin/billing/payments', {
      studentId: irene,
      kind: 'monthly',
      months: 1,
      method: 'cash',
      date: today.toString(),
    });
    assertEquals(registered.status, 201, JSON.stringify(registered.body));
    const receipt = body<{ id: string }>(registered).id;
    await db()`UPDATE billing_charge SET amount_cents = 3240, discount_percent = 0
      WHERE student_id = ${irene} AND kind = 'monthly' AND period = ${month.toString()}`;
    await db()`UPDATE billing_payment SET total_cents = 3240, credit_cents = 3240,
        lines = '[{"label":"Importado de la hoja","amountCents":3240}]'
      WHERE id = ${receipt}`;

    const first = await diagnose(client);
    const finding = byRule(first, 'chained_discounts')[0];
    assert(finding, 'falta el hallazgo de descuentos en cadena');
    assertEquals(finding.entity.id, irene);
    assertEquals(byRule(first, 'fee_mismatch').filter((f) => f.entity.id === irene), []);
    assertEquals(
      (await client.json('POST', `/api/admin/diagnostics/findings/${finding.id}/accept`)).status,
      204,
    );

    const account = body<{
      charges: { period: string; amountCents: number; discountPercent: number; status: string }[];
      balanceCents: number;
    }>(await client.get(`/api/admin/billing/accounts/${irene}`));
    const charge = account.charges.find((c) => c.period === month.toString());
    assertEquals([charge?.amountCents, charge?.discountPercent, charge?.status], [
      3150,
      20,
      'paid',
    ]);
    assertEquals(account.balanceCents, 90, 'el extra queda como saldo a favor');

    const payments = body<{ items: { id: string; concept: string; totalCents: number }[] }>(
      await client.get(`/api/admin/billing/payments?studentId=${irene}`),
    ).items;
    assertEquals(payments.find((p) => p.id === receipt)?.totalCents, 3150);
    const extra = payments.find((p) =>
      p.concept === 'Extra por error en el cálculo de varios descuentos'
    );
    assertEquals(extra?.totalCents, 90);
    const detail = body<{ lines: { label: string; amountCents: number }[] }>(
      await client.get(`/api/admin/billing/payments/${receipt}`),
    );
    assertEquals(detail.lines.at(-1), {
      label: 'Corrección: Error en el cálculo de varios descuentos',
      amountCents: -90,
    });
    assertEquals(byRule(await diagnose(client), 'chained_discounts'), []);
  },
});
