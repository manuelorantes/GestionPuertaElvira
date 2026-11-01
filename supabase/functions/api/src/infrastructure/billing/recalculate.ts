import {
  ChooseFirstMonthFee,
  DropChargesBeforeJoining,
  type FirstMonthChoice,
  GenerateMonthlyCharges,
  RecalculateCharges,
} from '../../application/billing/mod.ts';
import { InvalidValue, type LocalDate, Money, type YearMonth } from '../../domain/common/mod.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
import type { JsonBody } from '../http/json-body.ts';
import {
  SqlBillingSettingsRepository,
  SqlChargeRepository,
  SqlPaymentRepository,
  SqlStudentAccountRepository,
  SqlStudentDirectory,
} from '../persistence/billing.ts';
import { PostgresAdvisoryLocks, Row, SavepointTransactionRunner } from '../persistence/sql.ts';

function recalculator(api: ApiApp, scope: RequestScope): RecalculateCharges {
  return new RecalculateCharges(
    new SqlStudentDirectory(scope.tx),
    new SqlStudentAccountRepository(scope.tx),
    new SqlBillingSettingsRepository(scope.tx),
    new SqlChargeRepository(scope.tx),
    api.deps.clock,
  );
}

/** Crea en el momento las cuotas que les falten este mes a unos alumnos (sin esperar a la tarea de la noche). */
export async function generatingCharges(
  api: ApiApp,
  scope: RequestScope,
  studentIds: string[],
): Promise<void> {
  await new GenerateMonthlyCharges(
    new SqlStudentDirectory(scope.tx),
    new SqlBillingSettingsRepository(scope.tx),
    new SqlStudentAccountRepository(scope.tx),
    new SqlChargeRepository(scope.tx),
    api.deps.clock,
    new SavepointTransactionRunner(scope.tx),
    new PostgresAdvisoryLocks(scope.tx),
  ).forStudents([...new Set(studentIds)]);
}

/**
 * Aplica un cambio que afecta a la cuota de unos alumnos (grupos, horario especial, familia directa, precio de
 * particulares) y recalcula sus cuotas, en la misma transacción, creando las que falten. Guarda antes su cuota para conservar el descuento
 * por pago adelantado de las cuotas que no lo tienen apuntado.
 */
export async function recalculatingFees<T>(
  api: ApiApp,
  scope: RequestScope,
  studentIds: string[],
  change: () => Promise<T>,
  notBefore: YearMonth | null = null,
): Promise<T> {
  const recalculate = recalculator(api, scope);
  const ids = [...new Set(studentIds)];
  const before = new Map<string, Money | null>();
  for (const id of ids) before.set(id, await recalculate.currentFee(id));
  const result = await change();
  for (const id of ids) await recalculate.execute(id, before.get(id) ?? null, notBefore);
  // Y las cuotas que les falten (p. ej. al inscribir en un grupo a quien no tenía), al momento.
  await generatingCharges(api, scope, ids);
  return result;
}

/** Igual, para todos los alumnos inscritos ahora en un grupo (p. ej. si cambia su horario). */
export async function recalculatingGroupFees<T>(
  api: ApiApp,
  scope: RequestScope,
  groupId: string,
  change: () => Promise<T>,
): Promise<T> {
  const rows = await scope.tx`SELECT DISTINCT student_id FROM classes_enrolment
    WHERE class_group_id = ${groupId} AND (ends_on IS NULL OR ends_on > CURRENT_DATE)`;
  return await recalculatingFees(
    api,
    scope,
    Row.all(rows).map((r) => r.string('student_id')),
    change,
  );
}

/** `firstMonth`: { mode: 'full' | 'part' | 'none', amountCents? } (qué se cobra del mes en un alta a final de mes). */
export function firstMonthChoiceFrom(body: JsonBody): FirstMonthChoice {
  const raw = body.optionalObject('firstMonth');
  const mode = raw?.optionalString('mode') ?? 'full';
  if (mode === 'full' || mode === 'none') return { kind: mode };
  if (mode === 'part') {
    const cents = raw?.optionalInt('amountCents') ?? null;
    if (cents === null) throw new InvalidValue('firstMonth', 'Indica cuánto paga de este mes.');
    return { kind: 'part', amount: Money.cents(cents) };
  }
  throw new InvalidValue('firstMonth', 'Elige si paga el mes entero, una parte o nada.');
}

/** Aplica, ya creada su cuota del mes, lo elegido para la cuota del mes de un alta a final de mes. */
export async function choosingFirstMonthFee(
  api: ApiApp,
  scope: RequestScope,
  studentId: string,
  joinedOn: string,
  choice: FirstMonthChoice,
): Promise<void> {
  await new ChooseFirstMonthFee(
    new SqlStudentAccountRepository(scope.tx),
    new SqlChargeRepository(scope.tx),
    api.deps.clock,
  ).execute(studentId, joinedOn, choice);
}

/** Al retrasar el alta a otro mes, borra las cuotas de los meses que ya no le tocan y mueve sus cobros. */
export async function droppingChargesBeforeJoining(
  scope: RequestScope,
  studentId: string,
  previous: LocalDate,
  joined: LocalDate,
): Promise<void> {
  await new DropChargesBeforeJoining(
    new SqlChargeRepository(scope.tx),
    new SqlPaymentRepository(scope.tx),
  ).execute(studentId, previous, joined);
}
