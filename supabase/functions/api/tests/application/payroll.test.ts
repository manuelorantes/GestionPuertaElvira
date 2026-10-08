import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  SettlementAlreadyPaid,
  Substitution,
  TeacherRef,
  type TimesheetEntry,
} from '../../src/domain/payroll/mod.ts';
import {
  AddHoliday,
  CancelSubstitution,
  ChangeSettlementPaymentDate,
  DeleteAdvance,
  DeleteSession,
  ListSettlements,
  PayAllSettlements,
  PaySettlement,
  PlanSubstitution,
  Profitability,
  ProposeSessions,
  RecordAdvance,
  RecordSession,
  RefillDay,
  SaveDuty,
  SubstituteTeacher,
  SubstitutionNeedsReason,
  TeacherAgenda,
  TeacherPayStatus,
  TeacherReport,
  UpdateSession,
} from '../../src/application/payroll/mod.ts';
import { PeriodClosed } from '../../src/application/common/mod.ts';
import { DutyFixture, PayrollFixture, SubstitutionFixture } from '../support/payroll.ts';

function setUp() {
  const fx = new PayrollFixture();
  const lucia = fx.teacherWithGroup('Lucía Moreno Gil', 1600, 'Iniciación A', [1, 3], 60);
  const carlos = fx.teacherWithGroup('Carlos Ruiz Márquez', 1800, 'Adultos I', [2], 90);
  const duties = new DutyFixture(fx);
  const substitutions = new SubstitutionFixture(fx);
  const proposer = () =>
    new ProposeSessions(
      fx,
      duties,
      substitutions,
      fx,
      fx,
      fx,
      fx,
      fx.clock,
      fx.transactions,
      fx.locks,
    );
  // Septiembre ya estaba apuntado: solo se apunta octubre (hasta hoy, 31 de octubre por la noche).
  fx.markMonthProposed(YearMonth.fromString('2026-09'));
  const propose = (_month?: string) => proposer().execute();
  const pay = () => new PaySettlement(fx, fx, fx, fx, fx.transactions, fx.locks);
  const list = () => new ListSettlements(fx, fx, fx, fx);
  return { fx, lucia, carlos, propose, pay, list, duties, substitutions };
}

Deno.test('ProposeSessions should record each class once it is over, skip holidays and respect deletions', async () => {
  const { fx, propose } = setUp();
  await fx.add(LocalDate.fromString('2026-10-12'), 'Fiesta Nacional');
  await propose();
  // Octubre: 8 lunes y miércoles de Lucía menos el festivo del 12, y 4 martes de Carlos.
  assertEquals(fx.entries.size, 7 + 4);
  const first = [...fx.entries.keys()][0] as string;
  await new DeleteSession(fx, fx).execute(first);
  await propose();
  assertEquals(fx.entries.size, 10, 'lo borrado no vuelve');

  // A media tarde solo están las clases que ya han acabado.
  const live = new PayrollFixture('2026-10-20T17:30:00+02:00');
  const ana = live.teacherWithGroup('Ana', 1500, 'Martes temprano', [2], 30, 16 * 60);
  live.teacherWithGroup('Bea', 1500, 'Martes tarde', [2], 60, 17 * 60);
  live.markMonthProposed(YearMonth.fromString('2026-09'));
  for (let day = 1; day < 20; day++) live.proposed.add(`2026-10-${String(day).padStart(2, '0')}`);
  const liveProposer = new ProposeSessions(
    live,
    new DutyFixture(live),
    new SubstitutionFixture(live),
    live,
    live,
    live,
    live,
    live.clock,
    live.transactions,
    live.locks,
  );
  await liveProposer.execute();
  assertEquals([...live.entries.values()].map((e) => [e.label, e.teacher().value]), [[
    'Martes temprano',
    ana,
  ]]);
  await liveProposer.execute();
  assertEquals(live.entries.size, 1, 'sin duplicados en el mismo día');
});

