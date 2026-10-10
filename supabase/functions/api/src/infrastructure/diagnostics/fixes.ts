// Aplica el arreglo de un hallazgo componiendo los casos de uso de cada contexto, igual que lo harían sus rutas: mismas
// validaciones, mismo recálculo de cuotas y mismo historial.
import { LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import { StudentRef, TeacherRef } from '../../domain/billing/mod.ts';
import { ManualEntryId, SupplierInvoiceId } from '../../domain/accounting/mod.ts';
import type { Fix } from '../../domain/diagnostics/mod.ts';
import {
  DeleteEntry,
  EntryNotFound,
  SupplierInvoiceNotFound,
} from '../../application/accounting/mod.ts';
import { decimal, NoteChargeDiscount, SetChargeDiscount } from '../../application/billing/mod.ts';
import { ChangeEnrolmentStart } from '../../application/classes/mod.ts';
import type { FixExecutor } from '../../application/diagnostics/mod.ts';
import { RecordAdvance } from '../../application/payroll/mod.ts';
import {
  LinkSiblings,
  type StudentInput,
  StudentNotFound,
  UpdateStudent,
} from '../../application/students/mod.ts';
import { recalculatingFees } from '../billing/recalculate.ts';
import { StudentsJoinDates } from '../classes/routes.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
import { SqlAccountingRepository } from '../persistence/accounting.ts';
import {
  SqlBillingSettingsRepository,
  SqlChargeRepository,
  SqlClosedPeriods,
  SqlStudentAccountRepository,
  SqlStudentDirectory,
} from '../persistence/billing.ts';
import { SqlClassQuery, SqlEnrolmentRepository } from '../persistence/classes.ts';
import {
  SqlAdvanceRepository,
  SqlSettlementRepository,
  SqlTeacherRates,
} from '../persistence/payroll.ts';
import { SavepointTransactionRunner } from '../persistence/sql.ts';
import { SqlStudentQuery, SqlStudentRepository } from '../persistence/students.ts';

export class UseCaseFixExecutor implements FixExecutor {
  constructor(
    private readonly api: ApiApp,
    private readonly scope: RequestScope,
  ) {}

  async apply(fix: Fix): Promise<void> {
    switch (fix.kind) {
      case 'reprice_charge':
        return await this.repriceCharge(fix.studentId, fix.month);
      case 'note_discount':
        return await new NoteChargeDiscount(new SqlChargeRepository(this.tx)).execute(
          fix.studentId,
          fix.month,
          fix.percent,
        );
      case 'link_family':
        return await this.linkFamily(fix.a, fix.b);
      case 'set_enrolment_start':
        return await this.setEnrolmentStart(fix.studentId, fix.groupIds, fix.date);
      case 'own_phone_from_guardian':
        return await this.updateStudent(fix.studentId, (input) => ({
          ...input,
          ownPhone: input.guardians[0]?.phone ?? null,
          guardians: [],
        }));
      case 'rename_student':
        return await this.updateStudent(fix.studentId, (input) => ({
          ...input,
          fullName: fix.fullName,
        }));
      case 'set_category':
        return await this.setCategory(fix.source, fix.id, fix.category);
      case 'entry_to_advance':
        return await this.entryToAdvance(fix.entryId, fix.teacherId);
    }
  }

  private get tx() {
    return this.scope.tx;
  }

  private get clock() {
    return this.api.deps.clock;
  }

  /** Recalcula la cuota con la tarifa de hoy conservando su descuento por pago adelantado. */
  private async repriceCharge(studentId: string, month: string): Promise<void> {
    const charges = new SqlChargeRepository(this.tx);
    const charge = await charges.chargeFor(
      StudentRef.fromString(studentId),
      'monthly',
      YearMonth.fromString(month),
    );
    await new SetChargeDiscount(
      new SqlStudentDirectory(this.tx),
      new SqlStudentAccountRepository(this.tx),
      new SqlBillingSettingsRepository(this.tx),
      charges,
      this.clock,
    ).execute(studentId, month, charge?.discountPercent() ?? 0);
  }

  private async linkFamily(a: string, b: string): Promise<void> {
    await recalculatingFees(
      this.api,
      this.scope,
      [a, b],
      () =>
        new LinkSiblings(
          new SqlStudentRepository(this.tx),
          new SavepointTransactionRunner(this.tx),
        ).execute(a, b),
    );
  }

  private async setEnrolmentStart(studentId: string, groupIds: string[], date: string) {
    const change = new ChangeEnrolmentStart(
      new SqlEnrolmentRepository(this.tx),
      new StudentsJoinDates(this.tx),
      this.clock,
    );
    await recalculatingFees(this.api, this.scope, [studentId], async () => {
      for (const groupId of groupIds) await change.execute(studentId, groupId, date);
    });
  }

  /** Cambia los datos personales partiendo de los actuales. */
  private async updateStudent(
    studentId: string,
    change: (input: StudentInput) => StudentInput,
  ): Promise<void> {
    const detail = await new SqlStudentQuery(this.tx, new SqlClassQuery(this.tx)).detail(
      studentId,
      LocalDate.fromInstant(this.clock.now()),
    );
    if (detail === null) throw new StudentNotFound();
    await new UpdateStudent(new SqlStudentRepository(this.tx), this.clock).execute(
      studentId,
      change({
        fullName: detail.fullName,
        birthDate: detail.birthDate,
        nationalId: detail.nationalId,
        contactEmail: detail.contactEmail,
        guardians: detail.guardians,
        ownPhone: detail.ownPhone,
        federationLicence: detail.federationLicence,
        imageConsent: detail.imageConsent,
      }),
    );
  }

  private async setCategory(
    source: 'manual' | 'invoice',
    id: string,
    category: string,
  ): Promise<void> {
    const accounting = new SqlAccountingRepository(this.tx);
    const target = (await accounting.catalog()).require(category);
    if (source === 'manual') {
      const entry = await accounting.entry(ManualEntryId.fromString(id));
      if (entry === null) throw new EntryNotFound();
      await accounting.saveEntry(
        entry.revise(entry.concept, target, entry.method, entry.amount, entry.period),
      );
      return;
    }
    const invoice = await accounting.invoice(SupplierInvoiceId.fromString(id));
    if (invoice === null) throw new SupplierInvoiceNotFound();
    invoice.revise(invoice.concept, target, invoice.amount, invoice.period, invoice.method());
    await accounting.saveInvoice(invoice);
  }

  /** El apunte pasa a ser un anticipo del profesor, a cuenta de su primer mes de la temporada sin liquidar. */
  private async entryToAdvance(entryId: string, teacherId: string): Promise<void> {
    const accounting = new SqlAccountingRepository(this.tx);
    const entry = await accounting.entry(ManualEntryId.fromString(entryId));
    if (entry === null) throw new EntryNotFound();
    const settlements = new SqlSettlementRepository(this.tx);
    const closed = new SqlClosedPeriods(this.tx);
    const month = await this.firstUnsettledMonth(settlements, teacherId, entry.date);
    await new RecordAdvance(
      new SqlAdvanceRepository(this.tx),
      settlements,
      new SqlTeacherRates(this.tx),
      closed,
    ).execute({
      teacherId,
      month: month.toString(),
      amount: decimal(entry.amount),
      date: entry.date.toString(),
      note: entry.concept,
    });
    await new DeleteEntry(accounting, closed).execute(entryId);
  }

  private async firstUnsettledMonth(
    settlements: SqlSettlementRepository,
    teacherId: string,
    from: LocalDate,
  ): Promise<YearMonth> {
    const season = Season.containing(YearMonth.of(from));
    const teacher = TeacherRef.fromString(teacherId);
    for (
      let month = season.firstMonth();
      !season.lastMonth().isBefore(month);
      month = month.next()
    ) {
      if ((await settlements.settlement(teacher, month)) === null) return month;
    }
    return season.lastMonth();
  }
}
