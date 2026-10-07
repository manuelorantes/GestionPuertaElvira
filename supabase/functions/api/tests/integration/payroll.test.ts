import { assert, assertEquals } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

const today = LocalDate.fromInstant(new Date()).toString();
const month = today.slice(0, 7);
const outsideSeason = Season.teachingSeason(YearMonth.fromString(month)) === null;

async function fixture(): Promise<{ client: ApiClient; teacher: string }> {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const teacher = await newTeacher(client);
  assertEquals(
    (await client.json('PUT', `/api/admin/teachers/${teacher}`, {
      fullName: 'Lucía Moreno Gil',
      active: true,
      hourlyRate: '16',
    })).status,
    204,
  );
  await newGroup(client, teacher, { days: ['mon', 'tue', 'wed', 'thu', 'fri'] });
  return { client, teacher };
}

const body = <T>(response: { body: unknown }) => response.body as T;

Deno.test({
  name: 'payroll should propose, edit and settle the sessions of the month',
  ignore: outsideSeason,
  async fn() {
    const { client, teacher } = await fixture();
    const sessions = body<{ items: Record<string, unknown>[] }>(
      await client.get(`/api/admin/payroll/sessions?month=${month}`),
    ).items;
    assert(sessions.length > 0);
    assertEquals(sessions[0]?.label, 'Iniciación A');
    assertEquals(sessions[0]?.costCents, 1600);
    const count = sessions.length;

    const extra = body<{ id: string }>(
      await client.json('POST', '/api/admin/payroll/sessions', {
        teacherId: teacher,
        date: today,
        activity: 'Torneo escolar',
        hours: 2.5,
      }),
    ).id;
    assertEquals(
      (await client.json('PUT', `/api/admin/payroll/sessions/${extra}`, {
        teacherId: teacher,
        hours: 3,
      })).status,
      204,
    );
    assertEquals(
      body<{ removed: number }>(
        await client.json('POST', '/api/admin/payroll/holidays', { date: sessions[0]?.date }),
      ).removed,
      1,
    );

    const settlement = body<{ items: Record<string, unknown>[] }>(
      await client.get(`/api/admin/payroll/settlements?month=${month}`),
    ).items[0];
    assertEquals(settlement?.status, 'pending');
    assertEquals(settlement?.minutes, (count - 1) * 60 + 180);

    assertEquals(
      body<{ paid: number }>(
        await client.json('POST', `/api/admin/payroll/settlements/${month}/payment`, {
          date: today,
        }),
      ).paid,
      1,
    );
    const detail = body<Record<string, unknown>>(
      await client.get(`/api/admin/payroll/settlements/${teacher}/${month}`),
    );
    assertEquals(detail.status, 'paid');
    assertEquals((detail.club as { name: string }).name, 'Club Ajedrez Puerta Elvira');
    assertError(
      await client.json('DELETE', `/api/admin/payroll/sessions/${extra}`),
      409,
      'settlement_paid',
    );
    assertError(
      await client.json('POST', `/api/admin/payroll/settlements/${teacher}/${month}/payment`, {
        date: today,
      }),
      409,
      'settlement_paid',
    );
  },
});

Deno.test({
  name: 'payroll should report profitability and forbid teachers',
  ignore: outsideSeason,
  async fn() {
    const { client } = await fixture();
    const row = body<{ items: Record<string, unknown>[] }>(
      await client.get(`/api/admin/payroll/profitability?month=${month}`),
    ).items[0];
    assertEquals(row?.teacherName, 'Lucía Moreno Gil');
    assertEquals(row?.groups, ['Iniciación A']);
    assertEquals(row?.capacity, 12);
    assertError(
      await client.json(
        'DELETE',
        '/api/admin/payroll/sessions/01990000-0000-7000-8000-000000000000',
      ),
      404,
      'not_found',
    );
    assertError(
      await client.get(
        '/api/admin/payroll/settlements/01990000-0000-7000-8000-000000000000/2026-10',
      ),
      404,
      'not_found',
    );
    await createUser('profe@club.es', 'teacher');
    const teacher = new ApiClient();
    await teacher.logIn('profe@club.es');
    assertError(
      await teacher.get(`/api/admin/payroll/settlements?month=${month}`),
      403,
      'forbidden',
    );
  },
});

Deno.test('payroll should manage holidays, club duties and substitutions over HTTP', async () => {
  const { client, teacher } = await fixture();
  const other = await newTeacher(client, 'Ángel Castillo Rodriguez');

  const holiday = await client.json('POST', '/api/admin/payroll/holidays', {
    date: '2026-12-08',
    name: 'Inmaculada Concepción',
  });
  assertEquals(holiday.status, 200, JSON.stringify(holiday.body));
  const holidays = (await client.get('/api/admin/payroll/holidays?season=2026')).body as {
    items: { date: string; name: string }[];
  };
  assertEquals(holidays.items, [{ date: '2026-12-08', name: 'Inmaculada Concepción' }]);
  assertEquals(
    (await client.json('DELETE', '/api/admin/payroll/holidays/2026-12-08', {})).status,
    204,
  );

  const duty = await client.json('POST', '/api/admin/payroll/duties', {
    teacherId: other,
    weekday: 5,
    start: '17:00',
    end: '20:00',
  });
  assertEquals(duty.status, 201, JSON.stringify(duty.body));
  const duties = (await client.get('/api/admin/payroll/duties')).body as {
    items: { teacherName: string; weekday: number; start: string; end: string; label: string }[];
  };
  assertEquals(duties.items.map((d) => [d.teacherName, d.weekday, d.start, d.end, d.label]), [
    ['Ángel Castillo Rodriguez', 5, '17:00', '20:00', 'Encargado del club'],
  ]);
  assertError(
    await client.json('POST', '/api/admin/payroll/duties', {
      teacherId: other,
      weekday: 5,
      start: '20:00',
      end: '17:00',
    }),
    422,
    'unprocessable',
  );

  // Grupo de los lunes de 17:00 a 18:00 del profesor titular; un lunes lo da Ángel.
  const group = await newGroup(client, teacher, {
    days: ['mon'],
    start: '17:00',
    end: '18:00',
    classroom: 'caballo',
  });
  const planned = await client.json('POST', '/api/admin/payroll/substitutions', {
    groupId: group,
    date: '2026-11-09',
    teacherId: other,
    reason: 'Torneo',
  });
  assertEquals(planned.status, 201, JSON.stringify(planned.body));
  const listed = (await client.get('/api/admin/payroll/substitutions?month=2026-11')).body as {
    items: { id: string; date: string; substituteName: string; start: string; reason: string }[];
  };
  assertEquals(listed.items.map((s) => [s.date, s.substituteName, s.start, s.reason]), [
    ['2026-11-09', 'Ángel Castillo Rodriguez', '17:00', 'Torneo'],
  ]);
  assertError(
    await client.json('POST', '/api/admin/payroll/substitutions', {
      groupId: group,
      date: '2026-11-10',
      teacherId: other,
    }),
    422,
    'unprocessable',
  );
  const id = listed.items[0]?.id ?? '';
  assertEquals(
    (await client.json('DELETE', `/api/admin/payroll/substitutions/${id}`, {})).status,
    204,
  );
});