Deno.test('club duties count as hours without adding the classes given meanwhile', async () => {
  const { fx, carlos, duties, propose, list } = setUp();
  // Carlos: martes de 17:00 a 18:30 con Adultos I; encargado del club los martes de 17:00 a 20:00.
  await new SaveDuty(duties, fx).execute(null, {
    teacherId: carlos,
    weekday: 2,
    start: '17:00',
    end: '20:00',
    label: null,
  });
  await propose();
  const settlement = (await list().execute('2026-10')).find((s) => s.teacherId === carlos);
  assertEquals(settlement?.minutes, 4 * 180, '4 martes × 3 h, sin sumar la clase de 1,5 h');
  assertEquals(settlement?.lines.map((l) => [l.label, l.minutes]), [
    ['Encargado del club', 720],
    ['Adultos I', 0],
  ]);
});

Deno.test('substitutions give the class to another teacher and need a reason when they overlap', async () => {
  const { fx, lucia, carlos, duties, substitutions, propose } = setUp();
  const beginners = fx.scheduledGroups.find((g) => g.name === 'Iniciación A')!;
  const planner = new PlanSubstitution(fx, duties, substitutions, fx, fx, fx);
  const id = await planner.execute({
    groupId: beginners.id.value,
    date: '2026-10-05',
    teacherId: carlos,
    reason: null,
  });
  await propose();
  const monday = [...fx.entries.values()].find((e) => e.date.toString() === '2026-10-05')!;
  assertEquals([monday.teacher().value, monday.label], [carlos, 'Iniciación A (sustitución)']);

  // Anularla devuelve la sesión ya apuntada al titular.
  await new CancelSubstitution(fx, duties, substitutions, fx, fx).execute(id);
  assertEquals(monday.teacher().value, lucia);

  // Carlos da Adultos I los martes a las 17:00: sustituir otra clase del martes a la misma hora pide motivo.
  const tuesdayGroup = fx.teacherWithGroup('Ana Belén Torres', 1500, 'Martes B', [2], 60, 17 * 60);
  const other = fx.scheduledGroups.find((g) => g.teacher.value === tuesdayGroup)!;
  await assertRejects(
    () =>
      planner.execute({
        groupId: other.id.value,
        date: '2026-10-06',
        teacherId: carlos,
        reason: null,
      }),
    SubstitutionNeedsReason,
    'Adultos I',
  );
  await planner.execute({
    groupId: other.id.value,
    date: '2026-10-06',
    teacherId: carlos,
    reason: 'Ana Belén enferma: junta los dos grupos',
  });
  assertEquals(fx.substitutions.size, 1);
});

Deno.test('RecordSession should record group sessions and other activities for known teachers only', async () => {
  const { fx, lucia, carlos } = setUp();
  const record = new RecordSession(fx, fx, fx, fx);
  await assertRejects(
    () =>
      record.execute({
        teacherId: TeacherRef.generate().value,
        date: '2026-10-15',
        groupId: null,
        activity: 'Torneo',
        hours: 1,
      }),
    InvalidValue,
  );
  const group = fx.scheduledGroups[0]?.id.value ?? '';
  const groupSession = await record.execute({
    teacherId: carlos,
    date: '2026-10-15',
    groupId: group,
    activity: null,
    hours: 1,
  });
  const activity = await record.execute({
    teacherId: lucia,
    date: '2026-10-17',
    groupId: null,
    activity: 'Torneo escolar',
    hours: 3,
  });
  assertEquals(fx.entries.get(groupSession)?.label, 'Iniciación A');
  assertEquals(fx.entries.get(activity)?.minutes().minutes, 180);
  await assertRejects(
    () =>
      record.execute({
        teacherId: lucia,
        date: '2026-10-17',
        groupId: null,
        activity: '  ',
        hours: 1,
      }),
    InvalidValue,
  );
});

Deno.test('UpdateSession and AddHoliday should substitute a teacher and remove a day', async () => {
  const { fx, carlos, propose } = setUp();
  await propose('2026-10');
  const monday = [...fx.entries.values()].find((e) =>
    e.date.toString() === '2026-10-12'
  ) as TimesheetEntry;
  await new UpdateSession(fx, fx, fx).execute(monday.id.value, carlos, 1.5);
  assertEquals(monday.teacher().value, carlos);
  assertEquals(monday.minutes().minutes, 90);
  assertEquals(await new AddHoliday(fx, fx, fx).execute('2026-10-12', 'Fiesta Nacional'), 1);
  assertEquals(fx.entries.size, 11);
});

