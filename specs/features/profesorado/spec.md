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
- **WHEN** administración abre la pestaña «Equipo» de Profesores
- **THEN** ve todos los profesores con su estado y su número de grupos

### Requirement: Tarifa por hora
Cada profesor MUST tener una tarifa por hora (lo que el club le paga), de 15 €/h al darlo de alta, editable y nunca negativa.

### Requirement: Horas apuntadas solas
Las horas MUST apuntarse solas cada noche, con una tarea diaria que se ejecuta después del cierre del club: cada clase
del día crea su sesión, con la duración y la hora de inicio del grupo, para quien la da ese día (el titular o quien le
sustituye); cada actividad del club, la suya. La tarea rellena lo que falte desde el mes anterior hasta hoy, así que si
una noche no se ejecuta, la siguiente lo recupera; un día ya apuntado no se rellena otra vez (lo que administración
borre no vuelve) y no se tocan las liquidaciones pagadas. Consultar el registro de horas, las liquidaciones, la
rentabilidad o la ficha de un profesor no apunta nada.
Un profesor con cuenta no espera a la noche: al pasar la lista de una clase, al pulsar «Turno hecho» o al marcar a
alguien en la lista de los viernes, su sesión de esa clase o actividad se apunta en el momento (si no estaba ya).

#### Scenario: Horas al pasar lista
- **WHEN** Lucía pasa la lista de su clase del martes a las 18:00
- **THEN** su sesión de esa clase ya está en el registro de horas, y por la noche no se apunta otra vez

#### Scenario: A media tarde
- **WHEN** se consulta el registro de horas a las 17:30 de un martes
- **THEN** están las clases hasta el lunes y todavía no las de ese martes, que se apuntan esa noche

#### Scenario: Una noche sin tarea
- **WHEN** la tarea no se ejecuta el martes por la noche
- **THEN** el miércoles por la noche se apuntan las clases del martes y las del miércoles

### Requirement: Festivos
El club MUST tener su calendario de festivos (nacionales, de Andalucía y locales de Granada capital). Un festivo no
genera horas. Administración MUST poder añadir festivos (con nombre) y quitarlos; al añadir uno se quitan las sesiones
de ese día salvo las de liquidaciones pagadas.

### Requirement: Sustituciones
Lo habitual es sustituir a un profesor por otro un día: administración MUST poder elegir quién falta, el día y quién le
sustituye, y se planifica la sustitución de cada clase y turno suyo ese día. Para una baja MUST poder hacerse lo mismo en
un periodo largo (desde y hasta, como mucho 62 días), salvo festivos. Para casos especiales MUST poder planificarse una
sola clase o turno (día, clase o turno de ese día y quién lo da). Los turnos de encargado del club se sustituyen igual
que las clases. Cada sustitución lleva un motivo
opcional, se puede anular y se ve en un calendario del mes junto con los festivos. Ese día la sesión se apunta a quien sustituye; si ya estaba apuntada,
pasa a quien sustituye (o vuelve al titular al anularla). Si quien sustituye ya tiene otra clase o un turno a esa hora,
es un caso especial: MUST indicarse el motivo y no suma horas dobles.

#### Scenario: Sustituir a un profesor
- **WHEN** una profesora con clase lunes y miércoles falta del miércoles 7 al miércoles 14 y el lunes 12 es festivo
- **THEN** se planifican las sustituciones del miércoles 7 y del miércoles 14 para quien la sustituye

#### Scenario: Dos clases a la vez
- **WHEN** se intenta que un profesor sustituya una clase a la misma hora que la suya sin indicar motivo
- **THEN** se pide el motivo (y al sustituir a un profesor no se planifica ninguna de sus clases hasta indicarlo); con motivo, se planifica y sus horas de esa franja cuentan una sola vez

