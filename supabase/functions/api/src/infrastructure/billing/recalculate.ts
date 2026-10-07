import { RecalculateCharges } from '../../application/billing/mod.ts';
import type { ApiApp, RequestScope } from '../http/app.ts';
import {
  SqlBillingSettingsRepository,
  SqlChargeRepository,
  SqlStudentAccountRepository,
  SqlStudentDirectory,
} from '../persistence/billing.ts';
import { Row } from '../persistence/sql.ts';

/**
 * Recalcula las cuotas de unos alumnos tras cambiar lo que las determina (grupos, horario especial, familia directa,
 * precio de particulares). Va en la misma transacción que el cambio.
 */
export async function recalculateFees(
  api: ApiApp,
  scope: RequestScope,
  studentIds: string[],
): Promise<void> {
  const recalculate = new RecalculateCharges(
    new SqlStudentDirectory(scope.tx),
    new SqlStudentAccountRepository(scope.tx),
    new SqlBillingSettingsRepository(scope.tx),
    new SqlChargeRepository(scope.tx),
    api.deps.clock,
  );
  for (const id of new Set(studentIds)) await recalculate.execute(id);
}

/** Recalcula las cuotas de todos los alumnos inscritos ahora en un grupo (p. ej. si cambia su horario). */
export async function recalculateGroupFees(
  api: ApiApp,
  scope: RequestScope,
  groupId: string,
): Promise<void> {
  const rows = await scope.tx`SELECT DISTINCT student_id FROM classes_enrolment
    WHERE class_group_id = ${groupId} AND (ends_on IS NULL OR ends_on > CURRENT_DATE)`;
  await recalculateFees(api, scope, Row.all(rows).map((r) => r.string('student_id')));
}
