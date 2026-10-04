<?php

declare(strict_types=1);

namespace App\Infrastructure\Audit;

/** Nombres legibles de las acciones (por ruta) y de lo que tocan (por tabla). */
final class AuditLabels
{
    private const array ROUTES = [
        'api_admin_accounting_record_entry' => 'Añadir movimiento',
        'api_admin_accounting_delete_entry' => 'Quitar movimiento',
        'api_admin_accounting_register_invoice' => 'Registrar factura de proveedor',
        'api_admin_accounting_pay_invoice' => 'Pagar factura de proveedor',
        'api_admin_accounting_attach' => 'Adjuntar documento a factura',
        'api_admin_accounting_delete_invoice' => 'Quitar factura de proveedor',
        'api_admin_accounting_close' => 'Cerrar temporada',
        'api_admin_billing_reminded' => 'Avisar por WhatsApp',
        'api_admin_billing_register' => 'Registrar cobro',
        'api_admin_billing_invoice' => 'Emitir factura',
        'api_admin_billing_update_account' => 'Cambiar datos de cobro del alumno',
        'api_admin_billing_points' => 'Cambiar puntos',
        'api_admin_billing_update_settings' => 'Cambiar tarifas y ajustes',
        'api_admin_billing_charges' => 'Generar cuotas del mes',
        'api_admin_dashboard' => 'Generar cuotas del mes',
        'api_admin_groups_create' => 'Crear grupo',
        'api_admin_groups_update' => 'Editar grupo',
        'api_auth_password' => 'Cambiar contraseña',
        'api_admin_payroll_record' => 'Registrar horas',
        'api_admin_payroll_update' => 'Editar sesión',
        'api_admin_payroll_delete' => 'Quitar sesión',
        'api_admin_payroll_holiday' => 'Marcar festivo',
        'api_admin_payroll_pay' => 'Pagar liquidación',
        'api_admin_payroll_pay_all' => 'Pagar todas las liquidaciones',
        'api_admin_payroll_sessions' => 'Proponer horas del mes',
        'api_admin_payroll_settlements' => 'Proponer horas del mes',
        'api_admin_payroll_profitability' => 'Proponer horas del mes',
        'api_admin_enrolments_add' => 'Inscribir en grupo',
        'api_admin_enrolments_remove' => 'Quitar de grupo',
        'api_admin_enrolments_move' => 'Mover de grupo',
        'api_admin_students_create' => 'Dar de alta alumno',
        'api_admin_students_update' => 'Editar alumno',
        'api_admin_students_withdraw' => 'Dar de baja alumno',
        'api_admin_students_link_sibling' => 'Vincular hermanos',
        'api_admin_students_unlink_sibling' => 'Desvincular hermanos',
        'api_admin_teachers_create' => 'Crear profesor',
        'api_admin_teachers_update' => 'Editar profesor',
        'api_admin_import_apply' => 'Importar hoja de cálculo',
    ];

    private const array TABLES = [
        'accounting_closing' => 'Cierre de temporada',
        'accounting_entry' => 'Movimiento manual',
        'accounting_invoice' => 'Factura de proveedor',
        'billing_account' => 'Datos de cobro del alumno',
        'billing_charge' => 'Cuota',
        'billing_document_sequence' => 'Numeración de documentos',
        'billing_payment' => 'Cobro',
        'billing_settings' => 'Tarifas y ajustes',
        'classes_enrolment' => 'Inscripción',
        'classes_group' => 'Grupo',
        'identity_user' => 'Usuario',
        'payroll_proposed_month' => 'Mes de horas propuesto',
        'payroll_session' => 'Sesión de profesor',
        'payroll_settlement' => 'Liquidación',
        'students_student' => 'Alumno',
        'teachers_teacher' => 'Profesor',
    ];

    private const array SECURITY = [
        'login.success' => 'Inicio de sesión',
        'login.failure' => 'Intento de acceso fallido',
        'logout.success' => 'Cierre de sesión',
        'password_change.success' => 'Cambio de contraseña',
        'password_change.failure' => 'Cambio de contraseña fallido',
        'password_reset.success' => 'Restablecer contraseña',
        'user_registered.success' => 'Alta de usuario',
        'role_changed.success' => 'Cambio de rol',
        'user_disabled.success' => 'Desactivar usuario',
        'user_enabled.success' => 'Activar usuario',
    ];

    public static function route(string $route): string
    {
        return self::ROUTES[$route] ?? 'Cambio de datos';
    }

    public static function table(string $table): string
    {
        return self::TABLES[$table] ?? $table;
    }

    public static function security(string $event, string $outcome): string
    {
        return self::SECURITY[$event.'.'.$outcome] ?? $event;
    }
}
