-- Categorías del historial: cada acción pertenece a una parte de la aplicación (alumnos, cuotas, nóminas…) y por
-- ella se filtra. Lo ya registrado se clasifica por el nombre de la acción y, si era un «Cambio de datos» sin nombre,
-- por lo que tocó. De paso, el nombre deja de llevar a quién afectó (eso se ve en el detalle) y se unifican nombres
-- antiguos de la misma acción.

ALTER TABLE audit_action ADD COLUMN category varchar(20) NOT NULL DEFAULT 'system';
ALTER TABLE audit_action ADD CONSTRAINT audit_action_category_check CHECK (category IN (
    'students', 'groups', 'charges', 'payments', 'attendance', 'points', 'teachers', 'payroll', 'accounting',
    'equipment', 'system'));

-- La API fija la categoría de cada petición; sin ella (consola, tareas programadas), «system».
CREATE OR REPLACE FUNCTION public.audit_capture() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_action UUID := NULLIF(current_setting('audit.action_id', true), '')::uuid;
    v_row JSONB;
    v_key JSONB;
BEGIN
    IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
        RETURN NULL;
    END IF;
    IF v_action IS NULL THEN
        v_action := gen_random_uuid();
        PERFORM set_config('audit.action_id', v_action::text, true);
    END IF;
    INSERT INTO audit_action (id, kind, category, user_id, user_name, label)
    VALUES (
        v_action,
        COALESCE(NULLIF(current_setting('audit.kind', true), ''), 'change'),
        COALESCE(NULLIF(current_setting('audit.category', true), ''), 'system'),
        NULLIF(current_setting('audit.user_id', true), '')::uuid,
        COALESCE(NULLIF(current_setting('audit.user_name', true), ''), 'Sistema'),
        COALESCE(NULLIF(current_setting('audit.label', true), ''), 'Cambio desde la consola')
    )
    ON CONFLICT (id) DO NOTHING;
    v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    SELECT jsonb_object_agg(k, v_row -> k) INTO v_key FROM unnest(TG_ARGV) AS k;
    INSERT INTO audit_change (action_id, table_name, row_key, operation, before, after)
    VALUES (
        v_action, TG_TABLE_NAME, v_key, left(TG_OP, 1),
        CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
    );
    RETURN NULL;
END $$;

-- Nombres: sin el alumno importado y sin los nombres antiguos de la misma acción (también tras «Deshacer: »).
UPDATE audit_action SET label = regexp_replace(label, '^(Deshacer: )?Importar fila de la hoja: .*$', '\1Importar fila de la hoja')
 WHERE label ~ '^(Deshacer: )?Importar fila de la hoja: ';
UPDATE audit_action SET label = replace(label, 'Vincular hermanos', 'Vincular familia directa')
 WHERE label ~ '^(Deshacer: )?Vincular hermanos$';
UPDATE audit_action SET label = replace(label, 'Cambiar puntos', 'Ajustar puntos a mano')
 WHERE label ~ '^(Deshacer: )?Cambiar puntos$';

-- Los «Cambio de datos» (peticiones que aún no tenían nombre), por lo que tocaron.
WITH named AS (
    SELECT a.id,
           CASE
               WHEN bool_or(c.table_name = 'points_movement') THEN 'Marcar asistencia de un viernes'
               WHEN bool_or(c.table_name = 'classes_enrolment') THEN 'Cambiar la asistencia a un grupo'
               WHEN bool_or(c.table_name = 'billing_payment') THEN 'Corregir un cobro'
               WHEN bool_or(c.table_name = 'accounting_category') THEN 'Editar categoría del club'
               WHEN bool_or(c.table_name = 'accounting_settings') THEN 'Elegir las categorías de cada mes'
               WHEN bool_or(c.table_name = 'accounting_transfer') THEN 'Apuntar traspaso entre caja y banco'
               WHEN bool_or(c.table_name IN ('accounting_correction', 'accounting_entry'))
                   THEN 'Corregir movimiento del libro'
               WHEN bool_or(c.table_name LIKE 'attendance_%') THEN 'Pasar lista'
           END AS label
      FROM audit_action a JOIN audit_change c ON c.action_id = a.id
     WHERE a.label = 'Cambio de datos'
     GROUP BY a.id
)
UPDATE audit_action a SET label = named.label
  FROM named WHERE a.id = named.id AND named.label IS NOT NULL;

