# Contextos de Alumnado, Clases y Profesorado

## Context

La gestión del club gira en torno a tres conceptos con reglas propias:

- los **alumnos**: datos personales de menores, tutores y hermanos;
- los **grupos y su horario**: aulas, plazas y solapes;
- el **profesorado**: hoy solo un nombre, y más adelante tarifas, horas y liquidaciones.

Un alumno puede estar en varios grupos a la vez,
y la ocupación de cada grupo depende de qué alumnos siguen activos.
La [arquitectura hexagonal](specs/decisions/arquitectura-hexagonal-ddd-en-symfony.md) exige que un dominio no importe otro.

## Decision

- **Tres contextos acotados**: `Students`, `Classes` y `Teachers`.
  Cada uno tiene su capa de dominio, que solo puede usar `domain/common` (lo comprueba el test de arquitectura).
- **La inscripción (`Enrolment`) es un agregado de `Classes`**, con fecha de inicio y de fin.
  La ocupación de un grupo cuenta las inscripciones activas en la fecha de hoy,
  y no necesita consultar el estado del alumno.
- **Dar de baja a un alumno pone fecha de fin a todas sus inscripciones.**
  Una baja programada deja de contar sola en su fecha.
- **Los contextos se comunican mediante puertos de Application**
  (`TeacherDirectory`, `TeacherAssignments`, `Enrolments` y `StudentStatus`).
  Cada puerto tiene un adaptador de Infrastructure que llama al caso de uso o a la consulta del otro contexto.
  Las referencias entre contextos son siempre por identificador.
- **Las operaciones que tocan varios agregados o contextos son atómicas**
  (alta con grupos, baja, mover de grupo, hermanos) y se ejecutan mediante `TransactionRunner`,
  sobre una única base de datos.
- **Las lecturas compuestas** (listas, fichas, horario) usan servicios de consulta con SQL y DTOs de lectura.
  Las escrituras pasan siempre por los agregados.
- `FullName`, `EmailAddress`, `LocalDate` y `PhoneNumber` viven en `Domain\Common`.

## Consequences

- Cada contexto se puede probar aislado con dobles de sus puertos.
- La consistencia entre contextos es inmediata y transaccional.
  Si algún día se separasen en servicios distintos, habría que sustituir los adaptadores por eventos.
- La inscripción con fechas permite construir más adelante la ocupación histórica mes a mes
  sin cambiar el modelo.
- La especificación de Profesorado ampliará el agregado `Teacher` existente.
