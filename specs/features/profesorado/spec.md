# Profesorado

Profesores del club, su tarifa por hora, las sesiones que imparten, su liquidación mensual y la rentabilidad de sus clases.
Solo administración puede gestionarlo.

### Requirement: Alta y edición de profesores
Administración MUST poder dar de alta profesores con su nombre y apellidos, y cambiarles el nombre, la tarifa y si
están activos, tanto desde Clases → Profesores como desde Profesores → Equipo. Un profesor nuevo nace activo.

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

### Requirement: Horas apuntadas solas
Las horas MUST apuntarse solas día a día: al acabar cada clase se crea su sesión, con la duración y la hora de inicio
del grupo, para quien la da ese día (el titular o quien le sustituye); al acabar cada turno fijo (encargado del club),
la suya. Solo se rellenan los días desde el mes anterior hasta hoy; un día ya apuntado no se rellena otra vez (lo que
administración borre no vuelve) y no se tocan las liquidaciones pagadas.

#### Scenario: A media tarde
- **WHEN** se consulta el registro de horas a las 17:30 de un martes
- **THEN** están las clases de ese martes que ya han acabado y no las que siguen en curso

### Requirement: Festivos
El club MUST tener su calendario de festivos (nacionales, de Andalucía y locales de Granada capital). Un festivo no
genera horas. Administración MUST poder añadir festivos (con nombre) y quitarlos; al añadir uno se quitan las sesiones
de ese día salvo las de liquidaciones pagadas.

### Requirement: Sustituciones
Lo habitual es sustituir a un profesor por otro: administración MUST poder elegir quién falta, los días (de uno a 62
seguidos) y quién le sustituye, y se planifica la sustitución de cada clase suya en esos días salvo festivos. Para casos
especiales MUST poder planificarse una sola clase (día, clase de ese día y quién la da). Cada sustitución lleva un motivo
opcional, se puede anular y se ve en un calendario del mes junto con los festivos. Ese día la sesión se apunta a quien sustituye; si ya estaba apuntada,
pasa a quien sustituye (o vuelve al titular al anularla). Si quien sustituye ya tiene otra clase o un turno a esa hora,
es un caso especial: MUST indicarse el motivo y no suma horas dobles.

#### Scenario: Sustituir a un profesor
- **WHEN** una profesora con clase lunes y miércoles falta del miércoles 7 al miércoles 14 y el lunes 12 es festivo
- **THEN** se planifican las sustituciones del miércoles 7 y del miércoles 14 para quien la sustituye

#### Scenario: Dos clases a la vez
- **WHEN** se intenta que un profesor sustituya una clase a la misma hora que la suya sin indicar motivo
- **THEN** se pide el motivo (y al sustituir a un profesor no se planifica ninguna de sus clases hasta indicarlo); con motivo, se planifica y sus horas de esa franja cuentan una sola vez

### Requirement: Encargado del club
Administración MUST poder definir turnos fijos semanales (por defecto «Encargado del club»: día, franja y profesor),
cambiarlos y quitarlos. Cada semana cuentan como horas de quien los tiene. Las horas que se solapan el mismo día
(una clase durante el turno) MUST contar una sola vez.

#### Scenario: Encargado con clase
- **WHEN** un profesor es encargado de 17:00 a 20:00 y tiene clase de 18:00 a 19:30
- **THEN** ese día se le pagan 3 horas

### Requirement: Registro de horas
Administración MUST poder añadir sesiones de un grupo u otras actividades (con descripción), cambiar su profesor y sus horas
(de 0,5 a 12, en medias horas) y quitarlas (por ejemplo, un cambio de última hora o una falta), viendo el coste de cada una.

### Requirement: Liquidación mensual
La liquidación de cada profesor y mes MUST ser horas × tarifa (sin contar dos veces las que se solapan el mismo día), redondeada a céntimos, con el detalle por grupo o actividad.
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
