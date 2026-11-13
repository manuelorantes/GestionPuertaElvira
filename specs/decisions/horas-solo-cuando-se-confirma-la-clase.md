# Horas del profesorado solo cuando se confirma la clase

## Context
Hasta noviembre de 2026 una tarea de cada noche apuntaba en las horas todas las clases y turnos del horario del día.
«Listas sin pasar» salía de esas sesiones: avisaba de las apuntadas sin lista para quitarlas o darlas por buenas.
Eso daba horas por clases que no se habían dado.
Además, lo que administración quitaba ese mismo día volvía a aparecer esa noche: la tarea solo daba un día por cerrado
cuando lo procesaba como pasado, y GitHub la lanza a menudo pasada la medianoche.
Los profesores sin cuenta no salían en el aviso, así que sus clases contaban siempre.

## Decision
- **Ninguna hora se apunta sola.** Una sesión entra en las horas solo cuando alguien confirma que la clase o la
  actividad se dio: el profesor pasa lista, pulsa «Turno hecho» o marca a alguien en la lista de los viernes;
  superadministración pasa la lista; administración pulsa «Se dio»; o administración la apunta a mano. Todas pasan por
  el mismo caso de uso (`RecordScheduledSession`).
- **Se retiran** la tarea nocturna de horas (`app:payroll:propose-sessions`), el endpoint de mantenimiento que rellenaba
  un día (`POST /api/admin/payroll/days/:date/refill`) y su registro de días (`payroll_proposed_day`,
  `payroll_proposed_month`). El workflow sigue cada noche, solo para las cuotas («Cuotas del mes»).
- **«Listas sin pasar» sale del horario**, no de las horas: la agenda del club (`ClubAgenda`: horario, sustituciones y
  festivos) da lo que se esperaba cada día y SQL lo cruza con lo confirmado (listas, actividades, marcas de los viernes,
  sesiones a mano y `attendance_not_given`). Cuentan todos los profesores, tengan cuenta o no.
- **«No se dio»** guarda la decisión en `attendance_not_given` (y quita la sesión si la había), para que no vuelva a
  salir en el aviso de nadie.
- La agenda refleja el horario actual: una clase sin alumnos inscritos ese día no se espera (así un grupo nuevo no avisa
  de los días anteriores a sus primeras inscripciones), y los meses con la liquidación pagada no salen.

## Consequences
- Las horas de un mes solo crecen con confirmaciones: lo que nadie confirma no se paga hasta que administración decide.
- Administración tiene más trabajo con los profesores sin cuenta: cada clase suya sale en el aviso hasta que se decide.
- Cambiar el profesor de un grupo cambia de quién son las clases pasadas aún sin confirmar.
- Se pierde el aviso inmediato de «la noche lo apuntará»; el plazo para pasar lista (hasta el final del día siguiente)
  no cambia.
- Relacionado: [Historial de cambios con triggers](specs/decisions/historial-de-cambios-con-triggers.md).