### Requirement: Actividades del club
Administración MUST poder definir actividades del club con un encargado fijo semanal (nombre, día, franja, encargado y
tipo), cambiarlas y quitarlas, en la pestaña «Actividades del club». Cada semana cuentan como horas de su encargado. Las
horas que se solapan el mismo día (una clase durante la actividad) MUST contar una sola vez. Hay dos tipos:
- **Turno** (por defecto «Encargado del club»): su encargado confirma «Turno hecho» desde su espacio.
- **Viernes**: su encargado pasa la lista de los viernes de los puntos (ver la spec de asistencia); la asistencia que
  marca es la misma que la de la pestaña Viernes de Puntos.
Una actividad que su encargado no confirma en el plazo de las listas sale en «Listas sin pasar» (ver la spec de
asistencia).

#### Scenario: Encargado con clase
- **WHEN** un profesor es encargado de 17:00 a 20:00 y tiene clase de 18:00 a 19:30
- **THEN** ese día se le pagan 3 horas

### Requirement: Registro de horas
Administración MUST poder añadir sesiones de un grupo, de una actividad del club (turno o viernes) u otras actividades (con
descripción), cambiar su profesor y sus horas (de 0,5 a 12, en medias horas) y quitarlas (por ejemplo, un cambio de última hora o una falta), viendo el coste de cada una.
El registro MUST ir de lo más reciente a lo más antiguo y mostrar en cada sesión las horas que cuentan de verdad y su
coste (ver los solapes en la liquidación): si otra sesión del mismo día se queda con parte de sus horas, un asterisco
explica cuántas eran y con qué se pisa. El total de arriba suma lo que cuenta.
Al elegir una actividad del club se proponen su encargado y sus horas, y la sesión queda ligada a la actividad como si la
hubiera apuntado la tarea de cada noche (cuenta los solapes con su hora de inicio y no se duplica): cada actividad se
apunta como mucho una vez por día.

#### Scenario: Apuntar a mano los viernes de Ángel
- **WHEN** administración registra horas, elige «Viernes · Ángel Castillo Rodriguez · Vie 17:00–20:00» y el viernes 2
- **THEN** se proponen Ángel y 3 h; al guardar, la sesión sale como su «Viernes», con los solapes con su clase descontados,
  y volver a apuntarla ese día se rechaza

#### Scenario: Una clase dentro de la actividad de los viernes
- **WHEN** Ángel tiene «Viernes» de 17:00 a 20:00 y clase de 17:00 a 18:30
- **THEN** el registro muestra la clase con 1,5 h y «Viernes» con 1,5 h*, con su coste de 1,5 h, y el asterisco dice
  que eran 3 h pero se pisa con la clase

#### Scenario: Dos clases a la vez
- **WHEN** un profesor tiene el mismo día y a la misma hora su clase y una que da sustituyendo a otro
- **THEN** su clase cuenta entera y la sustitución sale con 0 h* y 0 €

### Requirement: Liquidación mensual
La liquidación de cada profesor y mes MUST ser horas × tarifa, redondeada a céntimos, con el detalle por grupo o
actividad. Las horas que se solapan el mismo día cuentan una sola vez y van a la sesión más corta: esta cuenta entera y
la más larga se queda con lo que le sobra. Si duran lo mismo, van a su clase antes que a una sustitución (y, si las dos
son iguales en eso, a la que va antes).

#### Scenario: Clase durante la actividad de los viernes
- **WHEN** Ángel tiene clase de 16:30 a 18:00 y la actividad «Viernes» de 17:00 a 20:00
- **THEN** se le pagan 3,5 horas: 1,5 de la clase y 2 de la actividad
Se paga a mes vencido: por defecto se muestra el mes anterior. Se puede imprimir y marcar como pagada, una a una o todas.

#### Scenario: Pagar una liquidación
- **WHEN** administración marca como pagada una liquidación
- **THEN** sus horas, tarifa e importe quedan congelados aunque después cambie la tarifa, y las sesiones de ese profesor y mes ya no se pueden cambiar

