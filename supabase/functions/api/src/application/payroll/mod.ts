import {
  type Clock,
  InvalidValue,
  LocalDate,
  type Money,
  YearMonth,
} from '../../domain/common/mod.ts';
import {
  GroupRef,
  MonthlySettlement,
  type ScheduledGroup,
  SessionMinutes,
  SessionPlanner,
  type Settlement,
  SettlementAlreadyPaid,
  SettlementCalculator,
  TeacherRef,
  TimesheetEntry,
  TimesheetEntryId,
} from '../../domain/payroll/mod.ts';
import {
  type ClosedPeriods,
  type Locks,
  PeriodClosed,
  type TransactionRunner,
} from '../common/mod.ts';

// ---- Puertos ---------------------------------------------------------------------------------

export interface TeacherRate {
  id: string;
  name: string;
  rate: Money;
  active: boolean;
}

export interface TeacherRates {
  all(): Promise<TeacherRate[]>;
}

export interface ScheduleDirectory {
  groups(): Promise<ScheduledGroup[]>;
}

export interface TimesheetRepository {
  entry(id: TimesheetEntryId): Promise<TimesheetEntry | null>;
  save(entry: TimesheetEntry): Promise<void>;
  delete(id: TimesheetEntryId): Promise<void>;
  forMonth(month: YearMonth): Promise<TimesheetEntry[]>;
  onDate(date: LocalDate): Promise<TimesheetEntry[]>;
}

export interface SettlementRepository {
  settlement(teacher: TeacherRef, month: YearMonth): Promise<MonthlySettlement | null>;
  settlementsOf(month: YearMonth): Promise<MonthlySettlement[]>;
  saveSettlement(settlement: MonthlySettlement): Promise<void>;
}

/** Meses cuyas sesiones ya se propusieron a partir del horario. */
export interface ProposalLog {
  wasProposed(month: YearMonth): Promise<boolean>;
  markProposed(month: YearMonth): Promise<void>;
}

/** Fila del registro de horas. */
export interface SessionView {
  id: string;
  date: string;
  teacherId: string;
  teacherName: string;
  groupId: string | null;
  label: string;
  minutes: number;
  costCents: number;
  fromSchedule: boolean;
  locked: boolean;
}

export interface TeacherActivity {
  groups: string[];
  occupied: number;
  capacity: number;
  incomeCents: number;
}

export interface PayrollQuery {
  /** Sesiones del mes, por fecha; el coste usa la tarifa congelada si la liquidación está pagada. */
  sessions(month: YearMonth, teacherId: string | null): Promise<SessionView[]>;
  /** Grupos, ocupación e ingresos atribuidos por profesor en el mes (claves: id de profesor). */
  activity(month: YearMonth): Promise<Map<string, TeacherActivity>>;
}

export class SessionNotFound extends Error {
  constructor() {
    super('No existe esa sesión.');
    this.name = 'SessionNotFound';
  }
}

// ---- Casos de uso ----------------------------------------------------------------------------

/** Las sesiones de una liquidación pagada no se tocan. */
async function ensureOpen(
  settlements: SettlementRepository,
  teacher: TeacherRef,
  month: YearMonth,
): Promise<void> {
  if ((await settlements.settlement(teacher, month)) !== null) throw new SettlementAlreadyPaid();
}

/** Las sesiones solo se apuntan a profesores que existen (si no, desaparecerían de todas las vistas). */
async function ensureTeacherExists(
  teachers: TeacherRates,
  teacher: TeacherRef,
): Promise<TeacherRate> {
  const found = (await teachers.all()).find((t) => t.id === teacher.value);
  if (!found) throw new InvalidValue('teacherId', 'Ese profesor no existe.');
  return found;
}

/**
 * Propone, una sola vez por mes y solo para el mes en curso o el anterior, las sesiones del horario.
 * Lo que administración borre después no vuelve a aparecer.
 */
export class ProposeMonthSessions {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly log: ProposalLog,
    private readonly clock: Clock,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  async execute(month: string): Promise<void> {
    const period = YearMonth.fromString(month);
    const current = YearMonth.of(LocalDate.fromInstant(this.clock.now()));
    // Solo el mes en curso y el anterior (el que se liquida): un mes antiguo no se rellena con el horario de hoy.
    if (!period.equals(current) && !period.next().equals(current)) return;
    await this.transactions.run(async () => {
      await this.locks.acquire(`payroll:proposal:${period.toString()}`);
      if (await this.log.wasProposed(period)) return;
      for (const session of new SessionPlanner().plan(period, await this.schedule.groups())) {
        if ((await this.settlements.settlement(session.group.teacher, period)) !== null) continue;
        await this.timesheets.save(
          TimesheetEntry.record(
            TimesheetEntryId.generate(),
            session.group.teacher,
            session.date,
            session.group.id,
            session.group.name,
            session.minutes,
            true,
          ),
        );
      }
      await this.log.markProposed(period);
    });
  }
}

