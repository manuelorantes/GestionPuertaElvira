import { assert, assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, atTime, createUser, resetDatabase } from '../support/http.ts';

const NOW = '2026-11-02T10:00:00+01:00';

interface HistoryEntry {
  label: string;
  userName: string;
  occurredAt: string;
  changes: {
    table: string;
    operation: string;
    fields: { field: string; before: unknown; after: unknown }[];
  }[];
}

interface HistoryPage {
  items: HistoryEntry[];
  references: Record<string, { label: string }>;
  nextBefore: number | null;
}

async function fixture() {
  await resetDatabase();
  await createUser('presi@club.es', 'superadministrator');
  await createUser('junta@club.es', 'administrator');
  await createUser('profe@club.es', 'teacher');
  const client = new ApiClient();
  await client.logIn('presi@club.es');
  const teacher = await newTeacher(client);
  const first = await newGroup(client, teacher);
  const second = await newGroup(client, teacher, { name: 'Avanzado B', days: ['fri'] });
  const created = await client.json('POST', '/api/admin/students', {
    fullName: 'Martina López Herrera',
    groupIds: [first],
    guardians: [{ name: 'Rocío Herrera', phone: '612481930' }],
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const id = (created.body as { id: string }).id;
  return { client, id, first, second };
}

async function history(client: ApiClient, id: string, before?: number): Promise<HistoryPage> {
  const query = before ? `?before=${before}` : '';
  const response = await client.get(`/api/admin/students/${id}/history${query}`);
  assertEquals(response.status, 200, JSON.stringify(response.body));
  return response.body as HistoryPage;
}

Deno.test('the student history should list the changes to their data and groups, newest first, without payments or points', async () => {
  await atTime(NOW, async () => {
    const { client, id, first, second } = await fixture();
    const edited = await client.json('PUT', `/api/admin/students/${id}`, {
      fullName: 'Martina López Herrera',
      guardians: [{ name: 'Rocío Herrera', phone: '699000111' }],
      imageConsent: true,
    });
    assertEquals(edited.status, 204, JSON.stringify(edited.body));
    const moved = await client.json('POST', `/api/admin/students/${id}/enrolments/${first}/move`, {
      toGroupId: second,
    });
    assertEquals(moved.status, 204, JSON.stringify(moved.body));
    const paid = await client.json('POST', '/api/admin/billing/payments', {
      studentId: id,
      kind: 'monthly',
      months: 1,
      method: 'cash',
      date: '2026-11-02',
    });
    assertEquals(paid.status, 201, JSON.stringify(paid.body));
    await client.json('POST', '/api/admin/points/adjustments', {
      studentId: id,
      delta: 3,
      note: 'Premio',
    });

    const page = await history(client, id);
    const labels = page.items.map((e) => e.label);
    assertEquals(labels, ['Mover de grupo', 'Editar alumno', 'Dar de alta alumno']);
    // Sin cuotas, cobros ni puntos, ni siquiera dentro de las acciones que sí salen.
    const tables = new Set(page.items.flatMap((e) => e.changes.map((c) => c.table)));
    for (const table of tables) {
      assert(
        ['students_student', 'students_past_membership', 'classes_enrolment', 'billing_account']
          .includes(
            table,
          ),
        table,
      );
    }
    const edit = page.items[1]?.changes.find((c) => c.table === 'students_student');
    assertEquals(edit?.fields.map((f) => f.field), ['guardians', 'image_consent']);
    // Los grupos llegan con su nombre.
    const groupIds = page.items[0]?.changes.flatMap((c) =>
      c.fields.filter((f) =>
        f.field === 'class_group_id'
      ).map((f) => String(f.after ?? f.before))
    ) ?? [];
    assert(groupIds.some((g) => page.references[g]?.label.includes('Avanzado B')));
  });
});

Deno.test('the student history should page from older actions on', async () => {
  await atTime(NOW, async () => {
    const { client, id } = await fixture();
    for (const phone of ['600000001', '600000002', '600000003']) {
      await client.json('PUT', `/api/admin/students/${id}`, {
        fullName: 'Martina López Herrera',
        guardians: [{ name: 'Rocío Herrera', phone }],
        imageConsent: true,
      });
    }
    const first = await client.get(`/api/admin/students/${id}/history?limit=2`);
    const page = first.body as HistoryPage;
    assertEquals(page.items.length, 2);
    assert(page.nextBefore !== null);
    const rest = await client.get(
      `/api/admin/students/${id}/history?limit=2&before=${page.nextBefore}`,
    );
    assertEquals((rest.body as HistoryPage).items.map((e) => e.label), [
      'Editar alumno',
      'Dar de alta alumno',
    ]);
    assertEquals((rest.body as HistoryPage).nextBefore, null);
  });
});

Deno.test('only the superadministration should see the student history', async () => {
  await atTime(NOW, async () => {
    const { id } = await fixture();
    for (const email of ['junta@club.es', 'profe@club.es']) {
      const client = new ApiClient();
      await client.logIn(email);
      assertEquals((await client.get(`/api/admin/students/${id}/history`)).status, 403);
    }
  });
});

Deno.test('the points history of a student should be visible to administration and teachers', async () => {
  await atTime(NOW, async () => {
    const { client, id } = await fixture();
    await client.json('POST', '/api/admin/points/adjustments', {
      studentId: id,
      delta: 3,
      note: 'Premio',
    });
    await client.json('POST', '/api/admin/points/adjustments', {
      studentId: id,
      delta: -1,
      note: 'Corrección',
    });
    for (const email of ['junta@club.es', 'profe@club.es']) {
      const reader = new ApiClient();
      await reader.logIn(email);
      const response = await reader.get(`/api/admin/students/${id}/points`);
      assertEquals(response.status, 200, JSON.stringify(response.body));
      const items =
        (response.body as { items: { delta: number; kind: string; concept: string }[] }).items;
      assertEquals(items.map((m) => [m.delta, m.kind, m.concept]), [
        [-1, 'manual', 'Corrección'],
        [3, 'manual', 'Premio'],
      ]);
    }
  });
});