### Requirement: Rentabilidad
Para cada mes, el sistema MUST mostrar por profesor: alumnos, horas, tarifa, coste, ingresos atribuidos, margen, € por hora y ocupación de sus grupos,
con los totales del mes y ordenable por margen, € por hora u ocupación.
- Horas y coste: en el mes en curso y los futuros, las horas esperadas según el horario (todas sus clases y turnos salvo
  festivos, aunque aún no se hayan dado; sin tener en cuenta sustituciones ni contar dos veces lo que se solapa) por su
  tarifa. En un mes ya pasado, las horas realmente imputadas y el coste de su liquidación.
- Ingresos atribuidos: las cuotas mensuales de ese mes de sus alumnos, ya con descuentos (familia, pago adelantado…),
  cobradas o por cobrar y, en meses futuros, las previstas; sin cuotas de socio. Si un alumno va con varios profesores,
  su cuota se reparte según las horas semanales con cada uno.
- Ocupación: plazas ocupadas de todas sus clases frente a las totales, contando cada día de clase.
- Alumnos: los inscritos en los grupos de los que es titular el mismo día de referencia que la ocupación (hoy en el mes
  en curso, el último día en un mes pasado, el primero en uno futuro); quien cambió de grupo a mitad de mes cuenta solo
  con el profesor nuevo, y las clases que da como sustituto no cuentan. En
  los totales, cada alumno MUST contar una sola vez aunque vaya con varios profesores; si hay alguno así, un asterisco
  junto al total abre la lista de esos alumnos, y cada nombre lleva a su ficha.

#### Scenario: Alumnos compartidos en los totales
- **WHEN** Lucía tiene 10 alumnos, Carlos 6 y Ana va con los dos
- **THEN** las filas muestran 10 y 6, el total muestra 15 con un asterisco, y al pincharlo sale «Ana Pérez», que lleva a
  su ficha

#### Scenario: Alumno con dos profesores
- **WHEN** un alumno que paga 70 € va 2 horas semanales con una profesora y 1,5 con otro
- **THEN** a ella se le atribuyen 40 € y a él 30 €
El de mayor margen positivo se destaca como «Más rentable».
Al pie MUST mostrarse los totales del mes: horas, tarifa media (ponderada por las horas de cada profesor), coste en
profesores, ingresos, margen, ganancia o pérdida por hora y ocupación media de todas las clases.

### Requirement: Ficha del profesor
Al pinchar el nombre de un profesor en cualquier pestaña de Profesores (o en la lista de profesores), MUST abrirse su
ficha con lo que sale de Clases, Alumnos y Profesorado restringido a él o ella:
- saldo a día de hoy: lo que le debemos (liquidaciones pendientes hasta hoy menos anticipos) o lo pagado de más;
- mes a mes de la temporada hasta hoy: horas, importe, anticipos, a pagar, estado (pagada y cuándo, pendiente o en
  curso), ingresos atribuidos y margen;
- clases dadas en el mes que se elija (fecha, clase o actividad, horas y coste); las que dio sustituyendo a otro
  profesor llevan delante «(Sustitución)»;
- sus clases asignadas con días, horario, aula, alumnos y ocupación, y la ocupación total de sus clases; cuando hay
  alumnos que no vienen todos los días de la clase, un asterisco junto a los alumnos abre los alumnos de cada día
  frente a las plazas;
- sus alumnos, con sus clases y las horas semanales con él o ella;
- pagos recibidos (liquidaciones y anticipos), sustituciones (dadas y recibidas) y turnos fijos.

### Requirement: Anticipos y fecha de pago
Administración MUST poder apuntar un anticipo a un profesor (importe, mes del que se descuenta, día en que se pagó y
nota) mientras la liquidación de ese mes no esté pagada, y quitarlo en las mismas condiciones. El anticipo sale en
Contabilidad el día que se paga y se descuenta de la liquidación de su mes (lo que queda por pagar y lo que sale en
Contabilidad al pagarla). Administración MUST poder corregir el día en que se pagó una liquidación.

