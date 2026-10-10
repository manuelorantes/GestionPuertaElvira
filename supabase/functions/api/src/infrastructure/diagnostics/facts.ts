// Carga los hechos del diagnóstico leyendo todos los contextos con sus propias consultas y repositorios, para que las
// reglas vean exactamente lo mismo que el resto de la aplicación (misma tarifa, mismo reparto de cobros…).
import { type Clock, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import { FeeCalculator, StudentRef } from '../../domain/billing/mod.ts';
import { feeProfileOf, GenerateMonthlyCharges } from '../../application/billing/mod.ts';
import type {
  FactCharge,
  FactChargeStatus,
  FactPayment,
  Facts,
  FactsSource,
  FactStudent,
  FactTeacherMonth,
} from '../../application/diagnostics/mod.ts';
import { ListSessions, ListSettlements, Profitability } from '../../application/payroll/mod.ts';
import {
  SqlAccountingRepository,
  SqlInvoiceQuery,
  SqlLedgerQuery,
} from '../persistence/accounting.ts';
import {
  SqlBillingQuery,
  SqlBillingSettingsRepository,
  SqlChargeRepository,
  SqlStudentAccountRepository,
  SqlStudentDirectory,
} from '../persistence/billing.ts';
import { SqlClassQuery } from '../persistence/classes.ts';
import {
  SqlAdvanceRepository,
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlMonthlyFees,
  SqlPayrollQuery,
  SqlScheduleDirectory,
  SqlSettlementRepository,
  SqlTeacherRates,
  SqlTimesheetRepository,
} from '../persistence/payroll.ts';
import { SqlPointsQuery } from '../persistence/points.ts';
import { Row, type Sql } from '../persistence/sql.ts';

/** El cálculo de las cuotas previstas no escribe nada: no necesita transacción ni cerrojo. */
const READ_ONLY = {
  run: <T>(body: () => Promise<T>) => body(),
  acquire: () => Promise.resolve(),
};

/** Recibo «R-2026-0012» → temporada 2026, número 12. */
function parseReceipt(receiptNumber: string): { seasonYear: number; sequence: number } {
  const match = /^R-(\d{4})-(\d+)$/.exec(receiptNumber);
  return { seasonYear: Number(match?.[1] ?? 0), sequence: Number(match?.[2] ?? 0) };
}

export class SqlDiagnosticsFacts implements FactsSource {
  constructor(
    private readonly sql: Sql,
    private readonly clock: Clock,
  ) {}

  async load(): Promise<Facts> {
    const today = LocalDate.fromInstant(this.clock.now());
    const currentMonth = YearMonth.of(today);
    const season = Season.containing(currentMonth);
    const seasonMonths = this.monthsOf(season);
    const pastAndCurrent = seasonMonths.filter((m) => !currentMonth.isBefore(m));
    // En orden: dentro de una transacción las consultas van por la misma conexión.
    const students = await this.students(today);
    const charges = await this.charges(seasonMonths, today);
    const payments = await this.payments();
    const ledger = await this.ledger(season.firstMonth(), currentMonth);
    const entries = await this.entries();
    const invoices = await new SqlInvoiceQuery(this.sql).all();
    const categories = await this.categories();
    const teachers = await this.teachers();
    const teacherMonths = await this.teacherMonths(pastAndCurrent, today);
    const points = await this.points(pastAndCurrent, season);
    const { tariff } = await new SqlBillingSettingsRepository(this.sql).get();
    return {
      today: today.toString(),
      currentMonth: currentMonth.toString(),
      seasonYear: season.startYear,
      seasonMonths: seasonMonths.map((m) => m.toString()),
      prepayments: [3, 6, 9].map((months) => ({
        months,
        percent: tariff.prepaymentPercent(months),
      })),
      students,
      charges,
      payments,
      ledger,
      entries,
      invoices: invoices.map((i) => ({
        id: i.id,
        date: i.date,
        supplier: i.supplier,
        concept: i.concept,
        category: i.category,
        amountCents: i.amountCents,
        period: i.period,
        paidOn: i.paidOn,
      })),
      categories,
      teachers,
      teacherMonths,
      points,
    };
  }

  private monthsOf(season: Season): YearMonth[] {
    const months: YearMonth[] = [];
    for (let m = season.firstMonth(); !season.lastMonth().isBefore(m); m = m.next()) months.push(m);
    return months;
  }

  /** Todos los alumnos en pocas consultas: ficha, grupos de hoy y la tarifa de hoy de los activos. */
  private async students(today: LocalDate): Promise<FactStudent[]> {
    const day = today.toString();
    const rows = Row.all(
      await this
        .sql`SELECT id, member_number, full_name, birth_date::text AS birth_date, contact_email,
          guardians, own_phone, joined_on::text AS joined_on, withdrawn_on::text AS withdrawn_on, sibling_ids
        FROM students_student ORDER BY search_name`,
    );
    const groupNames = new Map(
      (await new SqlClassQuery(this.sql).groups(today)).map((g) => [g.id, g.name]),
    );
    const groupsByStudent = new Map<string, FactStudent['groups']>();
    for (
      const row of Row.all(
        await this.sql`SELECT student_id, class_group_id, enrolled_on::text AS since
          FROM classes_enrolment
         WHERE enrolled_on <= ${day} AND (ends_on IS NULL OR ends_on > ${day})
         ORDER BY enrolled_on, id`,
      )
    ) {
      const list = groupsByStudent.get(row.string('student_id')) ?? [];
      const id = row.string('class_group_id');
      list.push({ id, name: groupNames.get(id) ?? id, since: row.string('since') });
      groupsByStudent.set(row.string('student_id'), list);
    }
    const settings = await new SqlBillingSettingsRepository(this.sql).get();
    const profiles = new Map(
      (await new SqlStudentDirectory(this.sql).activeOn(today)).map((p) => [p.id, p]),
    );
    const accounts = await new SqlStudentAccountRepository(this.sql).accountsOf(
      [...profiles.keys()].map((id) => StudentRef.fromString(id)),
    );
    const calculator = new FeeCalculator();
    return rows.map((row) => {
      const id = row.string('id');
      const withdrawnOn = row.nullableString('withdrawn_on');
      const birthDate = row.nullableString('birth_date');
      const profile = profiles.get(id) ?? null;
      let tierCents = 0;
      let privateLessonsCents = 0;
      let feeCents = 0;
      if (profile !== null) {
        const feeProfile = feeProfileOf(profile, accounts.get(id) ?? null, settings);
        tierCents = settings.tariff.forWeeklyHours(profile.regularWeeklyHours).cents;
        privateLessonsCents = feeProfile.privateLessons.reduce(
          (sum, lesson) => sum + lesson.monthlyPrice().cents,
          0,
        );
        feeCents = calculator.quote(feeProfile, settings, 1).total.cents;
      }
      const guardians = row.json('guardians') as { name?: unknown; phone?: unknown }[];
      return {
        id,
        memberNumber: row.int('member_number'),
        fullName: row.string('full_name'),
        status: withdrawnOn !== null && withdrawnOn <= day ? 'withdrawn' : 'active',
        age: birthDate === null ? null : LocalDate.fromString(birthDate).ageOn(today),
        contactEmail: row.nullableString('contact_email'),
        guardians: guardians.map((g) => ({
          name: typeof g.name === 'string' ? g.name : '',
          phone: typeof g.phone === 'string' ? g.phone : null,
        })),
        ownPhone: row.nullableString('own_phone'),
        joinedOn: row.string('joined_on'),
        withdrawnOn,
        groups: groupsByStudent.get(id) ?? [],
        siblingIds: row.stringList('sibling_ids'),
        weeklyHours: profile?.regularWeeklyHours ?? 0,
        tierCents,
        privateLessonsCents,
        feeCents,
        familyDiscount: profile?.hasSiblings ?? false,
        familyPercent: settings.tariff.familyPercent,
      };
    });
  }

  /** Las cuotas guardadas de la temporada (sin las previstas, que no existen aún) con lo que tienen cubierto. */
  private async charges(months: YearMonth[], today: LocalDate): Promise<FactCharge[]> {
    const query = new SqlBillingQuery(this.sql);
    const discounts = new Map(
      Row.all(await this.sql`SELECT id, discount_percent FROM billing_charge`).map((r) => [
        r.string('id'),
        r.int('discount_percent'),
      ]),
    );
    const seen = new Map<string, FactCharge>();
    for (const month of months) {
      for (const view of await query.charges(month, today)) {
        if (view.status === 'expected' || seen.has(view.id)) continue;
        seen.set(view.id, {
          id: view.id,
          studentId: view.studentId,
          kind: view.kind as FactCharge['kind'],
          period: view.period,
          amountCents: view.amountCents,
          coveredCents: view.coveredCents,
          status: view.status as FactChargeStatus,
          manual: view.manual,
          discountPercent: discounts.get(view.id) ?? 0,
        });
      }
    }
    return [...seen.values()];
  }

  private async payments(): Promise<FactPayment[]> {
    return (await new SqlBillingQuery(this.sql).payments(null)).map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      ...parseReceipt(p.receiptNumber),
      paidOn: p.paidOn,
      studentId: p.studentId,
      kind: p.kind,
      totalCents: p.totalCents,
    }));
  }

  private async ledger(from: YearMonth, to: YearMonth): Promise<Facts['ledger']> {
    return (await new SqlLedgerQuery(this.sql).linesBetween(from, to)).map((l) => ({
      source: l.source,
      sourceId: l.sourceId,
      date: l.date,
      kind: l.kind === 'income' ? 'income' : 'expense',
      amountCents: l.amountCents,
    }));
  }

  private async entries(): Promise<Facts['entries']> {
    const rows = await this
      .sql`SELECT id, entry_date::text AS entry_date, kind, concept, category, amount_cents,
        COALESCE(period, to_char(entry_date, 'YYYY-MM')) AS period
      FROM accounting_entry ORDER BY entry_date`;
    return Row.all(rows).map((r) => ({
      id: r.string('id'),
      date: r.string('entry_date'),
      kind: r.string('kind') === 'income' ? 'income' : 'expense',
      concept: r.string('concept'),
      category: r.string('category'),
      amountCents: r.int('amount_cents'),
      period: r.string('period'),
    }));
  }

  private async categories(): Promise<Facts['categories']> {
    return (await new SqlAccountingRepository(this.sql).catalog()).all().map((c) => ({
      code: c.code,
      label: c.label,
      kind: c.kind,
    }));
  }

  private async teachers(): Promise<Facts['teachers']> {
    return (await new SqlTeacherRates(this.sql).all()).map((t) => ({
      id: t.id,
      fullName: t.name,
      active: t.active,
    }));
  }

  private async teacherMonths(months: YearMonth[], today: LocalDate): Promise<FactTeacherMonth[]> {
    const sql = this.sql;
    const timesheets = new SqlTimesheetRepository(sql);
    const settlementsRepo = new SqlSettlementRepository(sql);
    const rates = new SqlTeacherRates(sql);
    const settlements = new ListSettlements(
      timesheets,
      settlementsRepo,
      rates,
      new SqlAdvanceRepository(sql),
    );
    const payrollQuery = new SqlPayrollQuery(sql, () => today);
    const sessions = new ListSessions(payrollQuery);
    const directory = new SqlStudentDirectory(sql);
    const settings = new SqlBillingSettingsRepository(sql);
    const generate = new GenerateMonthlyCharges(
      directory,
      settings,
      new SqlStudentAccountRepository(sql),
      new SqlChargeRepository(sql),
      this.clock,
      READ_ONLY,
      READ_ONLY,
    );
    const profitability = new Profitability(
      new SqlScheduleDirectory(sql),
      new SqlDutyRepository(sql),
      new SqlHolidayCalendar(sql),
      rates,
      settlements,
      payrollQuery,
      new SqlMonthlyFees(sql, (month) => generate.expected(month)),
      this.clock,
    );
    const teachers = new Map((await rates.all()).map((t) => [t.id, t.name]));
    const result: FactTeacherMonth[] = [];
    for (const month of months) {
      const byTeacher = new Map<string, FactTeacherMonth>();
      const at = (teacherId: string): FactTeacherMonth => {
        const existing = byTeacher.get(teacherId);
        if (existing) return existing;
        const created: FactTeacherMonth = {
          teacherId,
          teacherName: teachers.get(teacherId) ?? teacherId,
          month: month.toString(),
          sessionMinutes: 0,
          sessionCostCents: 0,
          settlement: null,
          incomeCents: 0,
        };
        byTeacher.set(teacherId, created);
        return created;
      };
      for (const session of await sessions.execute(month, null)) {
        const row = at(session.teacherId);
        row.sessionMinutes += session.countedMinutes;
        row.sessionCostCents += session.costCents;
      }
      for (const settlement of await settlements.execute(month.toString())) {
        at(settlement.teacherId).settlement = {
          minutes: settlement.minutes,
          amountCents: settlement.amountCents,
          paid: settlement.status === 'paid',
        };
      }
      for (const row of await profitability.execute(month.toString())) {
        at(row.teacherId).incomeCents = row.incomeCents;
      }
      result.push(...byTeacher.values());
    }
    return result;
  }

  private async points(months: YearMonth[], season: Season): Promise<Facts['points']> {
    const query = new SqlPointsQuery(this.sql, () => LocalDate.fromInstant(this.clock.now()));
    const result: Facts['points'] = [];
    for (const month of months) {
      const movements = await query.movements(month.firstDay(), month.lastDay(), {
        kind: null,
        student: null,
      });
      const sums = new Map<string, number>();
      for (const m of movements) sums.set(m.studentId, (sums.get(m.studentId) ?? 0) + m.delta);
      const students = await query.students(
        month,
        season.firstMonth().firstDay(),
        season.lastMonth().lastDay(),
      );
      for (const s of students) {
        const movementsSum = sums.get(s.id) ?? 0;
        if (s.points === 0 && movementsSum === 0) continue;
        result.push({
          studentId: s.id,
          studentName: s.name,
          month: month.toString(),
          points: s.points,
          movementsSum,
        });
      }
    }
    return result;
  }
}