export interface SessionInput {
  teacherId: string;
  date: string;
  groupId: string | null;
  activity: string | null;
  hours: number;
}

/** Añade a mano una sesión de un grupo (p. ej. una recuperación) u otra actividad. */
export class RecordSession {
  constructor(
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly schedule: ScheduleDirectory,
    private readonly teachers: TeacherRates,
  ) {}

  async execute(input: SessionInput): Promise<string> {
    const teacher = TeacherRef.fromString(input.teacherId);
    await ensureTeacherExists(this.teachers, teacher);
    const date = LocalDate.fromString(input.date);
    let group: GroupRef | null = null;
    let label = input.activity ?? '';
    if (input.groupId) {
      const groupId = GroupRef.fromString(input.groupId);
      const match = (await this.schedule.groups()).find((g) => g.id.equals(groupId));
      if (!match) throw new InvalidValue('groupId', 'Ese grupo no existe.');
      group = match.id;
      label = match.name;
    }
    const entry = TimesheetEntry.record(
      TimesheetEntryId.generate(),
      teacher,
      date,
      group,
      label,
      SessionMinutes.fromHours(input.hours),
      false,
    );
    await ensureOpen(this.settlements, teacher, entry.month());
    await this.timesheets.save(entry);
    return entry.id.value;
  }
}

/** Cambia el profesor (sustitución) o las horas de una sesión. */
export class UpdateSession {
  constructor(
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly teachers: TeacherRates,
  ) {}

  async execute(id: string, teacherId: string, hours: number): Promise<void> {
    const entry = await this.timesheets.entry(TimesheetEntryId.fromString(id));
    if (entry === null) throw new SessionNotFound();
    const teacher = TeacherRef.fromString(teacherId);
    await ensureTeacherExists(this.teachers, teacher);
    await ensureOpen(this.settlements, entry.teacher(), entry.month());
    await ensureOpen(this.settlements, teacher, entry.month());
    entry.reassign(teacher);
    entry.changeDuration(SessionMinutes.fromHours(hours));
    await this.timesheets.save(entry);
  }
}

export class DeleteSession {
  constructor(
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const entry = await this.timesheets.entry(TimesheetEntryId.fromString(id));
    if (entry === null) throw new SessionNotFound();
    await ensureOpen(this.settlements, entry.teacher(), entry.month());
    await this.timesheets.delete(entry.id);
  }
}

/** Día festivo: quita sus sesiones, salvo las de liquidaciones ya pagadas. Devuelve cuántas quitó. */
export class MarkHoliday {
  constructor(
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
  ) {}

  async execute(date: string): Promise<number> {
    let removed = 0;
    for (const entry of await this.timesheets.onDate(LocalDate.fromString(date))) {
      if ((await this.settlements.settlement(entry.teacher(), entry.month())) === null) {
        await this.timesheets.delete(entry.id);
        removed++;
      }
    }
    return removed;
  }
}

export interface SettlementView {
  teacherId: string;
  teacherName: string;
  month: string;
  minutes: number;
  rateCents: number;
  amountCents: number;
  lines: { label: string; minutes: number; amountCents: number }[];
  status: 'pending' | 'paid';
  paidOn: string | null;
}

/** Liquidaciones del mes: las pagadas tal como se congelaron y las pendientes con las horas y tarifa actuales. */
export class ListSettlements {
  constructor(
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly teachers: TeacherRates,
  ) {}

  /** Ordenadas por nombre. */
  async execute(month: string): Promise<SettlementView[]> {
    const period = YearMonth.fromString(month);
    const byTeacher = new Map<string, TimesheetEntry[]>();
    for (const entry of await this.timesheets.forMonth(period)) {
      byTeacher.set(entry.teacher().value, [
        ...(byTeacher.get(entry.teacher().value) ?? []),
        entry,
      ]);
    }
    const paid = new Map(
      (await this.settlements.settlementsOf(period)).map((s) => [s.teacher.value, s]),
    );
    const views: SettlementView[] = [];
    for (const teacher of await this.teachers.all()) {
      const settled = paid.get(teacher.id) ?? null;
      const entries = byTeacher.get(teacher.id) ?? [];
      if (settled === null && entries.length === 0) continue;
      const settlement = settled?.settlement ??
        new SettlementCalculator().settle(entries, teacher.rate);
      views.push(view(teacher, period, settlement, settled?.paidOn.toString() ?? null));
    }
    return views.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'es'));
  }
}

