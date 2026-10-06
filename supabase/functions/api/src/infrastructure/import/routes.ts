import { GroupDetails } from '../../domain/classes/mod.ts';
import { InvalidValue } from '../../domain/common/mod.ts';
import { RecordEntry } from '../../application/accounting/mod.ts';
import { ImportPayment } from '../../application/billing/mod.ts';
import {
  ApplyImport,
  type GroupCandidate,
  type GroupDirectory,
  type ImportDecision,
  PreviewImport,
  SpreadsheetParser,
} from '../../application/import/mod.ts';
import { RegisterStudent } from '../../application/students/mod.ts';
import { SqlAuditContext } from '../audit/mod.ts';
import { type ApiApp, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import { SqlAccountingRepository } from '../persistence/accounting.ts';
import {
  SqlChargeRepository,
  SqlClosedPeriods,
  SqlDocumentSequence,
  SqlPaymentRepository,
  SqlStudentAccountRepository,
} from '../persistence/billing.ts';
import { SqlClassGroupRepository } from '../persistence/classes.ts';
import { SqlStudentMatcher } from '../persistence/import.ts';
import { SavepointTransactionRunner, type Sql } from '../persistence/sql.ts';
import { SqlStudentRepository } from '../persistence/students.ts';
import { BillingMembership, ClassesEnrolments } from '../students/routes.ts';

/** Los grupos del contexto Clases tal como se pueden nombrar en la hoja. */
class ImportGroupDirectory implements GroupDirectory {
  constructor(private readonly sql: Sql) {}

  async all(): Promise<GroupCandidate[]> {
    return (await new SqlClassGroupRepository(this.sql).all()).map((group) => {
      const d = group.details();
      return {
        id: group.id.value,
        name: d.name.value,
        defaultName: GroupDetails.defaultName(d.level, d.slot, d.classroom),
      };
    });
  }
}

/** Rutas de importación de la hoja de cálculo: /api/admin/import */
export function registerImportRoutes(api: ApiApp): void {
  registerDomainErrors({ PossibleDuplicate: [409, 'possible_duplicate'] });
  const { clock } = api.deps;
  const matcher = (scope: RequestScope) => new SqlStudentMatcher(scope.tx);

  api.defineRoute(
    { method: 'POST', path: '/api/admin/import/preview', access: 'admin' },
    async (c, scope) => {
      const text = (await JsonBody.from(c.req.raw)).requiredString('text');
      const rows = await new PreviewImport(
        new SpreadsheetParser(),
        matcher(scope),
        new ImportGroupDirectory(scope.tx),
        clock,
      ).execute(text);
      return c.json({
        rows: rows.map((r) => ({
          ...r.row,
          match: r.match,
          suggestions: r.suggestions,
          groups: r.groups,
        })),
      });
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/import/rows', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const d = body.optionalObject('row');
      if (d === null) throw new InvalidValue('row', 'Falta la fila.');
      const decision: ImportDecision = {
        line: d.requiredInt('line'),
        action: d.requiredString('action'),
        studentId: d.optionalString('studentId'),
        groupIds: d.stringList('groupIds'),
        fullName: d.optionalString('fullName'),
        birthDate: d.optionalString('birthDate'),
        guardianName: d.optionalString('guardianName'),
        guardianPhone: d.optionalString('guardianPhone'),
        email: d.optionalString('email'),
        confirmDuplicate: d.bool('confirmDuplicate'),
      };
      const tx = scope.tx;
      const transactions = new SavepointTransactionRunner(tx);
      const closed = new SqlClosedPeriods(tx);
      const apply = new ApplyImport(
        new SpreadsheetParser(),
        matcher(scope),
        new RegisterStudent(
          new SqlStudentRepository(tx),
          new ClassesEnrolments(tx, clock),
          transactions,
          clock,
          new BillingMembership(tx),
        ),
        new ImportPayment(
          new SqlChargeRepository(tx),
          new SqlPaymentRepository(tx),
          new SqlDocumentSequence(tx),
          closed,
        ),
        new SqlStudentAccountRepository(tx),
        new RecordEntry(new SqlAccountingRepository(tx), closed),
        transactions,
        clock,
        new SqlAuditContext(tx),
      );
      return c.json(await apply.execute(body.requiredString('text'), decision));
    },
  );
}
