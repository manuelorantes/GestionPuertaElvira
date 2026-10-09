import { assert, assertEquals } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, db, resetDatabase } from '../support/http.ts';
import { inTransaction } from '../../src/infrastructure/persistence/sql.ts';
import { runCommand } from '../../scripts/console.ts';

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

/** La tarea de cada noche: apunta las horas automáticas que falten. */
const proposeSessions = () =>
  inTransaction(db(), (tx) => runCommand(tx, 4, ['app:payroll:propose-sessions']));

Deno.test({
  name: 'payroll should propose, edit and settle the sessions of the month',
  ignore: outsideSeason,
  async fn() {
    const { client, teacher } = await fixture();
    const list = async () =>
      body<{ items: Record<string, unknown>[] }>(
        await client.get(`/api/admin/payroll/sessions?month=${month}`),
      ).items;
    // Consultar no apunta nada: las horas automáticas las apunta la tarea de cada noche.
    assertEquals(await list(), []);
    assertEquals(await proposeSessions(), 0);
    const sessions = await list();
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
    // Ana va con Lucía y con Carlos; Pablo, solo con Lucía.
    const lucias = body<{ items: { id: string }[] }>(await client.get('/api/admin/groups')).items;
    const carlos = await newTeacher(client, 'Carlos Ruiz Márquez');
    const carlosGroup = await newGroup(client, carlos, {
      days: ['mon'],
      start: '19:00',
      end: '20:00',
      classroom: 'caballo',
    });
    for (
      const [fullName, groupIds] of [
        ['Ana Pérez Gil', [lucias[0]?.id, carlosGroup]],
        ['Pablo Ruiz Sanz', [lucias[0]?.id]],
      ] as const
    ) {
      assertEquals(
        (await client.json('POST', '/api/admin/students', { fullName, groupIds })).status,
        201,
      );
    }
    // Rosa estuvo con Lucía desde el día 1 hasta hoy y desde hoy va con Carlos: es alumna solo de Carlos.
    const rosa = body<{ id: string }>(
      await client.json('POST', '/api/admin/students', {
        fullName: 'Rosa Gil Ruiz',
        groupIds: [lucias[0]?.id],
      }),
    ).id;
    await db()`UPDATE classes_enrolment SET enrolled_on = ${`${month}-01`}, ends_on = ${today}
                WHERE student_id = ${rosa}`;
    assertEquals(
      (await client.json('POST', `/api/admin/students/${rosa}/enrolments`, {
        groupId: carlosGroup,
      }))
        .status,
      204,
    );
    const report = body<{
      items: Record<string, unknown>[];
      students: { total: number; shared: unknown[] };
    }>(await client.get(`/api/admin/payroll/profitability?month=${month}`));
    const row = report.items.find((r) => r.teacherName === 'Lucía Moreno Gil');
    assertEquals(row?.groups, ['Iniciación A']);
    assertEquals(row?.capacity, 60, '12 plazas × 5 días de clase');
    assertEquals(
      report.items.map((r) => [r.teacherName, r.students]).sort(),
      [['Carlos Ruiz Márquez', 2], ['Lucía Moreno Gil', 2]],
    );
    assertEquals(report.students.total, 3);
    assertEquals(
      (report.students.shared as { name: string }[]).map((s) => s.name),
      ['Ana Pérez Gil'],
    );
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
  const dutyId = (duty.body as { id: string }).id;
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
  // Las horas de ese lunes de Ángel salen como sustitución; las del titular otro lunes, no.
  for (const [who, date] of [[other, '2026-11-09'], [teacher, '2026-11-02']]) {
    const recorded = await client.json('POST', '/api/admin/payroll/sessions', {
      teacherId: who,
      date,
      groupId: group,
      hours: 1,
    });
    assertEquals(recorded.status, 201, JSON.stringify(recorded.body));
  }
  const sessionsOf = async (who: string) =>
    ((await client.get(`/api/admin/payroll/sessions?month=2026-11&teacherId=${who}`)).body as {
      items: { date: string; substitution: boolean }[];
    }).items.map((s) => [s.date, s.substitution]);
  assertEquals(await sessionsOf(other), [['2026-11-09', true]]);
  assertEquals(await sessionsOf(teacher), [['2026-11-02', false]]);
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

  // El turno de encargado de Ángel del viernes 6 de noviembre lo cubre el titular (con motivo: tiene clase a esa hora).
  const dutySub = await client.json('POST', '/api/admin/payroll/substitutions', {
    dutyId,
    date: '2026-11-06',
    teacherId: teacher,
    reason: 'Ángel en un torneo',
  });
  assertEquals(dutySub.status, 201, JSON.stringify(dutySub.body));
  const withDuty = (await client.get('/api/admin/payroll/substitutions?month=2026-11')).body as {
    items: { date: string; groupName: string; dutyId: string | null; teacherName: string }[];
  };
  assertEquals(
    withDuty.items.filter((s) => s.dutyId !== null).map((
      s,
    ) => [s.date, s.groupName, s.teacherName]),
    [['2026-11-06', 'Encargado del club', 'Ángel Castillo Rodriguez']],
  );

  // Sustituir a una profesora con un solo grupo (lunes) por Ángel del 16 al 30 de noviembre: lunes 16, 23 y 30.
  const absent = await newTeacher(client, 'Lucía Moreno Gil');
  await newGroup(client, absent, {
    days: ['mon'],
    start: '19:00',
    end: '20:00',
    classroom: 'caballo',
  });
  const whole = await client.json('POST', '/api/admin/payroll/teacher-substitutions', {
    teacherId: absent,
    substituteId: other,
    from: '2026-11-16',
    to: '2026-11-30',
    reason: 'Baja',
  });
  assertEquals([whole.status, whole.body], [201, { created: 3 }]);
  const after = (await client.get('/api/admin/payroll/substitutions?month=2026-11')).body as {
    items: { date: string; teacherName: string }[];
  };
  assertEquals(
    after.items.filter((s) => s.teacherName === 'Lucía Moreno Gil').map((s) => s.date),
    ['2026-11-16', '2026-11-23', '2026-11-30'],
  );
});

Deno.test({
  name: 'payroll should report a teacher, with advances discounted and shown in accounting',
  ignore: outsideSeason,
  async fn() {
    const { client, teacher } = await fixture();
    const next = YearMonth.fromString(month).next().toString();
    const advance = await client.json('POST', '/api/admin/payroll/advances', {
      teacherId: teacher,
      month: next,
      amount: '90',
      date: today,
      note: 'Pago de más',
    });
    assertEquals(advance.status, 201, JSON.stringify(advance.body));
    const report = body<{
      teacher: { name: string };
      balanceCents: number;
      months: { status: string; toPayCents: number }[];
      groups: { name: string; students: number }[];
      payments: { kind: string; amountCents: number }[];
    }>(await client.get(`/api/admin/payroll/teachers/${teacher}/report`));
    assertEquals(report.teacher.name, 'Lucía Moreno Gil');
    assertEquals(report.groups.length, 1);
    assertEquals(report.payments.map((p) => [p.kind, p.amountCents]), [['advance', 9000]]);
    // Saldo: lo pendiente de los meses hasta hoy menos lo adelantado para el mes que viene.
    const pending = report.months.filter((m) => m.status === 'pending')
      .reduce((sum, m) => sum + m.toPayCents, 0);
    assertEquals(report.balanceCents, pending - 9000);
    const ledger = body<{ items: { source: string; amountCents: number; concept: string }[] }>(
      await client.get(`/api/admin/accounting/ledger?month=${month}`),
    );
    assertEquals(
      ledger.items.filter((i) => i.source === 'advance').map((i) => i.amountCents),
      [9000],
    );
    assertError(
      await client.get('/api/admin/payroll/teachers/01990000-0000-7000-8000-000000000000/report'),
      404,
      'not_found',
    );
  },
});
