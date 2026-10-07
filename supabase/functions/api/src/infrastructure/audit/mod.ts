import { generateUuidV7 } from '../../domain/common/mod.ts';
import type { AuditContext } from '../../application/common/mod.ts';
import type { UserId } from '../../domain/identity/mod.ts';
import type {
  AuthenticatedUser,
  SecurityEventLog,
  SecurityOutcome,
} from '../../application/identity/mod.ts';
import type { Sql } from '../persistence/sql.ts';
import type { Logger } from '../logging/mod.ts';

/** Nombres legibles de las acciones (por método y ruta) y de lo que tocan (por tabla). */
export class AuditLabels {
  private static readonly ROUTES: Record<string, string> = {
    'POST /api/admin/accounting/entries': 'Añadir movimiento',
    'DELETE /api/admin/accounting/entries/:id': 'Quitar movimiento',
    'POST /api/admin/accounting/invoices': 'Registrar factura de proveedor',
    'POST /api/admin/accounting/invoices/:id/payment': 'Pagar factura de proveedor',
    'POST /api/admin/accounting/invoices/:id/attachment': 'Adjuntar documento a factura',
    'DELETE /api/admin/accounting/invoices/:id': 'Quitar factura de proveedor',
    'POST /api/admin/accounting/years/:year/closing': 'Cerrar temporada',
    'POST /api/admin/billing/charges/:id/reminded': 'Avisar por WhatsApp',
    'POST /api/admin/billing/payments': 'Registrar cobro',
    'POST /api/admin/billing/payments/:id/invoice': 'Emitir factura',
    'PUT /api/admin/billing/accounts/:id': 'Cambiar datos de cobro del alumno',
    'POST /api/admin/billing/accounts/:id/points': 'Cambiar puntos',
    'PUT /api/admin/billing/settings': 'Cambiar tarifas y ajustes',
    'GET /api/admin/billing/charges': 'Generar cuotas del mes',
    'GET /api/admin/dashboard': 'Generar cuotas del mes',
    'POST /api/admin/groups': 'Crear grupo',
    'PUT /api/admin/groups/:id': 'Editar grupo',
    'PUT /api/auth/password': 'Cambiar contraseña',
    'POST /api/admin/payroll/sessions': 'Registrar horas',
    'PUT /api/admin/payroll/sessions/:id': 'Editar sesión',
    'DELETE /api/admin/payroll/sessions/:id': 'Quitar sesión',
    'POST /api/admin/payroll/holidays': 'Marcar festivo',
    'POST /api/admin/payroll/settlements/:teacherId/:month/payment': 'Pagar liquidación',
    'POST /api/admin/payroll/settlements/:month/payment': 'Pagar todas las liquidaciones',
    'GET /api/admin/payroll/sessions': 'Proponer horas del mes',
    'GET /api/admin/payroll/settlements': 'Proponer horas del mes',
    'GET /api/admin/payroll/profitability': 'Proponer horas del mes',
    'POST /api/admin/students/:id/enrolments': 'Inscribir en grupo',
    'DELETE /api/admin/students/:id/enrolments/:groupId': 'Quitar de grupo',
    'POST /api/admin/students/:id/enrolments/:groupId/move': 'Mover de grupo',
    'POST /api/admin/students': 'Dar de alta alumno',
    'PUT /api/admin/students/:id': 'Editar alumno',
    'POST /api/admin/students/:id/withdrawal': 'Dar de baja alumno',
    'POST /api/admin/students/:id/siblings': 'Vincular hermanos',
    'DELETE /api/admin/students/:id/siblings/:siblingId': 'Desvincular hermanos',
    'POST /api/admin/teachers': 'Crear profesor',
    'PUT /api/admin/teachers/:id': 'Editar profesor',
    'POST /api/admin/users': 'Crear cuenta de usuario',
    'POST /api/admin/users/:id/impersonate': 'Suplantar cuenta',
    'POST /api/auth/impersonation/stop': 'Volver a la cuenta propia',
    'POST /api/admin/users/:id/password-reset': 'Restablecer contraseña',
    'POST /api/admin/users/:id/disable': 'Desactivar cuenta',
    'POST /api/admin/users/:id/enable': 'Reactivar cuenta',
    'PUT /api/admin/users/:id/role': 'Cambiar rol de cuenta',
    'POST /api/admin/import/rows': 'Importar fila de la hoja',
  };

