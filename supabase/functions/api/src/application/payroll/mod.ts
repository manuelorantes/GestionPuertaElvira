import {
  type Clock,
  InvalidValue,
  LocalDate,
  minutesOfDayInMadrid,
  Money,
  Season,
  YearMonth,
} from '../../domain/common/mod.ts';
import {
  Advance,
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
  /** La sustitución de una clase o turno («group:<id>» o «duty:<id>») un día. */
  find(
    source: string,
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
  /** Corrige la fecha de pago de una liquidación ya pagada. */
  changePaidOn(teacher: TeacherRef, month: YearMonth, date: LocalDate): Promise<void>;
}

/** Anticipos a profesores. */
export interface AdvanceRepository {
  forTeacherAdvances(teacher: TeacherRef): Promise<Advance[]>;
  advancesOf(month: YearMonth): Promise<Advance[]>;
  advance(id: string): Promise<Advance | null>;
  saveAdvance(advance: Advance): Promise<void>;
  deleteAdvance(id: string): Promise<void>;
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
  /** La dio en lugar de su profesor (sustitución planificada de esa clase o turno ese día). */
  substitution: boolean;
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
  /** Anticipos de ese mes, que se descuentan de lo que hay que pagarle. */
  advancesCents: number;
  /** Importe menos anticipos (negativo si se le adelantó más de lo que ha hecho). */
  toPayCents: number;
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
    private readonly advances: AdvanceRepository,
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
    const advanced = new Map<string, number>();
    for (const a of await this.advances.advancesOf(period)) {
      advanced.set(a.teacher.value, (advanced.get(a.teacher.value) ?? 0) + a.amount.cents);
    }
    const views: SettlementView[] = [];
    for (const teacher of await this.teachers.all()) {
      const settled = paid.get(teacher.id) ?? null;
      const entries = byTeacher.get(teacher.id) ?? [];
      const advances = advanced.get(teacher.id) ?? 0;
      if (settled === null && entries.length === 0 && advances === 0) continue;
      const settlement = settled?.settlement ??
        new SettlementCalculator().settle(entries, teacher.rate);
      views.push(view(teacher, period, settlement, settled?.paidOn.toString() ?? null, advances));
    }
    return views.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'es'));
  }
}

function view(
  teacher: TeacherRate,
  month: YearMonth,
  s: Settlement,
  paidOn: string | null,
  advances: number,
): SettlementView {
  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    month: month.toString(),
    minutes: s.minutes,
    rateCents: s.rate.cents,
    amountCents: s.amount.cents,
    advancesCents: advances,
    toPayCents: s.amount.cents - advances,
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
 * Rentabilidad del mes por profesor. Coste: en el mes en curso y los futuros, las horas esperadas según el horario (sin
 * festivos ni sustituciones) a su tarifa; en un mes ya pasado, las horas realmente imputadas (su liquidación). Ingresos: las cuotas mensuales de sus alumnos, repartidas entre profesores según las horas
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
    private readonly clock: Clock,
  ) {}

  /** Ordenadas por margen, de mayor a menor. */
  async execute(month: string): Promise<ProfitabilityRow[]> {
    const period = YearMonth.fromString(month);
    const past = period.isBefore(YearMonth.of(LocalDate.fromInstant(this.clock.now())));
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
    const settled = new Map((await this.settlements.execute(month)).map((s) => [s.teacherId, s]));
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
      const settlement = settled.get(teacher.id) ?? null;
      const minutes = past ? (settlement?.minutes ?? 0) : (expected.get(teacher.id) ?? 0);
      const seats = load.teachers.get(teacher.id) ?? null;
      const earned = Math.round(income.get(teacher.id) ?? 0);
      if (minutes === 0 && earned === 0 && seats === null) continue;
      const rate = settlement?.rateCents ?? teacher.rate.cents;
      const cost = past ? (settlement?.amountCents ?? 0) : Math.round((rate * minutes) / 60);
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
  /** La clase sustituida, o null si es un turno. */
  groupId: string | null;
  /** El turno sustituido (encargado del club), en lugar de una clase. */
  dutyId?: string | null;
  date: string;
  teacherId: string;
  reason: string | null;
}

/** Clase o turno semanal que se puede sustituir. */
interface Slot {
  target: GroupRef | DutyRef;
  source: string;
  name: string;
  owner: TeacherRef;
  weekdays: readonly number[];
  start: number;
  end: number;
}

