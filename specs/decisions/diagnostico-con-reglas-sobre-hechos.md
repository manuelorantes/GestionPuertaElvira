# Diagnóstico con reglas sobre hechos

## Context
Los datos del club llegan de varias fuentes (hoja importada, altas a mano, cobros, horas, contabilidad) y dejan de
cuadrar entre contextos: cuotas que no corresponden a las horas, alumnos que pagan sin grupo, familias sin vincular,
pagos de más al profesorado anotados como gasto, categorías genéricas, facturas que duplican apuntes. Administración
quiere verlo todo en un sitio, explicado, con una solución que se acepta o se descarta, y que se repita cada noche
(ver [la spec](../features/diagnostico/spec.md)). Las comprobaciones valiosas cruzan contextos, así que no caben en
ninguno de los existentes.

## Decision
- **Contexto propio `diagnostics`**, con sus tres capas. Lee de todos los demás contextos y aplica arreglos a través de
  sus casos de uso; no toca sus reglas de negocio.
- **Las reglas son funciones puras sobre `Facts`**: una foto de solo lectura con lo que necesitan (alumnos con horas y
  tarifa de hoy, cuotas con lo cubierto, recibos, libro, apuntes, facturas, profesores con horas y liquidaciones,
  puntos), cargada una vez por diagnóstico por `SqlDiagnosticsFacts` reutilizando las consultas y el cálculo de
  tarifa de cada contexto. Así cada regla se prueba en unitario sin base de datos y añadir una es añadir una función.
- **Huella canónica en texto** (`regla|tipo|id|JSON con claves ordenadas de los datos del caso`), única en la tabla.
  Es lo que hace que dos diagnósticos sin cambios no dupliquen, que un descarte dure mientras los datos sean los mismos
  y que un cambio de datos sea un caso nuevo. Legible al depurar; sin hash.
- **Hallazgos persistidos con estado** (`open | accepted | dismissed | resolved`) y una fila por ejecución
  (`diagnostics_run`). El diagnóstico reconcilia: toca los abiertos que siguen, crea los nuevos, omite los descartados y
  resuelve los que ya no se reproducen. Corre bajo un cerrojo consultivo para no solaparse con la tarea nocturna.
- **Aceptar re-evalúa la regla** sobre los hechos de ese momento antes de aplicar el arreglo: si la huella ya no se
  reproduce, responde 409 `finding_outdated` y no aplica nada. Todo va en la transacción de la petición.
- **Los arreglos componen casos de uso existentes** (`UseCaseFixExecutor`: recálculo de cuota conservando el descuento,
  vincular familia con recálculo, mover «En el grupo desde», editar alumno, cambiar categoría, convertir apunte en
  anticipo). Mismas validaciones, mismo recálculo y mismo historial que hacerlo a mano; la etiqueta del historial es
  «Aceptar hallazgo».
- **Sin triggers de historial en las tablas del diagnóstico**: son datos derivados que se reescriben cada noche (como
  `system_task_run`). Quién aceptó o descartó queda en la propia fila; los cambios aplicados ya quedan en el historial
  por los triggers de sus tablas.
- **Workflow propio `diagnostico.yml`** a las 22:00 UTC, media hora después de «Horas automáticas y cuotas», con su
  propia tarea en Sistema; un fallo del diagnóstico no marca en rojo las horas.

## Consequences
- Las 21 reglas viven en `application/diagnostics/rules/*` con un test unitario cada una; la pantalla y la tarea
  nocturna usan exactamente la misma función `RunDiagnosis`.
- La carga de hechos hace unas pocas consultas por alumno (perfil, detalle, cuenta); con el tamaño del club son unos
  segundos. Si creciera, `SqlDiagnosticsFacts` puede cargar en bloque sin tocar las reglas.
- La regla «Cuota distinta de la tarifa» usa el mismo cálculo que el recálculo de Cobros; si cambia una, cambia la
  otra. Los meses pasados se excluyen a propósito.
- Una regla nueva o un dato nuevo en la huella hace que los descartes anteriores de esa regla dejen de aplicar (son
  casos «nuevos»): es el comportamiento buscado, pero conviene saberlo al cambiar una regla.
