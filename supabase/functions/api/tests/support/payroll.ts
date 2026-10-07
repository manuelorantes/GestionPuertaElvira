import type { LocalDate } from '../../src/domain/common/mod.ts';
import { Money, type YearMonth } from '../../src/domain/common/mod.ts';
import {
  type ClubDuty,
  type DutyRef,
  GroupRef,
  type MonthlySettlement,
  ScheduledGroup,
  type Substitution,
  TeacherRef,
  type TimesheetEntry,
  type TimesheetEntryId,
} from '../../src/domain/payroll/mod.ts';
import type {
  DutyRepository,
  HolidayCalendar,
  ProposalLog,
  ScheduleDirectory,
  SettlementRepository,
  SubstitutionRepository,
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
    ProposalLog,
    HolidayCalendar {
  scheduledGroups: ScheduledGroup[] = [];
  teachers = new Map<string, TeacherRate>();
  entries = new Map<string, TimesheetEntry>();
  paidSettlements = new Map<string, MonthlySettlement>();
  proposed = new Set<string>();
  holidays = new Map<string, string>();
  duties = new Map<string, ClubDuty>();
  substitutions = new Map<string, Substitution>();
  closed = false;
  readonly clock: FrozenClock;
  readonly transactions = new ImmediateTransactionRunner();
  readonly locks = new RecordingLocks();

  /** Por defecto, el 31 de octubre por la noche: todas las clases de octubre han terminado. */
  constructor(now = '2026-10-31T23:00:00+01:00') {
    this.clock = new FrozenClock(now);
  }

  teacherWithGroup(
    name: string,
    rateCents: number,
    group: string,
    weekdays: number[],
    minutes: number,
    start = 17 * 60,
  ): string {
    const teacher = TeacherRef.generate();
    this.teachers.set(teacher.value, {
      id: teacher.value,
      name,
      rate: Money.cents(rateCents),
      active: true,
    });
    this.scheduledGroups.push(
      new ScheduledGroup(GroupRef.generate(), group, teacher, weekdays, minutes, start),
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

  wasProposed(date: LocalDate): Promise<boolean> {
    return Promise.resolve(this.proposed.has(date.toString()));
  }

  markProposed(date: LocalDate): Promise<void> {
    this.proposed.add(date.toString());
    return Promise.resolve();
  }

  /** Da por apuntados todos los días de un mes (como si ya se hubieran propuesto antes). */
  markMonthProposed(month: YearMonth): void {
    for (let day = month.firstDay(); !month.lastDay().isBefore(day); day = day.plusDays(1)) {
      this.proposed.add(day.toString());
    }
  }

  isHoliday(date: LocalDate): Promise<boolean> {
    return Promise.resolve(this.holidays.has(date.toString()));
  }

  add(date: LocalDate, name: string): Promise<void> {
    this.holidays.set(date.toString(), name);
    return Promise.resolve();
  }

  remove(date: LocalDate): Promise<void> {
    this.holidays.delete(date.toString());
    return Promise.resolve();
  }

  duty(id: DutyRef): Promise<ClubDuty | null> {
    return Promise.resolve(this.duties.get(id.value) ?? null);
  }

  allDuties(): ClubDuty[] {
    return [...this.duties.values()];
  }

  isClosed(): Promise<boolean> {
    return Promise.resolve(this.closed);
  }
}

/** Turnos fijos del doble. */
export class DutyFixture implements DutyRepository {
  constructor(private readonly fx: PayrollFixture) {}

  all(): Promise<ClubDuty[]> {
    return Promise.resolve(this.fx.allDuties());
  }

  duty(id: DutyRef): Promise<ClubDuty | null> {
    return this.fx.duty(id);
  }

  save(duty: ClubDuty): Promise<void> {
    this.fx.duties.set(duty.id.value, duty);
    return Promise.resolve();
  }

  delete(id: DutyRef): Promise<void> {
    this.fx.duties.delete(id.value);
    return Promise.resolve();
  }
}

/** Sustituciones del doble. */
export class SubstitutionFixture implements SubstitutionRepository {
  constructor(private readonly fx: PayrollFixture) {}

  onDate(date: LocalDate): Promise<Substitution[]> {
    return Promise.resolve([...this.fx.substitutions.values()].filter((s) => s.date.equals(date)));
  }

  find(source: string, date: LocalDate) {
    const entry = [...this.fx.substitutions.entries()].find(([, s]) =>
      s.source === source && s.date.equals(date)
    );
    return Promise.resolve(entry ? { id: entry[0], substitution: entry[1] } : null);
  }

  byId(id: string): Promise<Substitution | null> {
    return Promise.resolve(this.fx.substitutions.get(id) ?? null);
  }

  save(id: string, substitution: Substitution): Promise<void> {
    this.fx.substitutions.set(id, substitution);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.fx.substitutions.delete(id);
    return Promise.resolve();
  }
}