function slotsOf(groups: readonly ScheduledGroup[], duties: readonly ClubDuty[]): Slot[] {
  return [
    ...groups.map((g) => ({
      target: g.id,
      source: `group:${g.id.value}`,
      name: `la clase «${g.name}»`,
      owner: g.teacher,
      weekdays: g.weekdays,
      start: g.start,
      end: g.start + g.minutes,
    })),
    ...duties.map((d) => ({
      target: d.id,
      source: `duty:${d.id.value}`,
      name: `el turno «${d.label}»`,
      owner: d.teacher,
      weekdays: [d.weekday],
      start: d.start,
      end: d.end,
    })),
  ];
}

/**
 * Planifica que otro profesor dé una clase o un turno (encargado del club) un día. Si ya tiene otra clase o turno a esa
 * hora hace falta un motivo (dará las dos a la vez, sin horas dobles). Si la sesión de ese día ya estaba apuntada, pasa
 * a quien sustituye.
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
    const teacher = TeacherRef.fromString(input.teacherId);
    await ensureTeacherExists(this.teachers, teacher);
    const slots = slotsOf(await this.schedule.groups(), await this.duties.all());
    const wanted = input.dutyId
      ? `duty:${DutyRef.fromString(input.dutyId).value}`
      : `group:${GroupRef.fromString(input.groupId ?? '').value}`;
    const slot = slots.find((s) => s.source === wanted);
    if (!slot) {
      throw input.dutyId
        ? new InvalidValue('dutyId', 'Ese turno no existe.')
        : new InvalidValue('groupId', 'Ese grupo no existe.');
    }
    if (!slot.weekdays.includes(date.isoWeekday())) {
      throw new InvalidValue(
        'date',
        input.dutyId ? 'Ese turno no es ese día.' : 'Ese grupo no tiene clase ese día.',
      );
    }
    if (slot.owner.equals(teacher)) {
      throw new InvalidValue('teacherId', 'Elige un profesor distinto del titular.');
    }
    const reason = input.reason?.trim() || null;
    const busy = busyWith(slot, teacher, date, slots);
    if (busy !== null && reason === null) throw new SubstitutionNeedsReason(busy);
    return await save(
      this.substitutions,
      this.timesheets,
      this.settlements,
      slot,
      date,
      teacher,
      reason,
    );
  }
}

/** Máximo de días de una sustitución de profesor de una vez. */
const MAX_SUBSTITUTION_DAYS = 62;

export interface TeacherSubstitutionInput {
  teacherId: string;
  substituteId: string;
  from: string;
  to: string;
  reason: string | null;
}

/**
 * Sustituye a un profesor por otro en todas sus clases y turnos de unos días: crea la sustitución de cada una, salvo
 * festivos. Si quien sustituye ya tiene clase o turno a la hora de alguna, hace falta un motivo y no se guarda nada.
 * Devuelve cuántas sustituye.
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
    const slots = slotsOf(await this.schedule.groups(), await this.duties.all());
    const own = slots.filter((s) => s.owner.equals(absent));
    const planned: { slot: Slot; date: LocalDate }[] = [];
    for (let date = from; !to.isBefore(date); date = date.plusDays(1)) {
      if (await this.holidays.isHoliday(date)) continue;
      for (const slot of own.filter((s) => s.weekdays.includes(date.isoWeekday()))) {
        // Las demás clases y turnos del que falta también pasan al sustituto: no cuentan como «ocupado».
        const busy = busyWith(slot, substitute, date, slots.filter((s) => !s.owner.equals(absent)));
        if (busy !== null && reason === null) throw new SubstitutionNeedsReason(busy);
        planned.push({ slot, date });
      }
    }
    for (const { slot, date } of planned) {
      await save(
        this.substitutions,
        this.timesheets,
        this.settlements,
        slot,
        date,
        substitute,
        reason,
      );
    }
    return planned.length;
  }
}

/** Anula una sustitución; si la sesión de ese día ya estaba apuntada, vuelve al titular. */
export class CancelSubstitution {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly duties: DutyRepository,
    private readonly substitutions: SubstitutionRepository,
    private readonly timesheets: TimesheetRepository,
    private readonly settlements: SettlementRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const substitution = await this.substitutions.byId(id);
    if (substitution === null) throw new SubstitutionNotFound();
    await this.substitutions.delete(id);
    const slot = slotsOf(await this.schedule.groups(), await this.duties.all()).find((s) =>
      s.source === substitution.source
    );
    if (slot) {
      await reassignSession(this.timesheets, this.settlements, slot, substitution.date, slot.owner);
    }
  }
}

