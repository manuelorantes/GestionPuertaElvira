# Profesorado

Profesores del club, su tarifa por hora, las sesiones que imparten, su liquidación mensual y la rentabilidad de sus clases.
Solo administración puede gestionarlo.

### Requirement: Alta y edición de profesores
Administración MUST poder dar de alta profesores con su nombre y apellidos, y cambiarles el nombre.
Un profesor nuevo nace activo.

#### Scenario: Alta
- **WHEN** administración añade un profesor con su nombre
- **THEN** el profesor aparece en la lista como activo y con 0 grupos

### Requirement: Activación y desactivación
Un profesor MUST poder desactivarse y reactivarse.
Un profesor con grupos asignados MUST NOT poder desactivarse.

#### Scenario: Profesor con grupos
- **WHEN** se intenta desactivar a un profesor que tiene grupos
- **THEN** el sistema lo impide e indica cuántos grupos tiene, para asignarlos antes a otro profesor

#### Scenario: Profesor inactivo
- **WHEN** un profesor está inactivo
- **THEN** no se le pueden asignar grupos nuevos

### Requirement: Lista de profesores
La lista MUST mostrar cada profesor ordenado por nombre, con su tarifa por hora, su estado y su número de grupos.

#### Scenario: Consultar la lista
- **WHEN** administración abre la pestaña «Profesores» de Clases
- **THEN** ve todos los profesores con su estado y su número de grupos

### Requirement: Tarifa por hora
Cada profesor MUST tener una tarifa por hora (lo que el club le paga), de 15 €/h al darlo de alta, editable y nunca negativa.

### Requirement: Sesiones propuestas desde el horario
La primera vez que se consulta un mes de la temporada (nunca uno futuro), el sistema MUST proponer una sesión
por cada día de clase de cada grupo, con su profesor y la duración del grupo. Solo se propone una vez por mes.

#### Scenario: Festivo
- **WHEN** administración marca un día como festivo
- **THEN** se quitan todas las sesiones de ese día (salvo las de liquidaciones pagadas) y no vuelven a aparecer

#### Scenario: Sustitución
- **WHEN** administración cambia el profesor de una sesión
- **THEN** las horas cuentan para el sustituto en su liquidación

### Requirement: Registro de horas
Administración MUST poder añadir sesiones de un grupo u otras actividades (con descripción), cambiar su profesor y sus horas
(de 0,5 a 12, en medias horas) y quitarlas, viendo el coste de cada una.

### Requirement: Liquidación mensual
La liquidación de cada profesor y mes MUST ser horas × tarifa, redondeada a céntimos, con el detalle por grupo o actividad.
Se paga a mes vencido: por defecto se muestra el mes anterior. Se puede imprimir y marcar como pagada, una a una o todas.

#### Scenario: Pagar una liquidación
- **WHEN** administración marca como pagada una liquidación
- **THEN** sus horas, tarifa e importe quedan congelados aunque después cambie la tarifa, y las sesiones de ese profesor y mes ya no se pueden cambiar

### Requirement: Rentabilidad
Para cada mes, el sistema MUST mostrar por profesor: horas, tarifa, coste, ingresos atribuidos, margen, € por hora y ocupación de sus grupos,
con los totales del mes y ordenable por margen, € por hora u ocupación.
Los ingresos atribuidos son las cuotas mensuales cobradas de ese mes repartidas entre los profesores de cada alumno según sus horas semanales.
El de mayor margen positivo se destaca como «Más rentable».

### Requirement: Acceso restringido
La gestión del profesorado MUST estar reservada a cuentas de administración.

#### Scenario: Profesorado o anónimo
- **WHEN** una cuenta de profesorado o alguien sin sesión intenta consultar o modificar profesores
- **THEN** el sistema lo rechaza
