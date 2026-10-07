import {
  type Clock,
  InvalidValue,
  LocalDate,
  minutesOfDayInMadrid,
  type Money,
  YearMonth,
} from '../../domain/common/mod.ts';
import {
  ClubDuty,
  DailyPlanner,
  DutyRef,
  ExpectedHours,
  GroupRef,
  MonthlySettlement,
  type ScheduledGroup,
  SessionMinutes,
  type Settlement,
  SettlementAlreadyPaid,
  SettlementCalculator,
  Substitution,
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

/** Festivos del calendario oficial (España, Andalucía y Granada capital): no se apuntan horas solas. */
export interface HolidayCalendar {
  isHoliday(date: LocalDate): Promise<boolean>;
  add(date: LocalDate, name: string): Promise<void>;
  remove(date: LocalDate): Promise<void>;
}

/** Turnos fijos semanales («Encargado del club»…). */
export interface DutyRepository {
  all(): Promise<ClubDuty[]>;
  duty(id: DutyRef): Promise<ClubDuty | null>;
  save(duty: ClubDuty): Promise<void>;
  delete(id: DutyRef): Promise<void>;
}

/** Sustituciones planificadas. */
export interface SubstitutionRepository {
  onDate(date: LocalDate): Promise<Substitution[]>;
  find(
    group: GroupRef,
    date: LocalDate,
  ): Promise<{ id: string; substitution: Substitution } | null>;
  byId(id: string): Promise<Substitution | null>;
  save(id: string, substitution: Substitution): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SettlementRepository {
  settlement(teacher: TeacherRef, month: YearMonth): Promise<MonthlySettlement | null>;
  settlementsOf(month: YearMonth): Promise<MonthlySettlement[]>;
  saveSettlement(settlement: MonthlySettlement): Promise<void>;
}

/** Días cuyas sesiones ya se apuntaron solas (lo que se borre después no vuelve a aparecer). */
export interface ProposalLog {
  wasProposed(date: LocalDate): Promise<boolean>;
  markProposed(date: LocalDate): Promise<void>;
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

/** Grupos de un profesor y plazas de sus clases: ocupadas y totales, contando cada día de clase. */
export interface TeacherSeats {
  groups: string[];
  occupied: number;
  capacity: number;
}

export interface ClassLoad {
  teachers: Map<string, TeacherSeats>;
  /** Minutos semanales de cada alumno con cada profesor durante el mes (claves: alumno → profesor). */
  students: Map<string, Map<string, number>>;
}

/** Carga de clases del mes para la rentabilidad. */
export interface ClassLoadQuery {
  classLoad(month: YearMonth): Promise<ClassLoad>;
}

/**
 * Cuota mensual de cada alumno en el mes, después de descuentos (hermanos, pago adelantado…): la cobrada o por cobrar
 * y, en los meses futuros, la prevista. Sin cuotas de socio. Claves: id de alumno; importe en céntimos.
 */
export interface MonthlyFees {
  monthlyFees(month: YearMonth): Promise<Map<string, number>>;
}

export interface PayrollQuery {
  /** Sesiones del mes, por fecha; el coste usa la tarifa congelada si la liquidación está pagada. */
  sessions(month: YearMonth, teacherId: string | null): Promise<SessionView[]>;
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
 * Apunta solas las horas día a día: al acabar cada clase (o el turno de encargado) se crea su sesión, para quien la
 * da ese día (el titular o quien le sustituye). Solo desde el mes anterior hasta hoy; los festivos no cuentan; un día
 * ya apuntado no se rellena otra vez (lo que se borre no vuelve) y no se toca lo de liquidaciones pagadas.
 */
export class ProposeSessions {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly duties: DutyRepository,
    private readonly substitutions: SubstitutionRepository,
    private readonly holidays: HolidayCalendar,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly log: ProposalLog,
    private readonly clock: Clock,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  async execute(): Promise<void> {
    const now = this.clock.now();
    const today = LocalDate.fromInstant(now);
    const first = LocalDate.fromString(`${YearMonth.of(today).previous().toString()}-01`);
    await this.transactions.run(async () => {
      await this.locks.acquire('payroll:proposal');
      const groups = await this.schedule.groups();
      const duties = await this.duties.all();
      for (let date = first; !today.isBefore(date); date = date.plusDays(1)) {
        if (await this.log.wasProposed(date)) continue;
        const past = date.isBefore(today);
        if (!(await this.holidays.isHoliday(date))) {
          const planned = new DailyPlanner().plan(
            date,
            groups,
            duties,
            await this.substitutions.onDate(date),
            past ? null : minutesOfDayInMadrid(now),
          );
          const existing = new Set(
            (await this.timesheets.onDate(date)).map((e) => e.source).filter((s) => s !== null),
          );
          for (const session of planned) {
            if (existing.has(session.source)) continue;
            if ((await this.settlements.settlement(session.teacher, YearMonth.of(date))) !== null) {
              continue;
            }
            await this.timesheets.save(
              TimesheetEntry.planned(TimesheetEntryId.generate(), session),
            );
          }
        }
        if (past) await this.log.markProposed(date);
      }
    });
  }
}

/**
 * Apunta las horas automáticas de un día ya pasado que falten (p. ej. si ese día no se llegaron a apuntar), sin
 * duplicar las que ya hay. No hace nada en festivos ni toca liquidaciones pagadas. Devuelve cuántas creó.
 */
export class RefillDay {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly duties: DutyRepository,
    private readonly substitutions: SubstitutionRepository,
    private readonly holidays: HolidayCalendar,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly log: ProposalLog,
    private readonly clock: Clock,
  ) {}

  async execute(date: string): Promise<number> {
    const day = LocalDate.fromString(date);
    if (!day.isBefore(LocalDate.fromInstant(this.clock.now()))) {
      throw new InvalidValue('date', 'Solo se pueden apuntar días que ya han pasado.');
    }
    if (await this.holidays.isHoliday(day)) return 0;
    const existing = new Set(
      (await this.timesheets.onDate(day)).map((e) => e.source).filter((s) => s !== null),
    );
    let created = 0;
    for (
      const session of new DailyPlanner().plan(
        day,
        await this.schedule.groups(),
        await this.duties.all(),
        await this.substitutions.onDate(day),
        null,
      )
    ) {
      if (existing.has(session.source)) continue;
      if ((await this.settlements.settlement(session.teacher, YearMonth.of(day))) !== null) {
        continue;
      }
      await this.timesheets.save(TimesheetEntry.planned(TimesheetEntryId.generate(), session));
      created++;
    }
    await this.log.markProposed(day);
    return created;
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

/**
 * Rentabilidad del mes por profesor. Coste: las horas esperadas del mes según el horario (sin festivos ni
 * sustituciones) a su tarifa. Ingresos: las cuotas mensuales de sus alumnos, repartidas entre profesores según las horas
 * que pasa con cada uno. Ocupación: plazas ocupadas de todas sus clases frente a las totales.
 */
export class Profitability {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly duties: DutyRepository,
    private readonly holidays: HolidayCalendar,
    private readonly teachers: TeacherRates,
    private readonly settlements: ListSettlements,
    private readonly load: ClassLoadQuery,
    private readonly fees: MonthlyFees,
  ) {}

  /** Ordenadas por margen, de mayor a menor. */
  async execute(month: string): Promise<ProfitabilityRow[]> {
    const period = YearMonth.fromString(month);
    const holidays = new Set<string>();
    for (let day = period.firstDay(); !period.lastDay().isBefore(day); day = day.plusDays(1)) {
      if (await this.holidays.isHoliday(day)) holidays.add(day.toString());
    }
    const expected = new ExpectedHours().ofMonth(
      period,
      await this.schedule.groups(),
      await this.duties.all(),
      holidays,
    );
    // La tarifa congelada si la liquidación ya está pagada; si no, la actual.
    const rates = new Map(
      (await this.settlements.execute(month)).map((s) => [s.teacherId, s.rateCents]),
    );
    const load = await this.load.classLoad(period);
    const income = new Map<string, number>();
    for (const [student, fee] of await this.fees.monthlyFees(period)) {
      const shares = load.students.get(student);
      if (!shares) continue;
      const total = [...shares.values()].reduce((sum, m) => sum + m, 0);
      if (total === 0) continue;
      for (const [teacher, minutes] of shares) {
        income.set(teacher, (income.get(teacher) ?? 0) + (fee * minutes) / total);
      }
    }
    const rows: ProfitabilityRow[] = [];
    for (const teacher of await this.teachers.all()) {
      const minutes = expected.get(teacher.id) ?? 0;
      const seats = load.teachers.get(teacher.id) ?? null;
      const earned = Math.round(income.get(teacher.id) ?? 0);
      if (minutes === 0 && earned === 0 && seats === null) continue;
      const rate = rates.get(teacher.id) ?? teacher.rate.cents;
      const cost = Math.round((rate * minutes) / 60);
      rows.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        groups: seats?.groups ?? [],
        minutes,
        rateCents: rate,
        costCents: cost,
        incomeCents: earned,
        marginCents: earned - cost,
        incomePerHourCents: minutes > 0 ? Math.round((earned * 60) / minutes) : null,
        occupied: seats?.occupied ?? 0,
        capacity: seats?.capacity ?? 0,
      });
    }
    return rows.sort((a, b) => b.marginCents - a.marginCents);
  }
}

// ---- Sustituciones ---------------------------------------------------------------------------

export class SubstitutionNeedsReason extends Error {
  constructor(readonly busyWith: string) {
    super(
      `Ese profesor ya tiene ${busyWith} a esa hora: indica el motivo para que dé las dos clases a la vez.`,
    );
    this.name = 'SubstitutionNeedsReason';
  }
}

export class SubstitutionNotFound extends Error {
  constructor() {
    super('No existe esa sustitución.');
    this.name = 'SubstitutionNotFound';
  }
}

export interface SubstitutionInput {
  groupId: string;
  date: string;
  teacherId: string;
  reason: string | null;
}

/**
 * Planifica una sustitución: ese día la clase la da otro profesor. Si a esa hora ya tiene otra clase o un turno, es
 * un caso especial (da las dos a la vez, no suma horas dobles) y hay que indicar el motivo. Si la sesión de ese día ya
 * estaba apuntada, pasa a quien sustituye.
 */
export class PlanSubstitution {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly duties: DutyRepository,
    private readonly substitutions: SubstitutionRepository,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly teachers: TeacherRates,
  ) {}

  async execute(input: SubstitutionInput): Promise<string> {
    const date = LocalDate.fromString(input.date);
    const groupRef = GroupRef.fromString(input.groupId);
    const teacher = TeacherRef.fromString(input.teacherId);
    await ensureTeacherExists(this.teachers, teacher);
    const groups = await this.schedule.groups();
    const group = groups.find((g) => g.id.equals(groupRef));
    if (!group) throw new InvalidValue('groupId', 'Ese grupo no existe.');
    if (!group.weekdays.includes(date.isoWeekday())) {
      throw new InvalidValue('date', 'Ese grupo no tiene clase ese día.');
    }
    if (group.teacher.equals(teacher)) {
      throw new InvalidValue('teacherId', 'Elige un profesor distinto del titular.');
    }
    const reason = input.reason?.trim() || null;
    const busy = busyWith(group, teacher, date, groups, await this.duties.all());
    if (busy !== null && reason === null) throw new SubstitutionNeedsReason(busy);
    const existing = await this.substitutions.find(groupRef, date);
    const id = existing?.id ?? crypto.randomUUID();
    await this.substitutions.save(id, new Substitution(groupRef, date, teacher, reason));
    await reassignSession(this.timesheets, this.settlements, group, date, teacher);
    return id;
  }
}

export interface TeacherSubstitutionInput {
  teacherId: string;
  substituteId: string;
  from: string;
  to: string;
  reason: string | null;
}

/** Máximo de días de una sustitución de profesor de una vez. */
const MAX_SUBSTITUTION_DAYS = 62;

/**
 * Sustituye a un profesor por otro en todas sus clases de unos días (lo habitual): crea la sustitución de cada clase
 * suya en esos días, salvo festivos. Si quien sustituye ya tiene clase o turno a la hora de alguna, hace falta un
 * motivo y no se guarda nada. Devuelve cuántas clases sustituye.
 */
export class SubstituteTeacher {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly duties: DutyRepository,
    private readonly substitutions: SubstitutionRepository,
    private readonly holidays: HolidayCalendar,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
    private readonly teachers: TeacherRates,
  ) {}

  async execute(input: TeacherSubstitutionInput): Promise<number> {
    const absent = TeacherRef.fromString(input.teacherId);
    const substitute = TeacherRef.fromString(input.substituteId);
    if (absent.equals(substitute)) {
      throw new InvalidValue('substituteId', 'Elige un profesor distinto del que falta.');
    }
    await ensureTeacherExists(this.teachers, absent);
    await ensureTeacherExists(this.teachers, substitute);
    const from = LocalDate.fromString(input.from);
    const to = LocalDate.fromString(input.to);
    if (to.isBefore(from)) {
      throw new InvalidValue('to', 'El último día no puede ser anterior al primero.');
    }
    if (from.plusDays(MAX_SUBSTITUTION_DAYS).isBefore(to)) {
      throw new InvalidValue('to', `Como mucho ${MAX_SUBSTITUTION_DAYS} días de una vez.`);
    }
    const reason = input.reason?.trim() || null;
    const groups = await this.schedule.groups();
    const duties = await this.duties.all();
    const own = groups.filter((g) => g.teacher.equals(absent));
    const planned: { group: ScheduledGroup; date: LocalDate }[] = [];
    for (let date = from; !to.isBefore(date); date = date.plusDays(1)) {
      if (await this.holidays.isHoliday(date)) continue;
      for (const group of own.filter((g) => g.weekdays.includes(date.isoWeekday()))) {
        const busy = busyWith(group, substitute, date, groups, duties);
        if (busy !== null && reason === null) throw new SubstitutionNeedsReason(busy);
        planned.push({ group, date });
      }
    }
    for (const { group, date } of planned) {
      const existing = await this.substitutions.find(group.id, date);
      await this.substitutions.save(
        existing?.id ?? crypto.randomUUID(),
        new Substitution(group.id, date, substitute, reason),
      );
      await reassignSession(this.timesheets, this.settlements, group, date, substitute);
    }
    return planned.length;
  }
}

