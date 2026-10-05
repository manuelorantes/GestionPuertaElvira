import { assertEquals, assertFalse, assertRejects } from '@std/assert';

import { InvalidValue, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  SettlementAlreadyPaid,
  TeacherRef,
  type TimesheetEntry,
} from '../../src/domain/payroll/mod.ts';
import {
  DeleteSession,
  ListSettlements,
  MarkHoliday,
  PayAllSettlements,
  PaySettlement,
  ProposeMonthSessions,
  RecordSession,
  UpdateSession,
} from '../../src/application/payroll/mod.ts';
import { PeriodClosed } from '../../src/application/common/mod.ts';
import { PayrollFixture } from '../support/payroll.ts';

function setUp() {
  const fx = new PayrollFixture();
  const lucia = fx.teacherWithGroup('Lucía Moreno Gil', 1600, 'Iniciación A', [1, 3], 60);
  const carlos = fx.teacherWithGroup('Carlos Ruiz Márquez', 1800, 'Adultos I', [2], 90);
  const propose = (month: string) =>
    new ProposeMonthSessions(fx, fx, fx, fx, fx.clock, fx.transactions, fx.locks).execute(month);
  const pay = () => new PaySettlement(fx, fx, fx, fx, fx.transactions, fx.locks);
  const list = () => new ListSettlements(fx, fx, fx);
  return { fx, lucia, carlos, propose, pay, list };
}

Deno.test('ProposeMonthSessions should propose the month once, respect deletions and skip old and future months', async () => {
  const { fx, propose } = setUp();
  await propose('2026-10');
  assertEquals(fx.entries.size, 8 + 4);
  const first = [...fx.entries.keys()][0] as string;
  await new DeleteSession(fx, fx).execute(first);
  await propose('2026-10');
  assertEquals(fx.entries.size, 11);

  const old = setUp();
  await old.propose('2026-08');
  await old.propose('2025-10');
  await old.propose('2026-11');
  assertEquals(old.fx.entries.size, 0);
  assertFalse(await old.fx.wasProposed(YearMonth.fromString('2026-11')));
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

Deno.test('UpdateSession and MarkHoliday should substitute a teacher and remove a day', async () => {
  const { fx, carlos, propose } = setUp();
  await propose('2026-10');
  const monday = [...fx.entries.values()].find((e) =>
    e.date.toString() === '2026-10-12'
  ) as TimesheetEntry;
  await new UpdateSession(fx, fx, fx).execute(monday.id.value, carlos, 1.5);
  assertEquals(monday.teacher().value, carlos);
  assertEquals(monday.minutes().minutes, 90);
  assertEquals(await new MarkHoliday(fx, fx).execute('2026-10-12'), 1);
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