async function save(
  substitutions: SubstitutionRepository,
  timesheets: TimesheetRepository,
  settlements: SettlementRepository,
  slot: Slot,
  date: LocalDate,
  teacher: TeacherRef,
  reason: string | null,
): Promise<string> {
  const existing = await substitutions.find(slot.source, date);
  const id = existing?.id ?? crypto.randomUUID();
  await substitutions.save(id, new Substitution(slot.target, date, teacher, reason));
  await reassignSession(timesheets, settlements, slot, date, teacher);
  return id;
}

/** Otra clase o turno del profesor que se solapa con el sustituido ese día, o null. */
function busyWith(
  slot: Slot,
  teacher: TeacherRef,
  date: LocalDate,
  slots: readonly Slot[],
): string | null {
  const weekday = date.isoWeekday();
  const other = slots.find((s) =>
    s.source !== slot.source && s.owner.equals(teacher) && s.weekdays.includes(weekday) &&
    s.start < slot.end && slot.start < s.end
  );
  return other?.name ?? null;
}

async function reassignSession(
  timesheets: TimesheetRepository,
  settlements: SettlementRepository,
  slot: Slot,
  date: LocalDate,
  teacher: TeacherRef,
): Promise<void> {
  const session = (await timesheets.onDate(date)).find((e) => e.source === slot.source);
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

// ---- Anticipos y fecha de pago ---------------------------------------------------------------

export interface AdvanceInput {
  teacherId: string;
  /** Mes de cuya liquidación se descuenta. */
  month: string;
  amount: string;
  /** Día en que se pagó. */
  date: string;
  note: string | null;
}

/** Apunta un anticipo a cuenta de la liquidación de un mes aún sin pagar. */
export class RecordAdvance {
  constructor(
    private readonly advances: AdvanceRepository,
    private readonly settlements: SettlementRepository,
    private readonly teachers: TeacherRates,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(input: AdvanceInput): Promise<string> {
    const teacher = TeacherRef.fromString(input.teacherId);
    await ensureTeacherExists(this.teachers, teacher);
    const month = YearMonth.fromString(input.month);
    await ensureOpen(this.settlements, teacher, month);
    const paidOn = LocalDate.fromString(input.date);
    await PeriodClosed.guard(this.closed, paidOn);
    const id = crypto.randomUUID();
    await this.advances.saveAdvance(
      new Advance(
        id,
        teacher,
        month,
        Money.fromDecimal(input.amount),
        paidOn,
        input.note?.trim() || null,
      ),
    );
    return id;
  }
}

export class AdvanceNotFound extends Error {
  constructor() {
    super('No existe ese anticipo.');
    this.name = 'AdvanceNotFound';
  }
}

/** Quita un anticipo mientras la liquidación de su mes no esté pagada. */
export class DeleteAdvance {
  constructor(
    private readonly advances: AdvanceRepository,
    private readonly settlements: SettlementRepository,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(id: string): Promise<void> {
    const advance = await this.advances.advance(id);
    if (advance === null) throw new AdvanceNotFound();
    await ensureOpen(this.settlements, advance.teacher, advance.month);
    await PeriodClosed.guard(this.closed, advance.paidOn);
    await this.advances.deleteAdvance(id);
  }
}

/** Corrige el día en que se pagó una liquidación (p. ej. se marcó pagada otro día). */
export class ChangeSettlementPaymentDate {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly closed: ClosedPeriods,
  ) {}

  async execute(teacherId: string, month: string, date: string): Promise<void> {
    const teacher = TeacherRef.fromString(teacherId);
    const period = YearMonth.fromString(month);
    const settlement = await this.settlements.settlement(teacher, period);
    if (settlement === null) {
      throw new InvalidValue('month', 'La liquidación de ese mes aún no está pagada.');
    }
    const paidOn = LocalDate.fromString(date);
    await PeriodClosed.guard(this.closed, settlement.paidOn);
    await PeriodClosed.guard(this.closed, paidOn);
    await this.settlements.changePaidOn(teacher, period, paidOn);
  }
}

// ---- Ficha del profesor ----------------------------------------------------------------------

export interface TeacherGroupView {
  id: string;
  name: string;
  days: string[];
  start: string;
  end: string;
  classroom: string;
  capacity: number;
  /** Alumnos que van cada día de clase. */
  occupancyByDay: Record<string, number>;
  students: number;
}

export interface TeacherStudentView {
  id: string;
  name: string;
  groups: string[];
  /** Minutos semanales con este profesor. */
  weeklyMinutes: number;
}

export interface TeacherSubstitutionView {
  date: string;
  /** Clase o turno. */
  label: string;
  /** `gave`: dio la clase de otro; `received`: otro dio la suya. */
  role: 'gave' | 'received';
  otherName: string;
  reason: string | null;
}

export interface TeacherDutyView {
  weekday: number;
  start: string;
  end: string;
  label: string;
}

/** Lecturas de Clases, Alumnos y Profesorado restringidas a un profesor. */
export interface TeacherReportQuery {
  groups(teacherId: string, on: LocalDate): Promise<TeacherGroupView[]>;
  students(teacherId: string, on: LocalDate): Promise<TeacherStudentView[]>;
  substitutions(
    teacherId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<TeacherSubstitutionView[]>;
  duties(teacherId: string): Promise<TeacherDutyView[]>;
}

export interface TeacherMonthView {
  month: string;
  minutes: number;
  amountCents: number;
  advancesCents: number;
  toPayCents: number;
  /** `none`: sin horas ni anticipos. */
  status: 'paid' | 'pending' | 'none';
  paidOn: string | null;
  incomeCents: number;
  marginCents: number;
}

export interface TeacherPaymentView {
  /** Id del anticipo (null en las liquidaciones). */
  id: string | null;
  date: string;
  kind: 'settlement' | 'advance';
  month: string;
  amountCents: number;
  note: string | null;
}

export interface TeacherReportView {
  teacher: { id: string; name: string; rateCents: number; active: boolean };
  season: number;
  months: TeacherMonthView[];
  /** Lo que le debemos hoy (positivo) o lo que se le ha pagado de más (negativo). */
  balanceCents: number;
  payments: TeacherPaymentView[];
  groups: TeacherGroupView[];
  occupancy: { occupied: number; capacity: number };
  students: TeacherStudentView[];
  substitutions: TeacherSubstitutionView[];
  duties: TeacherDutyView[];
}

export class TeacherNotFound extends Error {
  constructor() {
    super('No existe ese profesor.');
    this.name = 'TeacherNotFound';
  }
}

/**
 * Ficha de un profesor en una temporada: horas, liquidación, anticipos y rentabilidad de cada mes hasta hoy, pagos
 * recibidos, saldo (lo que le debemos o lo pagado de más), sus clases con su ocupación, sus alumnos, sustituciones y
 * turnos.
 */
export class TeacherReport {
  constructor(
    private readonly teachers: TeacherRates,
    private readonly settlements: ListSettlements,
    private readonly profitability: Profitability,
    private readonly advances: AdvanceRepository,
    private readonly query: TeacherReportQuery,
    private readonly clock: Clock,
  ) {}

  async execute(teacherId: string, seasonYear: number | null): Promise<TeacherReportView> {
    const ref = TeacherRef.fromString(teacherId);
    const teacher = (await this.teachers.all()).find((t) => t.id === ref.value);
    if (!teacher) throw new TeacherNotFound();
    const today = LocalDate.fromInstant(this.clock.now());
    const current = YearMonth.of(today);
    const season = seasonYear === null ? Season.containing(current) : Season.startingIn(seasonYear);
    const months: TeacherMonthView[] = [];
    // De septiembre a junio, hasta el mes en curso.
    for (
      let m = season.firstMonth();
      !current.isBefore(m) && !season.lastMonth().isBefore(m);
      m = m.next()
    ) {
      const settlement = (await this.settlements.execute(m.toString())).find((s) =>
        s.teacherId === ref.value
      );
      const row = (await this.profitability.execute(m.toString())).find((r) =>
        r.teacherId === ref.value
      );
      months.push({
        month: m.toString(),
        minutes: settlement?.minutes ?? 0,
        amountCents: settlement?.amountCents ?? 0,
        advancesCents: settlement?.advancesCents ?? 0,
        toPayCents: settlement?.toPayCents ?? 0,
        status: settlement === undefined ? 'none' : settlement.status,
        paidOn: settlement?.paidOn ?? null,
        incomeCents: row?.incomeCents ?? 0,
        marginCents: row?.marginCents ?? 0,
      });
    }
    const advances = await this.advances.forTeacherAdvances(ref);
    const owed = months.filter((m) => m.status === 'pending').reduce(
      (sum, m) => sum + m.toPayCents,
      0,
    );
    const ahead = advances.filter((a) => current.isBefore(a.month)).reduce(
      (sum, a) => sum + a.amount.cents,
      0,
    );
    const payments: TeacherPaymentView[] = [
      ...months.filter((m) => m.status === 'paid' && m.paidOn !== null).map((m) => ({
        id: null,
        date: m.paidOn as string,
        kind: 'settlement' as const,
        month: m.month,
        amountCents: m.toPayCents,
        note: null,
      })),
      ...advances.map((a) => ({
        id: a.id,
        date: a.paidOn.toString(),
        kind: 'advance' as const,
        month: a.month.toString(),
        amountCents: a.amount.cents,
        note: a.note,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.kind.localeCompare(a.kind));
    const groups = await this.query.groups(ref.value, today);
    const occupancy = groups.reduce(
      (acc, g) => ({
        occupied: acc.occupied + Object.values(g.occupancyByDay).reduce((s, n) => s + n, 0),
        capacity: acc.capacity + g.capacity * g.days.length,
      }),
      { occupied: 0, capacity: 0 },
    );
    return {
      teacher: {
        id: teacher.id,
        name: teacher.name,
        rateCents: teacher.rate.cents,
        active: teacher.active,
      },
      season: season.startYear,
      months,
      balanceCents: owed - ahead,
      payments,
      groups,
      occupancy,
      students: await this.query.students(ref.value, today),
      substitutions: await this.query.substitutions(
        ref.value,
        season.firstMonth().firstDay(),
        season.lastMonth().lastDay(),
      ),
      duties: await this.query.duties(ref.value),
    };
  }
}

/** Clase o turno de un profesor un día de su agenda. */
export interface AgendaItem {
  date: string;
  groupId: string | null;
  dutyId: string | null;
  label: string;
  /** «HH:MM». */
  start: string;
  end: string;
  minutes: number;
  /** La da sustituyendo a su titular. */
  substitution: boolean;
}

/** Como mucho dos meses de agenda de una vez. */
const MAX_AGENDA_DAYS = 62;

const clockTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Las clases y turnos que da un profesor cada día de un periodo según el horario: las suyas salvo las que le
 * sustituyen, más las que da sustituyendo a otro; los festivos no tienen clase. No depende de las horas apuntadas,
 * así que la agenda de hoy está completa aunque las horas se apunten por la noche.
 */
export class TeacherAgenda {
  constructor(
    private readonly schedule: ScheduleDirectory,
    private readonly duties: DutyRepository,
    private readonly substitutions: SubstitutionRepository,
    private readonly holidays: HolidayCalendar,
  ) {}

  async execute(teacherId: string, from: string, to: string): Promise<AgendaItem[]> {
    const teacher = TeacherRef.fromString(teacherId);
    const first = LocalDate.fromString(from);
    const last = LocalDate.fromString(to);
    if (last.isBefore(first) || first.plusDays(MAX_AGENDA_DAYS).isBefore(last)) {
      throw new InvalidValue('to', `Como mucho ${MAX_AGENDA_DAYS} días de agenda de una vez.`);
    }
    const groups = await this.schedule.groups();
    const duties = await this.duties.all();
    const items: AgendaItem[] = [];
    for (let date = first; !last.isBefore(date); date = date.plusDays(1)) {
      if (await this.holidays.isHoliday(date)) continue;
      const substitutions = await this.substitutions.onDate(date);
      for (const planned of new DailyPlanner().plan(date, groups, duties, substitutions, null)) {
        if (!planned.teacher.equals(teacher)) continue;
        const group = groups.find((g) => planned.group?.equals(g.id));
        const duty = duties.find((d) => planned.source === `duty:${d.id.value}`);
        items.push({
          date: date.toString(),
          groupId: group?.id.value ?? null,
          dutyId: duty?.id.value ?? null,
          label: group?.name ?? duty?.label ?? planned.label,
          start: clockTime(planned.start),
          end: clockTime(planned.start + planned.minutes.minutes),
          minutes: planned.minutes.minutes,
          substitution: substitutions.some((s) => s.source === planned.source),
        });
      }
    }
    return items;
  }
}