/** Anula una sustitución; si la sesión de ese día ya estaba apuntada, vuelve al titular. */
export class CancelSubstitution {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly substitutions: SubstitutionRepository,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const substitution = await this.substitutions.byId(id);
    if (substitution === null) throw new SubstitutionNotFound();
    await this.substitutions.delete(id);
    const group = (await this.schedule.groups()).find((g) => g.id.equals(substitution.group));
    if (group) {
      await reassignSession(
        this.timesheets,
        this.settlements,
        group,
        substitution.date,
        group.teacher,
      );
    }
  }
}

/** Otra clase o turno del profesor que se solapa con la del grupo ese día, o null. */
function busyWith(
  group: ScheduledGroup,
  teacher: TeacherRef,
  date: LocalDate,
  groups: readonly ScheduledGroup[],
  duties: readonly ClubDuty[],
): string | null {
  const weekday = date.isoWeekday();
  const from = group.start;
  const to = group.start + group.minutes;
  const overlaps = (a: number, b: number) => a < to && from < b;
  const other = groups.find((g) =>
    !g.id.equals(group.id) && g.teacher.equals(teacher) && g.weekdays.includes(weekday) &&
    overlaps(g.start, g.start + g.minutes)
  );
  if (other) return `la clase «${other.name}»`;
  const duty = duties.find((d) =>
    d.teacher.equals(teacher) && d.weekday === weekday && overlaps(d.start, d.end)
  );
  return duty ? `el turno «${duty.label}»` : null;
}

