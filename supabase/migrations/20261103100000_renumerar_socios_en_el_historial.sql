-- Un «Cambio de datos» antiguo que solo cambió números de socio es «Renumerar socios», en Alumnos (lo que hoy hace
-- la API con ese nombre); se quedó sin clasificar al pasar el historial a categorías.
UPDATE audit_action a SET label = 'Renumerar socios', category = 'students'
 WHERE a.label = 'Cambio de datos'
   AND EXISTS (SELECT 1 FROM audit_change c WHERE c.action_id = a.id)
   AND NOT EXISTS (
       SELECT 1 FROM audit_change c
        WHERE c.action_id = a.id
          AND (c.table_name <> 'students_student' OR c.operation <> 'U'
               OR (c.before - 'member_number') IS DISTINCT FROM (c.after - 'member_number')));
