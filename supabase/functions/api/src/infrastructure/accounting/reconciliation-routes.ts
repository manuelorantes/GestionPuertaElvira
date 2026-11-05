import { InvalidValue } from '../../domain/common/mod.ts';
import type { BankMovement } from '../../domain/accounting/reconciliation.ts';
import { RecordEntry, RecordTransfer } from '../../application/accounting/mod.ts';
import {
  AcceptReconciliation,
  type FeePayments,
  QuoteFee,
  ReconcileStatement,
  type ReconciliationActions,
  ReleaseMatch,
} from '../../application/accounting/reconciliation.ts';
import {
  BillingStudentNotFound,
  CorrectPaymentAmount,
  type PaymentRequest,
  ReschedulePayment,
} from '../../application/billing/mod.ts';
import { InvalidPaymentRequest } from '../../domain/billing/mod.ts';
import { billing } from '../billing/routes.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlAccountingRepository,
  SqlLedgerQuery,
  SqlTransferRepository,
} from '../persistence/accounting.ts';
import { SqlClosedPeriods, SqlPaymentRepository } from '../persistence/billing.ts';
import {
  SqlBankMatchRepository,
  SqlPayerNames,
  SqlReconciledItems,
} from '../persistence/reconciliation.ts';

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
  const reconciled = new SqlReconciledItems(scope.tx);
  return {
    reschedulePayment: (id, date) =>
      new ReschedulePayment(payments, api.deps.clock, reconciled).execute(id, date),
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

/** Las cuotas mensuales, cobradas por transferencia con el caso de uso de Cobros. */
function feePayments(api: ApiApp, scope: RequestScope): FeePayments {
  const b = billing(api, scope);
  const request = (
    studentId: string,
    date: string,
    method = 'transfer',
    kind = 'monthly',
  ): PaymentRequest => ({
    studentId,
    kind,
    months: 1,
    method,
    date,
    specialPercent: null,
    specialAmountCents: null,
    specialConcept: null,
    redeemPoints: 0,
  });
  return {
    payers: (day) => new SqlPayerNames(scope.tx).active(day),
    quote: async (studentId, date, kind = 'monthly') => {
      try {
        const quote = await b.quotes.execute(request(studentId, date, 'transfer', kind));
        return { concept: quote.concept, amountCents: quote.quote.total.cents };
      } catch (error) {
        // Sin nada que cobrar (sin grupos, temporada pagada…) no hay cuota que proponer.
        if (error instanceof InvalidPaymentRequest || error instanceof BillingStudentNotFound) {
          return null;
        }
        throw error;
      }
    },
    register: (studentId, date, method, kind = 'monthly') =>
      b.register.execute(request(studentId, date, method, kind)),
    registerCredit: (studentId, date, method, amountCents) =>
      b.registerCredit.execute({ studentId, date, method, amountCents }),
    correct: (paymentId, totalCents, reason) =>
      new CorrectPaymentAmount(
        new SqlPaymentRepository(scope.tx),
        b.charges,
        new SqlReconciledItems(scope.tx),
      ).execute(paymentId, totalCents, reason),
  };
}

/** Conciliación con el extracto del banco: solo superadministración. */
export function registerReconciliationRoutes(api: ApiApp): void {
  registerDomainErrors({ MovementAlreadyMatched: [409, 'already_matched'] });

  // Calcula las sugerencias y recuerda lo que cuadra solo; el extracto va en el cuerpo.
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
        feePayments(api, scope),
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
        feePayments(api, scope),
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
        fees: b.objectList('fees').map((f) => {
          const kind = f.requiredString('kind');
          if (kind !== 'monthly' && kind !== 'membership' && kind !== 'credit') {
            throw new InvalidValue('fees', 'Tipo de cuota desconocido.');
          }
          return {
            studentId: f.requiredString('studentId'),
            kind,
            amountCents: f.optionalInt('amountCents'),
          };
        }),
        adjust: b.bool('adjust'),
      });
      return c.body(null, 204);
    },
  );

  // Lo que costaría cobrarle a un alumno su cuota con una transferencia de ese día, para repartirla a mano.
  api.defineRoute(
    { method: 'GET', path: '/api/admin/accounting/reconciliation/fee', access: 'superadmin' },
    async (c, scope) => {
      const fee = await new QuoteFee(feePayments(api, scope)).execute(
        c.req.query('studentId') ?? '',
        c.req.query('day') ?? '',
      );
      return c.json(fee);
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/accounting/reconciliation/release', access: 'superadmin' },
    async (c, scope) => {
      const b = await JsonBody.from(c.req.raw);
      const movement = b.optionalObject('movement');
      if (movement === null) throw new InvalidValue('movement', 'Falta el movimiento del banco.');
      await new ReleaseMatch(new SqlBankMatchRepository(scope.tx)).execute(movementIn(movement));
      return c.body(null, 204);
    },
  );
}