-- Por el nombre de la acción (el mismo reparto que hace la API por ruta); lo demás se queda en «system».
UPDATE audit_action a SET category = known.category
  FROM (VALUES
    ('Aceptar hallazgo', 'system'),
    ('Adjuntar documento a factura', 'accounting'),
    ('Ajustar puntos a mano', 'points'),
    ('Anular sustitución', 'teachers'),
    ('Apuntar horas automáticas', 'teachers'),
    ('Apuntar las horas de un día', 'teachers'),
    ('Apuntar pedido de material', 'equipment'),
    ('Apuntar traspaso entre caja y banco', 'accounting'),
    ('Apuntar un anticipo a un profesor', 'payroll'),
    ('Avisar por WhatsApp', 'charges'),
    ('Añadir email a una cuenta', 'system'),
    ('Añadir festivo', 'teachers'),
    ('Añadir foto de torneo', 'points'),
    ('Añadir gasto esperado', 'accounting'),
    ('Añadir movimiento', 'accounting'),
    ('Borrar compra de material', 'equipment'),
    ('Cambiar comentario de una clase', 'attendance'),
    ('Cambiar contraseña', 'system'),
    ('Cambiar datos de cobro del alumno', 'charges'),
    ('Cambiar descuento de una cuota', 'charges'),
    ('Cambiar desde cuándo está en un grupo', 'groups'),
    ('Cambiar el importe de un cobro', 'payments'),
    ('Cambiar el precio de un pedido de material', 'equipment'),
    ('Cambiar la asistencia a un grupo', 'groups'),
    ('Cambiar la fecha de alta de un alumno', 'students'),
    ('Cambiar la fecha de pago de una liquidación', 'payroll'),
    ('Cambiar la fecha de un cobro', 'payments'),
    ('Cambiar la forma de pago de un cobro', 'payments'),
    ('Cambiar puntos', 'points'),
    ('Cambiar rol de cuenta', 'system'),
    ('Cambiar tarifas y ajustes', 'charges'),
    ('Cambiar turno de encargado', 'teachers'),
    ('Cancelar cuota', 'charges'),
    ('Cancelar pedido de material', 'equipment'),
    ('Cerrar temporada', 'accounting'),
    ('Comentar una clase', 'attendance'),
    ('Confirmar una actividad del club', 'attendance'),
    ('Corregir compra de material', 'equipment'),
    ('Corregir movimiento del libro', 'accounting'),
    ('Corregir pedido de material', 'equipment'),
    ('Corregir un cobro', 'payments'),
    ('Crear categoría del club', 'accounting'),
    ('Crear cuenta de usuario', 'system'),
    ('Crear grupo', 'groups'),
    ('Crear producto de material', 'equipment'),
    ('Crear profesor', 'teachers'),
    ('Crear turno de encargado', 'teachers'),
    ('Dar de alta alumno', 'students'),
    ('Dar de alta de nuevo a un alumno', 'students'),
    ('Dar de baja alumno', 'students'),
    ('Dar por buena una actividad sin confirmar', 'attendance'),
    ('Dar por buena una clase sin lista', 'attendance'),
    ('Desactivar cuenta', 'system'),
    ('Descartar hallazgo', 'system'),
    ('Deshacer la entrega de material', 'equipment'),
    ('Desvincular familia directa', 'students'),
    ('Diagnosticar', 'system'),
    ('Editar alumno', 'students'),
    ('Editar categoría del club', 'accounting'),
    ('Editar cuota', 'charges'),
    ('Editar factura de proveedor', 'accounting'),
    ('Editar gasto esperado', 'accounting'),
    ('Editar grupo', 'groups'),
    ('Editar producto de material', 'equipment'),
    ('Editar profesor', 'teachers'),
    ('Editar sesión', 'teachers'),
    ('Elegir las categorías de cada mes', 'accounting'),
    ('Emitir factura', 'payments'),
    ('Entregar material', 'equipment'),
    ('Generar cuotas del mes', 'charges'),
    ('Importar fila de la hoja', 'students'),
    ('Inscribir en grupo', 'groups'),
    ('Marcar asistencia de un viernes', 'points'),
    ('Marcar «No hay este mes»', 'accounting'),
    ('Mover de grupo', 'groups'),
    ('Pagar factura de proveedor', 'accounting'),
    ('Pagar gasto esperado', 'accounting'),
    ('Pagar liquidación', 'payroll'),
    ('Pagar todas las liquidaciones', 'payroll'),
    ('Pasar a pedido el material', 'equipment'),
    ('Pasar lista', 'attendance'),
    ('Planificar sustitución', 'teachers'),
    ('Proponer horas del mes', 'teachers'),
    ('Quitar categoría del club', 'accounting'),
    ('Quitar comentario de una clase', 'attendance'),
    ('Quitar de grupo', 'groups'),
    ('Quitar email de una cuenta', 'system'),
    ('Quitar factura de proveedor', 'accounting'),
    ('Quitar festivo', 'teachers'),
    ('Quitar foto de torneo', 'points'),
    ('Quitar gasto esperado', 'accounting'),
    ('Quitar hallazgo', 'system'),
    ('Quitar movimiento', 'accounting'),
    ('Quitar sesión', 'teachers'),
    ('Quitar traspaso entre caja y banco', 'accounting'),
    ('Quitar turno de encargado', 'teachers'),
    ('Quitar un anticipo', 'payroll'),
    ('Reactivar cuenta', 'system'),
    ('Reactivar cuota', 'charges'),
    ('Reactivar pedido de material', 'equipment'),
    ('Registrar cobro', 'payments'),
    ('Registrar compra de material', 'equipment'),
    ('Registrar factura de proveedor', 'accounting'),
    ('Registrar horas', 'teachers'),
    ('Renumerar socios', 'students'),
    ('Restablecer contraseña', 'system'),
    ('Suplantar cuenta', 'system'),
    ('Sustituir a un profesor', 'teachers'),
    ('Vincular cuenta a un profesor', 'system'),
    ('Vincular familia directa', 'students'),
    ('Vincular hermanos', 'students'),
    ('Volver a esperar un gasto', 'accounting'),
    ('Volver a la cuenta propia', 'system'),
    ('Volver a la cuota calculada', 'charges'),
    ('Volver a reservado un pedido de material', 'equipment')
  ) AS known(label, category)
 WHERE a.kind = 'change' AND a.label = known.label;

-- Deshacer y volver a un punto, en la categoría de lo que revierten (dos pasadas: se puede deshacer un deshacer).
UPDATE audit_action a SET category = r.category FROM audit_action r
 WHERE a.kind IN ('undo', 'restore') AND a.reverts = r.id;
UPDATE audit_action a SET category = r.category FROM audit_action r
 WHERE a.kind IN ('undo', 'restore') AND a.reverts = r.id;
