import type { LocalDate } from '../../src/domain/common/mod.ts';
import { Money, type YearMonth } from '../../src/domain/common/mod.ts';
import {
  GroupRef,
  type MonthlySettlement,
  ScheduledGroup,
  TeacherRef,
  type TimesheetEntry,
  type TimesheetEntryId,
} from '../../src/domain/payroll/mod.ts';
import type {
  ProposalLog,
  ScheduleDirectory,
  SettlementRepository,
  TeacherRate,
  TeacherRates,
  TimesheetRepository,
} from '../../src/application/payroll/mod.ts';
import type { ClosedPeriods } from '../../src/application/common/mod.ts';
import { RecordingLocks } from './billing.ts';
import { ImmediateTransactionRunner } from './classes.ts';
import { FrozenClock } from './identity.ts';

/** Dobles en memoria de los puertos de Payroll. */
export class PayrollFixture
  implements
    ClosedPeriods,
    ScheduleDirectory,
    TeacherRates,
    TimesheetRepository,
    SettlementRepository,
    ProposalLog {
  scheduledGroups: ScheduledGroup[] = [];
  teachers = new Map<string, TeacherRate>();
  entries = new Map<string, TimesheetEntry>();
  paidSettlements = new Map<string, MonthlySettlement>();
  proposed = new Set<string>();
  closed = false;
  readonly clock: FrozenClock;
  readonly transactions = new ImmediateTransactionRunner();
  readonly locks = new RecordingLocks();

  constructor(now = '2026-10-20T10:00:00+02:00') {
    this.clock = new FrozenClock(now);
  }

  teacherWithGroup(
    name: string,
    rateCents: number,
    group: string,
    weekdays: number[],
    minutes: number,
  ): string {
    const teacher = TeacherRef.generate();
    this.teachers.set(teacher.value, {
      id: teacher.value,
      name,
      rate: Money.cents(rateCents),
      active: true,
    });
    this.scheduledGroups.push(
      new ScheduledGroup(GroupRef.generate(), group, teacher, weekdays, minutes),
    );
    return teacher.value;
  }

  groups(): Promise<ScheduledGroup[]> {
    return Promise.resolve(this.scheduledGroups);
  }

  all(): Promise<TeacherRate[]> {
    return Promise.resolve([...this.teachers.values()]);
  }

  entry(id: TimesheetEntryId): Promise<TimesheetEntry | null> {
    return Promise.resolve(this.entries.get(id.value) ?? null);
  }

  save(entry: TimesheetEntry): Promise<void> {
    this.entries.set(entry.id.value, entry);
    return Promise.resolve();
  }

  delete(id: TimesheetEntryId): Promise<void> {
    this.entries.delete(id.value);
    return Promise.resolve();
  }

  forMonth(month: YearMonth): Promise<TimesheetEntry[]> {
    return Promise.resolve([...this.entries.values()].filter((e) => e.month().equals(month)));
  }

  onDate(date: LocalDate): Promise<TimesheetEntry[]> {
    return Promise.resolve([...this.entries.values()].filter((e) => e.date.equals(date)));
  }

  settlement(teacher: TeacherRef, month: YearMonth): Promise<MonthlySettlement | null> {
    return Promise.resolve(this.paidSettlements.get(teacher.value + month.toString()) ?? null);
  }

  settlementsOf(month: YearMonth): Promise<MonthlySettlement[]> {
    return Promise.resolve([...this.paidSettlements.values()].filter((s) => s.month.equals(month)));
  }

  saveSettlement(settlement: MonthlySettlement): Promise<void> {
    this.paidSettlements.set(settlement.teacher.value + settlement.month.toString(), settlement);
    return Promise.resolve();
  }

  wasProposed(month: YearMonth): Promise<boolean> {
    return Promise.resolve(this.proposed.has(month.toString()));
  }

  markProposed(month: YearMonth): Promise<void> {
    this.proposed.add(month.toString());
    return Promise.resolve();
  }

  isClosed(): Promise<boolean> {
    return Promise.resolve(this.closed);
  }
}