  private static readonly TABLES: Record<string, string> = {
    accounting_closing: 'Cierre de temporada',
    accounting_entry: 'Movimiento manual',
    accounting_invoice: 'Factura de proveedor',
    billing_account: 'Datos de cobro del alumno',
    billing_charge: 'Cuota',
    billing_document_sequence: 'Numeración de documentos',
    billing_payment: 'Cobro',
    billing_settings: 'Tarifas y ajustes',
    classes_enrolment: 'Inscripción',
    classes_group: 'Grupo',
    identity_user: 'Usuario',
    payroll_proposed_month: 'Mes de horas propuesto',
    payroll_session: 'Sesión de profesor',
    payroll_settlement: 'Liquidación',
    students_student: 'Alumno',
    teachers_teacher: 'Profesor',
  };

  private static readonly SECURITY: Record<string, string> = {
    'login.success': 'Inicio de sesión',
    'login.failure': 'Intento de acceso fallido',
    'logout.success': 'Cierre de sesión',
    'impersonation_start.success': 'Empieza a suplantar una cuenta',
    'impersonation_stop.success': 'Deja de suplantar una cuenta',
    'password_change.success': 'Cambio de contraseña',
    'password_change.failure': 'Cambio de contraseña fallido',
    'password_reset.success': 'Restablecer contraseña',
    'user_registered.success': 'Alta de usuario',
    'role_changed.success': 'Cambio de rol',
    'user_disabled.success': 'Desactivar usuario',
    'user_enabled.success': 'Activar usuario',
  };

  static route(method: string, path: string): string {
    return AuditLabels.ROUTES[`${method} ${path}`] ?? 'Cambio de datos';
  }

  static table(table: string): string {
    return AuditLabels.TABLES[table] ?? table;
  }

  static security(event: string, outcome: string): string {
    return AuditLabels.SECURITY[`${event}.${outcome}`] ?? event;
  }
}

/**
 * Cada petición a la API es una acción del historial: quién la hace y qué hace se fijan como variables locales
 * de la transacción, y el trigger de captura las usa para agrupar y firmar los cambios
 * (ver historial-de-cambios-con-triggers.md).
 */
/** Firma del historial: la cuenta y, si alguien la suplanta, quién («Junta (suplantada por Ana)»). */
function signature(user: AuthenticatedUser | null): string {
  if (user === null) return '';
  const name = user.impersonatedBy === null
    ? user.fullName
    : `${user.fullName} (suplantada por ${user.impersonatedBy.fullName})`;
  return [...name].slice(0, 120).join('');
}

export async function startAuditAction(
  tx: Sql,
  user: AuthenticatedUser | null,
  label: string,
): Promise<void> {
  await tx`SELECT set_config('audit.action_id', ${generateUuidV7()}, true), set_config('audit.kind', 'change', true),
    set_config('audit.user_id', ${user?.id ?? ''}, true), set_config('audit.user_name', ${
    signature(user)
  }, true),
    set_config('audit.label', ${label}, true)`;
}

export class SqlAuditContext implements AuditContext {
  constructor(private readonly tx: Sql) {}

  async relabel(label: string): Promise<void> {
    await this.tx`SELECT set_config('audit.label', ${[...label].slice(0, 160).join('')}, true)`;
  }
}

/** Los eventos de seguridad van al log y, además, al historial como acciones sin cambios de datos. */
export class AuditedSecurityEventLog implements SecurityEventLog {
  constructor(
    private readonly logger: Logger,
    private readonly sql: Sql,
  ) {}

  async record(event: string, outcome: SecurityOutcome, userId?: UserId | null): Promise<void> {
    this.logger.log(outcome === 'success' ? 'info' : 'notice', `security.${event}`, {
      event,
      outcome,
      user_id: userId?.value ?? null,
    });
    const user = userId?.value ?? null;
    await this.sql`
      INSERT INTO audit_action (id, kind, user_id, user_name, label)
      VALUES (${generateUuidV7()}, 'security', ${user}::uuid,
              COALESCE((SELECT full_name FROM identity_user WHERE id = ${user}::uuid),
                       NULLIF(current_setting('audit.user_name', true), ''), 'Desconocido'),
              ${AuditLabels.security(event, outcome)})`;
  }
}
