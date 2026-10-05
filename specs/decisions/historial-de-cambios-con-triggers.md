# Historial de cambios con triggers de PostgreSQL

## Context
El club quiere saber quién hizo cada acción con consecuencias y poder deshacer una acción o volver a cualquier punto.
Los cambios llegan desde muchos casos de uso, repositorios SQL, SQL directo (secuencias, seed) y la consola.

## Decision
- **Captura en la base de datos**: un trigger `AFTER INSERT/UPDATE/DELETE` en cada tabla de datos del club guarda en `audit_change`
  la fila antes y después (`jsonb`), la tabla, la clave y la operación. No se escapa ningún camino de escritura.
- **Agrupación por acción** (`audit_action`): la web fija al empezar cada petición variables de sesión de PostgreSQL
  (`audit.action_id`, `audit.user_id`, `audit.user_name`, `audit.label`); el trigger crea la acción con el primer cambio.
  Sin variables (consola, tareas) la acción es «Sistema», una por transacción.
- **Eventos de seguridad** (inicio, cierre, intentos fallidos y gestión de usuarios) se guardan como acciones sin cambios.
- **Reversión en SQL** (`audit_revert_change`): alta → borrar, baja → insertar la fila anterior, cambio → restaurar la fila anterior.
  «Deshacer» revierte los cambios de una acción si nada posterior tocó esos registros; «volver a un punto» revierte todos los posteriores.
  La reversión se ejecuta como una acción más (queda registrada y se puede deshacer).
- `identity_user` se registra pero no se revierte; las sesiones, la caché y las migraciones no se registran.
- Los documentos de facturas no se borran físicamente.
- Las funciones y triggers viven en las migraciones SQL (`supabase/migrations`), como el resto del esquema.

## Consequences
- Cada escritura cuesta una fila más en `audit_change`; para el volumen del club es despreciable.
- Volver atrás reescribe datos de todo el club: siempre con confirmación y solo administración.
