import { GenerateMonthlyCharges, RecalculateCharges } from '../../application/billing/mod.ts';
import type { Money } from '../../domain/common/mod.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
import {
  SqlBillingSettingsRepository,
  SqlChargeRepository,
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
): Promise<T> {
  const recalculate = recalculator(api, scope);
  const ids = [...new Set(studentIds)];
  const before = new Map<string, Money | null>();
  for (const id of ids) before.set(id, await recalculate.currentFee(id));
  const result = await change();
  for (const id of ids) await recalculate.execute(id, before.get(id) ?? null);
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