#### Scenario: Pago de más
- **WHEN** a un profesor se le pagaron 90 € de más en septiembre y se apuntan como anticipo de octubre
- **THEN** su liquidación de octubre muestra −90 € de anticipo y lo que queda por pagar

### Requirement: Espacio del profesorado
Una cuenta de profesorado vinculada a un profesor (o la administración vinculada, en su espacio de profesor; ver la spec
de autenticación) MUST ver, pensado para el móvil, lo suyo
y, de solo lectura, lo del club que se indica:
- **Mis clases**: las de hoy y las de la semana, día a día, según el horario: las suyas salvo las que le sustituyen,
  más las que da sustituyendo a otro (marcadas «Sustitución»), sin festivos; con hora, aula, alumnos que van ese día y
  el estado de la lista (pasada, por pasar o sin pasar). Desde ahí pasa lista (ver la spec de asistencia).
- **Mis grupos**: los grupos de los que es titular y, marcados «Sustitución», aquellos en los que tiene una
  sustitución a 7 días o menos (antes o después). Cada grupo lleva a su página, de solo lectura, con:
  - los **comentarios de las clases** (ver la spec de asistencia), primero los de la clase y debajo los de los alumnos
    con un selector por alumno (los del grupo y los que vinieron en asistencia especial), del más reciente al más
    antiguo: los de las últimas 4 semanas y, con «Ver más», los 4 anteriores cada vez, hasta el inicio de la temporada;
  - sus **alumnos**, con los días que vienen si no son todos y su asistencia de la temporada en ese grupo (porcentaje de
    las clases con lista; por debajo del 75 % en rojo; «—» sin clases con lista);
  - la **asistencia del grupo** mes a mes, como la ve administración (ver la spec de asistencia), desde septiembre hasta
    el mes en curso; cada nombre lleva a la ficha del alumno, como en el resto del panel.
  No puede ver así ningún otro grupo.
- **Clases** y **Alumnos** del club, de solo lectura (ver las specs de clases y alumnos).
- **Mis pagos**: el mes a mes de la temporada hasta el mes en curso (horas, importe, anticipos, a pagar y estado:
  pagada y cuándo, pendiente o en curso) y los totales (lo que se le debe, lo cobrado, horas e importe), sin ingresos
  ni márgenes del club.
No MUST poder apuntar ni cambiar horas, sustituciones, turnos ni pagos.

#### Scenario: Una sustitución en su semana
- **WHEN** Lucía da el martes la clase de Carlos y consulta su semana
- **THEN** ve esa clase el martes marcada «Sustitución», y Carlos no la ve en la suya

#### Scenario: Lo que se comentó el jueves
- **WHEN** Lucía comenta el jueves 1 «Hemos dado mates de torres» al pasar lista y el martes 6 abre su grupo en
  Mis grupos
- **THEN** ve el comentario con el día y su nombre, encima de los más antiguos, y la asistencia de cada alumno

#### Scenario: El grupo que sustituye
- **WHEN** Lucía sustituye a Carlos el martes 13
- **THEN** ve el grupo de Carlos en Mis grupos, marcado «Sustitución», del martes 6 al martes 20, y no después

#### Scenario: Sus pagos
- **WHEN** Lucía abre Mis pagos con septiembre pagado y octubre en curso
- **THEN** ve octubre «En curso» y septiembre «Pagada el 30/09/2026», lo que se le debe y lo cobrado en la temporada

### Requirement: Acceso restringido
La gestión del profesorado MUST estar reservada a cuentas de administración.

#### Scenario: Profesorado o anónimo
- **WHEN** una cuenta de profesorado o alguien sin sesión intenta consultar o modificar profesores
- **THEN** el sistema lo rechaza
