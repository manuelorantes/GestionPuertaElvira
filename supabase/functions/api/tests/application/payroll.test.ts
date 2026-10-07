import { assertEquals, assertRejects } from '@std/assert';

import { InvalidValue, LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  SettlementAlreadyPaid,
  TeacherRef,
  type TimesheetEntry,
} from '../../src/domain/payroll/mod.ts';
import {
  AddHoliday,
  CancelSubstitution,
  DeleteSession,
  ListSettlements,
  PayAllSettlements,
  PaySettlement,
  PlanSubstitution,
  ProposeSessions,
  RecordSession,
  RefillDay,
  SaveDuty,
  SubstituteTeacher,
  SubstitutionNeedsReason,
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
  const list = () => new ListSettlements(fx, fx, fx);
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
  await new CancelSubstitution(fx, substitutions, fx, fx).execute(id);
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
