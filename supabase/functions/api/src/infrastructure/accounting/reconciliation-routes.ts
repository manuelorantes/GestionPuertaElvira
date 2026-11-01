import { InvalidValue } from '../../domain/common/mod.ts';
import type { BankMovement } from '../../domain/accounting/reconciliation.ts';
import { EditMovement, RecordEntry, RecordTransfer } from '../../application/accounting/mod.ts';
import {
  AcceptReconciliation,
  ReconcileStatement,
  type ReconciliationActions,
} from '../../application/accounting/reconciliation.ts';
import { ChangePaymentMethod, ReschedulePayment } from '../../application/billing/mod.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlAccountingRepository,
  SqlLedgerQuery,
  SqlTransferRepository,
} from '../persistence/accounting.ts';
import { SqlClosedPeriods, SqlPaymentRepository } from '../persistence/billing.ts';
import { SqlBankMatchRepository, SqlPayerNames } from '../persistence/reconciliation.ts';

/** Un extracto de un mes tiene unas decenas de movimientos; más de esto no es un extracto. */
const MAX_MOVEMENTS = 2000;

function movementIn(b: JsonBody): BankMovement {
  return {
    operationDate: b.requiredString('operationDate'),
    valueDate: b.requiredString('valueDate'),
    concept: [...b.requiredString('concept')].slice(0, 300).join(''),
    amountCents: b.requiredInt('amountCents'),
    balanceCents: b.requiredInt('balanceCents'),
  };
}

const decimal = (cents: number) => (cents / 100).toFixed(2);

function actions(api: ApiApp, scope: RequestScope): ReconciliationActions {
  const accounting = new SqlAccountingRepository(scope.tx);
  const closed = new SqlClosedPeriods(scope.tx);
  const payments = new SqlPaymentRepository(scope.tx);
  const changePaymentMethod = (id: string, method: string) =>
    new ChangePaymentMethod(payments).execute(id, method);
  return {
    reschedulePayment: (id, date) =>
      new ReschedulePayment(payments, api.deps.clock).execute(id, date),
    changePaymentMethod,
    changeLineMethod: (line, method) =>
      new EditMovement(
        accounting,
        accounting,
        closed,
        accounting,
        new SqlLedgerQuery(scope.tx),
        accounting,
        { changePaymentMethod },
      ).execute({
        source: line.source,
        sourceId: line.sourceId,
        month: line.date.slice(0, 7),
        concept: line.concept,
        category: line.category,
        method,
        amount: decimal(line.amountCents),
        period: line.period,
        shares: line.shares,
      }),
    recordEntry: (input) =>
      new RecordEntry(accounting, closed, accounting).execute({
        date: input.date,
        kind: input.kind,
        concept: input.concept,
        category: input.category,
        method: input.method,
        amount: decimal(input.amountCents),
      }),
    recordTransfer: (input) =>
      new RecordTransfer(new SqlTransferRepository(scope.tx), closed).execute({
        date: input.date,
        from: input.from,
        to: input.to,
        amount: decimal(input.amountCents),
        note: input.note,
      }),
  };
}

/** Conciliación con el extracto del banco: solo superadministración. */
export function registerReconciliationRoutes(api: ApiApp): void {
  registerDomainErrors({ MovementAlreadyMatched: [409, 'already_matched'] });

  // Calcula sin guardar nada: es POST porque el extracto va en el cuerpo.
  api.defineRoute(
    { method: 'POST', path: '/api/admin/accounting/reconciliation', access: 'superadmin' },
    async (c, scope) => {
      const b = await JsonBody.from(c.req.raw);
      const movements = b.objectList('movements');
      if (movements.length > MAX_MOVEMENTS) {
        throw new InvalidValue('movements', 'El extracto tiene demasiados movimientos.');
      }
      const view = await new ReconcileStatement(
        new SqlLedgerQuery(scope.tx),
        new SqlTransferRepository(scope.tx),
        new SqlAccountingRepository(scope.tx),
        new SqlBankMatchRepository(scope.tx),
        new SqlPayerNames(scope.tx),
      ).execute(movements.map(movementIn));
      return c.json(view);
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/accounting/reconciliation/accept', access: 'superadmin' },
    async (c, scope) => {
      const b = await JsonBody.from(c.req.raw);
      const movement = b.optionalObject('movement');
      if (movement === null) throw new InvalidValue('movement', 'Falta el movimiento del banco.');
      const record = b.optionalObject('record');
      await new AcceptReconciliation(
        new SqlLedgerQuery(scope.tx),
        new SqlTransferRepository(scope.tx),
        new SqlBankMatchRepository(scope.tx),
        actions(api, scope),
      ).execute({
        movement: movementIn(movement),
        items: b.objectList('items').map((i) => ({
          source: i.requiredString('source'),
          sourceId: i.requiredString('sourceId'),
        })),
        record: record === null ? null : {
          concept: record.requiredString('concept'),
          category: record.requiredString('category'),
        },
        transfer: b.bool('transfer'),
      });
      return c.body(null, 204);
    },
  );
}