async function reassignSession(
  timesheets: TimesheetRepository,
  settlements: SettlementRepository,
  group: ScheduledGroup,
  date: LocalDate,
  teacher: TeacherRef,
): Promise<void> {
  const session = (await timesheets.onDate(date)).find((e) =>
    e.source === `group:${group.id.value}`
  );
  if (!session || session.teacher().equals(teacher)) return;
  if ((await settlements.settlement(session.teacher(), session.month())) !== null) return;
  if ((await settlements.settlement(teacher, session.month())) !== null) return;
  session.reassign(teacher);
  await timesheets.save(session);
}

// ---- Turnos fijos (encargado del club) ---------------------------------------------------------

export class DutyNotFound extends Error {
  constructor() {
    super('No existe ese turno.');
    this.name = 'DutyNotFound';
  }
}

export interface DutyInput {
  teacherId: string;
  weekday: number;
  start: string;
  end: string;
  label: string | null;
}

function minutesOf(time: string, field: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new InvalidValue(field, 'Hora no válida (HH:MM).');
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Crea o cambia un turno fijo semanal; las sesiones ya apuntadas no cambian (se corrigen en el registro de horas). */
export class SaveDuty {
  constructor(
    private readonly duties: DutyRepository,
    private readonly teachers: TeacherRates,
  ) {}

  async execute(id: string | null, input: DutyInput): Promise<string> {
    const teacher = TeacherRef.fromString(input.teacherId);
    await ensureTeacherExists(this.teachers, teacher);
    const ref = id === null ? DutyRef.generate() : DutyRef.fromString(id);
    if (id !== null && (await this.duties.duty(ref)) === null) throw new DutyNotFound();
    await this.duties.save(
      new ClubDuty(
        ref,
        teacher,
        input.weekday,
        minutesOf(input.start, 'start'),
        minutesOf(input.end, 'end'),
        input.label?.trim() || 'Encargado del club',
      ),
    );
    return ref.value;
  }
}

export class DeleteDuty {
  constructor(private readonly duties: DutyRepository) {}

  async execute(id: string): Promise<void> {
    const ref = DutyRef.fromString(id);
    if ((await this.duties.duty(ref)) === null) throw new DutyNotFound();
    await this.duties.delete(ref);
  }
}

// ---- Festivos ---------------------------------------------------------------------------------

/** Añade un festivo y quita las sesiones de ese día que no estén en liquidaciones pagadas. Devuelve cuántas quitó. */
export class AddHoliday {
  constructor(
    private readonly holidays: HolidayCalendar,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
  ) {}

  async execute(date: string, name: string): Promise<number> {
    if (name.trim() === '') throw new InvalidValue('name', 'Indica el nombre del festivo.');
    const day = LocalDate.fromString(date);
    await this.holidays.add(day, name.trim());
    let removed = 0;
    for (const entry of await this.timesheets.onDate(day)) {
      if ((await this.settlements.settlement(entry.teacher(), entry.month())) === null) {
        await this.timesheets.delete(entry.id);
        removed++;
      }
    }
    return removed;
  }
}

export class RemoveHoliday {
  constructor(private readonly holidays: HolidayCalendar) {}

  async execute(date: string): Promise<void> {
    await this.holidays.remove(LocalDate.fromString(date));
  }
}