function view(
  teacher: TeacherRate,
  month: YearMonth,
  s: Settlement,
  paidOn: string | null,
): SettlementView {
  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    month: month.toString(),
    minutes: s.minutes,
    rateCents: s.rate.cents,
    amountCents: s.amount.cents,
    lines: s.lines.map((l) => ({
      label: l.label,
      minutes: l.minutes,
      amountCents: l.amount.cents,
    })),
    status: paidOn === null ? 'pending' : 'paid',
    paidOn,
  };
}

/** Marca como pagada la liquidación de un profesor y mes, congelando horas, tarifa e importe. */
export class PaySettlement {
  constructor(
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly teachers: TeacherRates,
    private readonly closed: ClosedPeriods,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  execute(teacherId: string, month: string, paidOn: string): Promise<void> {
    const teacher = TeacherRef.fromString(teacherId);
    const period = YearMonth.fromString(month);
    return this.transactions.run(async () => {
      await this.locks.acquire(`payroll:settlement:${teacher.value}:${period.toString()}`);
      await ensureOpen(this.settlements, teacher, period);
      await PeriodClosed.guard(this.closed, LocalDate.fromString(paidOn));
      const rate = await ensureTeacherExists(this.teachers, teacher);
      const entries = (await this.timesheets.forMonth(period)).filter((e) =>
        e.teacher().equals(teacher)
      );
      if (entries.length === 0) {
        throw new InvalidValue('month', 'Ese profesor no tiene horas registradas en el mes.');
      }
      await this.settlements.saveSettlement(
        new MonthlySettlement(
          teacher,
          period,
          new SettlementCalculator().settle(entries, rate.rate),
          LocalDate.fromString(paidOn),
        ),
      );
    });
  }
}

/** Marca como pagadas todas las liquidaciones pendientes del mes. Devuelve cuántas. */
export class PayAllSettlements {
  constructor(
    private readonly pay: PaySettlement,
    private readonly list: ListSettlements,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Todas o ninguna: si una falla, no queda ninguna marcada. */
  execute(month: string, paidOn: string): Promise<number> {
    return this.transactions.run(async () => {
      const pending = (await this.list.execute(month)).filter((s) =>
        s.status === 'pending' && s.minutes > 0
      );
      for (const settlement of pending) await this.pay.execute(settlement.teacherId, month, paidOn);
      return pending.length;
    });
  }
}

export interface ProfitabilityRow {
  teacherId: string;
  teacherName: string;
  groups: string[];
  minutes: number;
  rateCents: number;
  costCents: number;
  incomeCents: number;
  marginCents: number;
  incomePerHourCents: number | null;
  occupied: number;
  capacity: number;
}

/** Rentabilidad del mes por profesor: coste de su liquidación frente a los ingresos atribuidos a sus grupos. */
export class Profitability {
  constructor(
    private readonly settlements: ListSettlements,
    private readonly query: PayrollQuery,
    private readonly teachers: TeacherRates,
  ) {}

  /** Ordenadas por margen, de mayor a menor. */
  async execute(month: string): Promise<ProfitabilityRow[]> {
    const settlements = new Map(
      (await this.settlements.execute(month)).map((s) => [s.teacherId, s]),
    );
    const activity = await this.query.activity(YearMonth.fromString(month));
    const rows: ProfitabilityRow[] = [];
    for (const teacher of await this.teachers.all()) {
      const s = settlements.get(teacher.id) ?? null;
      const a = activity.get(teacher.id) ?? null;
      if (s === null && a === null) continue;
      const minutes = s?.minutes ?? 0;
      const cost = s?.amountCents ?? 0;
      const income = a?.incomeCents ?? 0;
      rows.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        groups: a?.groups ?? [],
        minutes,
        rateCents: s?.rateCents ?? teacher.rate.cents,
        costCents: cost,
        incomeCents: income,
        marginCents: income - cost,
        incomePerHourCents: minutes > 0 ? Math.round((income * 60) / minutes) : null,
        occupied: a?.occupied ?? 0,
        capacity: a?.capacity ?? 0,
      });
    }
    return rows.sort((a, b) => b.marginCents - a.marginCents);
  }
}