Deno.test('ListSettlements should list pending settlements with the current rate', async () => {
  const { propose, list } = setUp();
  await propose('2026-10');
  const settlements = await list().execute('2026-10');
  assertEquals(settlements.map((s) => s.teacherName), ['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
  assertEquals(settlements[1]?.status, 'pending');
  assertEquals(settlements[1]?.minutes, 480);
  assertEquals(settlements[1]?.amountCents, 12800);
  assertEquals(settlements[0]?.amountCents, 10800, '4 martes × 1,5 h × 18 €');
});

Deno.test('PaySettlement should freeze the settlement, lock its sessions and respect closed seasons', async () => {
  const { fx, lucia, propose, pay, list } = setUp();
  await propose('2026-10');
  await pay().execute(lucia, '2026-10', '2026-11-02');
  fx.teachers.set(lucia, {
    id: lucia,
    name: 'Lucía Moreno Gil',
    rate: Money.cents(9900),
    active: true,
  });
  const settled = (await list().execute('2026-10'))[1];
  assertEquals(settled?.status, 'paid');
  assertEquals(settled?.paidOn, '2026-11-02');
  assertEquals(settled?.amountCents, 12800);
  const session = [...fx.entries.values()].find((e) =>
    e.teacher().value === lucia
  ) as TimesheetEntry;
  await assertRejects(
    () => new DeleteSession(fx, fx).execute(session.id.value),
    SettlementAlreadyPaid,
  );

  const closed = setUp();
  await closed.propose('2026-10');
  closed.fx.closed = true;
  await assertRejects(
    () => closed.pay().execute(closed.lucia, '2026-10', '2026-11-02'),
    PeriodClosed,
  );
});

Deno.test('PayAllSettlements should pay every pending settlement of the month', async () => {
  const { fx, carlos, propose, pay, list } = setUp();
  await propose('2026-10');
  assertEquals(
    await new PayAllSettlements(pay(), list(), fx.transactions).execute('2026-10', '2026-11-02'),
    2,
  );
  assertEquals(fx.paidSettlements.size, 2);
  await assertRejects(() => pay().execute(carlos, '2026-10', '2026-11-03'), SettlementAlreadyPaid);
});

Deno.test('RefillDay should add the missing automatic sessions of a past day without duplicating them', async () => {
  const { fx, duties, substitutions } = setUp();
  fx.markMonthProposed(YearMonth.fromString('2026-10'));
  const refill = () => new RefillDay(fx, duties, substitutions, fx, fx, fx, fx, fx.clock);
  assertEquals(await refill().execute('2026-10-05'), 1, 'el lunes, Iniciación A');
  assertEquals(await refill().execute('2026-10-05'), 0, 'sin duplicados');
  await fx.add(LocalDate.fromString('2026-10-12'), 'Fiesta Nacional');
  assertEquals(await refill().execute('2026-10-12'), 0, 'festivo');
  await assertRejects(() => refill().execute('2026-11-02'), InvalidValue);
});

Deno.test('SubstituteTeacher should give all the classes of a teacher on those days to another, skipping holidays', async () => {
  const { fx, lucia, carlos, duties, substitutions } = setUp();
  await fx.add(LocalDate.fromString('2026-10-12'), 'Fiesta Nacional');
  const substitute = new SubstituteTeacher(fx, duties, substitutions, fx, fx, fx, fx);
  // Lucía (lunes y miércoles) falta del 7 al 14 de octubre: miércoles 7, lunes 12 (festivo) y miércoles 14.
  const created = await substitute.execute({
    teacherId: lucia,
    substituteId: carlos,
    from: '2026-10-07',
    to: '2026-10-14',
    reason: 'Baja médica',
  });
  assertEquals(created, 2);
  assertEquals(
    [...fx.substitutions.values()].map((s) => s.date.toString()).sort(),
    ['2026-10-07', '2026-10-14'],
  );
  await assertRejects(
    () =>
      substitute.execute({
        teacherId: lucia,
        substituteId: lucia,
        from: '2026-10-19',
        to: '2026-10-19',
        reason: null,
      }),
    InvalidValue,
  );
  await assertRejects(
    () =>
      substitute.execute({
        teacherId: lucia,
        substituteId: carlos,
        from: '2026-10-19',
        to: '2027-01-19',
        reason: null,
      }),
    InvalidValue,
  );

  // Si quien sustituye tiene clase a esa hora, se pide el motivo y no se guarda nada.
  const ana = fx.teacherWithGroup('Ana Belén Torres', 1500, 'Martes B', [2], 60, 17 * 60);
  await assertRejects(
    () =>
      substitute.execute({
        teacherId: ana,
        substituteId: carlos,
        from: '2026-10-20',
        to: '2026-10-20',
        reason: null,
      }),
    SubstitutionNeedsReason,
  );
  assertEquals(fx.substitutions.size, 2);
});

Deno.test('Profitability should compare the expected hours of the month with the monthly fees of their students', async () => {
  const { fx, lucia, carlos, duties } = setUp();
  await fx.add(LocalDate.fromString('2026-10-12'), 'Fiesta Nacional');
  // Lucía: lunes y miércoles 1 h (7 clases con el festivo) a 16 €/h; Carlos: martes 1,5 h (4 clases) a 18 €/h.
  const load = {
    classLoad: () =>
      Promise.resolve({
        teachers: new Map([
          [lucia, { groups: ['Iniciación A'], occupied: 15, capacity: 20 }],
          [carlos, { groups: ['Adultos I'], occupied: 4, capacity: 10 }],
        ]),
        // Ana va 2 h con Lucía y 1,5 h con Carlos; Pablo solo con Lucía.
        students: new Map([
          ['ana', new Map([[lucia, 120], [carlos, 90]])],
          ['pablo', new Map([[lucia, 120]])],
        ]),
      }),
  };
  const fees = {
    monthlyFees: () => Promise.resolve(new Map([['ana', 7000], ['pablo', 4950], ['socio', 5000]])),
  };
  const rows = await new Profitability(
    fx,
    duties,
    fx,
    fx,
    new ListSettlements(fx, fx, fx, fx),
    load,
    fees,
    fx.clock,
  ).execute('2026-10');
  assertEquals(
    rows.map((r) => [r.teacherName, r.minutes, r.costCents, r.incomeCents, r.occupied, r.capacity]),
    [
      ['Lucía Moreno Gil', 420, 11200, 4000 + 4950, 15, 20],
      ['Carlos Ruiz Márquez', 360, 10800, 3000, 4, 10],
    ],
  );
});

Deno.test('Substitutions should cover club duty shifts too, alone or with all the classes of the teacher', async () => {
  const { fx, lucia, carlos, duties, substitutions } = setUp();
  // Carlos es encargado los viernes de 17:00 a 20:00; Lucía no tiene clase los viernes.
  const duty = await new SaveDuty(duties, fx).execute(null, {
    teacherId: carlos,
    weekday: 5,
    start: '17:00',
    end: '20:00',
    label: null,
  });
  const plan = new PlanSubstitution(fx, duties, substitutions, fx, fx, fx);
  await plan.execute({
    groupId: null,
    dutyId: duty,
    date: '2026-10-09',
    teacherId: lucia,
    reason: null,
  });
  assertEquals([...fx.substitutions.values()].map((s) => [s.source, s.date.toString()]), [
    [`duty:${duty}`, '2026-10-09'],
  ]);
  await assertRejects(
    () =>
      plan.execute({
        groupId: null,
        dutyId: duty,
        date: '2026-10-08',
        teacherId: lucia,
        reason: null,
      }),
    InvalidValue,
  );

  // Sustituir a Carlos una semana: su clase del martes 13 y su turno del viernes 16.
  const created = await new SubstituteTeacher(fx, duties, substitutions, fx, fx, fx, fx).execute({
    teacherId: carlos,
    substituteId: lucia,
    from: '2026-10-12',
    to: '2026-10-16',
    reason: null,
  });
  assertEquals(created, 2);
  assertEquals(
    [...fx.substitutions.values()].map((s) => s.date.toString()).sort(),
    ['2026-10-09', '2026-10-13', '2026-10-16'],
  );
});

Deno.test('Profitability should use the hours actually recorded in a month already over', async () => {
  const { fx, lucia, carlos, duties } = setUp();
  // Hoy es 31 de octubre: septiembre ya pasó. Lucía tiene apuntadas 3 h (un torneo); Carlos, ninguna.
  await new RecordSession(fx, fx, fx, fx).execute({
    teacherId: lucia,
    date: '2026-09-15',
    groupId: null,
    activity: 'Torneo escolar',
    hours: 3,
  });
  const load = {
    classLoad: () =>
      Promise.resolve({
        teachers: new Map([[carlos, { groups: ['Adultos I'], occupied: 4, capacity: 10 }]]),
        students: new Map([['ana', new Map([[carlos, 90]])]]),
      }),
  };
  const fees = { monthlyFees: () => Promise.resolve(new Map([['ana', 4500]])) };
  const rows = await new Profitability(
    fx,
    duties,
    fx,
    fx,
    new ListSettlements(fx, fx, fx, fx),
    load,
    fees,
    fx.clock,
  ).execute('2026-09');
  assertEquals(rows.map((r) => [r.teacherName, r.minutes, r.costCents, r.incomeCents]), [
    ['Carlos Ruiz Márquez', 0, 0, 4500],
    ['Lucía Moreno Gil', 180, 4800, 0],
  ]);
});

Deno.test('Advances should be discounted from the settlement of their month and count as paid ahead before it', async () => {
  const { fx, carlos, list } = setUp();
  // Carlos: martes de octubre 1,5 h a 18 €/h (4 martes: 108 €). Se le adelantaron 90 € el 30 de septiembre.
  await fx.recordMonth('2026-10');
  const record = new RecordAdvance(fx, fx, fx, fx);
  const id = await record.execute({
    teacherId: carlos,
    month: '2026-10',
    amount: '90',
    date: '2026-09-30',
    note: 'Pago de más en septiembre',
  });
  const october = (await list().execute('2026-10')).find((s) => s.teacherId === carlos);
  assertEquals([october?.amountCents, october?.advancesCents, october?.toPayCents], [
    10800,
    9000,
    1800,
  ]);
  await assertRejects(
    () =>
      record.execute({
        teacherId: carlos,
        month: '2026-10',
        amount: '0',
        date: '2026-09-30',
        note: null,
      }),
    InvalidValue,
  );
  // Pagada la liquidación de octubre, su anticipo ya no se puede quitar.
  await new PaySettlement(fx, fx, fx, fx, fx.transactions, fx.locks).execute(
    carlos,
    '2026-10',
    '2026-11-02',
  );
  await assertRejects(() => new DeleteAdvance(fx, fx, fx).execute(id), SettlementAlreadyPaid);
});

Deno.test('ChangeSettlementPaymentDate should move the payment date of a paid settlement', async () => {
  const { fx, carlos } = setUp();
  await fx.recordMonth('2026-10');
  const change = new ChangeSettlementPaymentDate(fx, fx);
  await assertRejects(() => change.execute(carlos, '2026-10', '2026-10-31'), InvalidValue);
  await new PaySettlement(fx, fx, fx, fx, fx.transactions, fx.locks).execute(
    carlos,
    '2026-10',
    '2026-11-08',
  );
  await change.execute(carlos, '2026-10', '2026-10-31');
  assertEquals(
    (await fx.settlement(TeacherRef.fromString(carlos), YearMonth.fromString('2026-10')))?.paidOn
      .toString(),
    '2026-10-31',
  );
});

Deno.test('TeacherReport should gather the months, payments and balance of a teacher', async () => {
  const { fx, carlos, duties, list } = setUp();
  await fx.recordMonth('2026-09');
  await fx.recordMonth('2026-10');
  // Septiembre pagado; octubre pendiente con 90 € adelantados; 50 € adelantados para noviembre.
  await new PaySettlement(fx, fx, fx, fx, fx.transactions, fx.locks).execute(
    carlos,
    '2026-09',
    '2026-09-30',
  );
  const advance = new RecordAdvance(fx, fx, fx, fx);
  await advance.execute({
    teacherId: carlos,
    month: '2026-10',
    amount: '90',
    date: '2026-09-30',
    note: null,
  });
  await advance.execute({
    teacherId: carlos,
    month: '2026-11',
    amount: '50',
    date: '2026-10-20',
    note: null,
  });
  const query = {
    groups: () => Promise.resolve([]),
    students: () => Promise.resolve([]),
    substitutions: () => Promise.resolve([]),
    duties: () => Promise.resolve([]),
  };
  const profitability = new Profitability(
    fx,
    duties,
    fx,
    fx,
    list(),
    { classLoad: () => Promise.resolve({ teachers: new Map(), students: new Map() }) },
    { monthlyFees: () => Promise.resolve(new Map()) },
    fx.clock,
  );
  const report = await new TeacherReport(fx, list(), profitability, fx, query, fx.clock).execute(
    carlos,
    null,
  );
  assertEquals(report.months.map((m) => [m.month, m.minutes, m.toPayCents, m.status]), [
    ['2026-09', 450, 13500, 'paid'],
    ['2026-10', 360, 1800, 'pending'],
  ]);
  // Le debemos 18 € de octubre, pero ya tiene 50 € de noviembre: 32 € pagados de más.
  assertEquals(report.balanceCents, 1800 - 5000);
  assertEquals(report.payments.map((p) => [p.date, p.kind, p.month, p.amountCents]), [
    ['2026-10-20', 'advance', '2026-11', 5000],
    ['2026-09-30', 'settlement', '2026-09', 13500],
    ['2026-09-30', 'advance', '2026-10', 9000],
  ]);
});

Deno.test('TeacherAgenda should list the classes a teacher gives each day, with substitutions and without holidays', async () => {
  const { fx, lucia, carlos, duties, substitutions } = setUp();
  await fx.add(LocalDate.fromString('2026-10-12'), 'Fiesta Nacional');
  const iniciacion = fx.scheduledGroups[0];
  if (!iniciacion) throw new Error('Falta el grupo');
  // Carlos da la clase de Lucía del miércoles 14.
  fx.substitutions.set(
    'sub-1',
    new Substitution(
      iniciacion.id,
      LocalDate.fromString('2026-10-14'),
      TeacherRef.fromString(carlos),
      'Torneo',
    ),
  );
  const agenda = new TeacherAgenda(fx, duties, substitutions, fx);
  const week = (teacher: string) =>
    agenda.execute(teacher, '2026-10-12', '2026-10-18').then((items) =>
      items.map((i) => [i.date, i.label, i.start, i.minutes, i.substitution])
    );

  assertEquals(await week(lucia), [], 'el lunes es festivo y el miércoles la da Carlos');
  assertEquals(await week(carlos), [
    ['2026-10-13', 'Adultos I', '17:00', 90, false],
    ['2026-10-14', 'Iniciación A', '17:00', 60, true],
  ]);
  assertEquals((await agenda.execute(lucia, '2026-10-19', '2026-10-25')).length, 2);
  await assertRejects(
    () => agenda.execute(lucia, '2026-10-01', '2026-12-31'),
    InvalidValue,
    '62 días',
  );
});

Deno.test('TeacherPayStatus should show a teacher their hours and pay month by month and the season totals', async () => {
  const { fx, lucia, propose, pay } = setUp();
  await propose();
  await pay().execute(lucia, '2026-10', '2026-10-31');
  const status = await new TeacherPayStatus(fx, new ListSettlements(fx, fx, fx, fx), fx.clock)
    .execute(lucia, null);

  assertEquals(status.season, 2026);
  assertEquals(status.months.map((m) => [m.month, m.minutes, m.status]), [
    ['2026-09', 0, 'none'],
    ['2026-10', 8 * 60, 'paid'],
  ]);
  const october = status.months[1];
  assertEquals(status.totals, {
    minutes: 8 * 60,
    amountCents: october?.amountCents,
    receivedCents: october?.toPayCents,
    owedCents: 0,
  });
  assertEquals(Object.keys(october ?? {}).includes('incomeCents'), false, 'sin ingresos ni margen');
});
