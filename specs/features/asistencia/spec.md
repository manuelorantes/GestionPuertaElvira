# Asistencia

Las listas de clase que pasa el profesorado desde el móvil, el aviso a administración de las clases apuntadas cuya
lista no se pasó y la asistencia de cada alumno.

### Requirement: Pasar lista
Quien da una clase un día (su titular o quien le sustituye) MUST poder pasar su lista desde 15 minutos antes de que
empiece la clase (para ir marcando a quien llega) hasta el final del día siguiente. La lista son los alumnos que van
ese día (con su horario especial), sin marcar al abrirla; se marca a quien ha venido y se guarda (quien queda sin marcar,
falta). Dentro del plazo se puede corregir, y una lista ya pasada se abre con lo que se guardó. Solo se pueden marcar
ausentes alumnos de la lista de ese día. Los festivos no tienen lista. Cada lista queda en el historial.
Pasado el plazo, el profesor MUST poder ver y cambiar la lista de sus clases pasadas (en «Mis clases → Pasadas», mes a
mes y de la más reciente a la más antigua), pero al guardar MUST confirmar «¿Seguro que quieres cambiar la asistencia
de una clase pasada?». Cambiar una lista pasada no apunta horas (administración ya decidió sobre ellas en «Listas sin
pasar»).

#### Scenario: Al acabar la clase
- **WHEN** Lucía abre la lista de su clase del martes a las 18:00, marca a todos menos a Pablo y la guarda
- **THEN** la lista queda pasada con Pablo ausente y el resto presentes, y su clase sale «Lista pasada»

#### Scenario: Antes de la clase
- **WHEN** Lucía abre la lista de su clase de las 17:00 a las 16:45
- **THEN** ya puede pasarla; a las 16:44 todavía no

#### Scenario: Una lista pasada
- **WHEN** Lucía corrige el jueves la lista del martes
- **THEN** se le pide que confirme que cambia la asistencia de una clase pasada; si confirma, se guarda, y si no, no

#### Scenario: Una clase que no es suya
- **WHEN** Lucía intenta pasar la lista de una clase que ese día da otro profesor
- **THEN** el sistema lo rechaza

### Requirement: Asistencia especial
Junto a la lista de cada clase, quien la pasa MUST poder marcar, en «Asistencia especial», a alumnos de alta en el club
que no son de esa clase ese día y han venido (a recuperar o por otro motivo), buscándolos por nombre; y quitarlos. Esa
asistencia MUST salir indicada aparte, con asterisco, en la ficha del alumno (las clases de otros grupos a las que vino,
que no cuentan en su porcentaje) y en la asistencia del grupo (una fila para ese alumno en ese mes, con ✓* los días que
vino y un asterisco que explica que no es de ese grupo).
Si ese día el alumno ya estaba inscrito en esa clase (por ejemplo, porque se le inscribió después con fecha anterior),
su asistencia especial MUST contar como asistencia normal: ✓ en la asistencia del grupo, una clase más en su ficha (y en
su porcentaje), y en la lista sale entre los alumnos de la clase, marcado como que vino.

#### Scenario: Recuperar una clase
- **WHEN** Lola, del grupo de Carlos, viene el martes a la clase de Lucía y Lucía la añade en «Asistencia especial»
- **THEN** la asistencia de octubre del grupo de Lucía tiene una fila para Lola con ✓* el martes y su asterisco, y la
  ficha de Lola dice que vino ese día a esa clase, sin contar en su porcentaje

#### Scenario: Inscrito después con fecha anterior
- **WHEN** Hugo vino el viernes 2 antes de estar inscrito, Ángel le añadió en «Asistencia especial», y después se le
  inscribe en el grupo de Ángel desde el día 1
- **THEN** la asistencia del grupo muestra ✓ (sin asterisco) el día 2 y le cuenta en su porcentaje

### Requirement: Comentarios de las clases
Al pasar lista, quien da la clase MUST poder añadir, de forma opcional, comentarios sobre cada alumno de la lista y sobre
los de asistencia especial ya guardados («ha roto un reloj», «ha llegado a mitad de clase»), con un botón junto a cada
uno, y comentarios sobre la clase en sí («hoy hemos dado mates de torres»). Se puede comentar desde que se abre la lista
(15 minutos antes de la clase), también en una clase pasada sin confirmar nada (no cambia la asistencia). Cada
comentario (hasta 1000 caracteres) se guarda al momento, aparte de la lista, con el día de la clase y quién lo escribió.
En la lista se ven todos los comentarios de esa clase ese día; el profesor solo cambia o quita los suyos.
Administración MUST verlos, añadirlos (de una clase que ya se dio: día, toda la clase o un alumno, y texto), cambiarlos y
quitarlos:
- en la asistencia del grupo (pestaña «Asistencia» de Clases y hoja del grupo), en su propia tarjeta debajo de la de la
  asistencia, los del mes que se muestra: primero los de la clase (día, comentario y quién lo escribió) y debajo los de los alumnos, con un selector
  por los alumnos de la tabla (los del grupo y los que vinieron en asistencia especial; por defecto, todos);
- en la ficha del alumno, abajo del todo, en «Comentarios de las clases»: día, clase, comentario y quién lo escribió,
  del más reciente al más antiguo.
Quien lo escribió es el profesor (desde su espacio) o, si lo escribió administración, el nombre de su cuenta. Cada
cambio queda en el historial.

#### Scenario: Un comentario sobre un alumno
- **WHEN** Lucía pasa la lista del martes y pulsa «Comentar sobre Pablo Gil Ruiz», escribe «Ha roto un reloj» y lo guarda
- **THEN** el comentario queda guardado al momento, y en la ficha de Pablo sale con el martes, la clase y «Lucía Moreno Gil»

#### Scenario: Comentarios en la asistencia del grupo
- **WHEN** administración abre la asistencia de octubre del grupo de Lucía y elige a Pablo en el selector de alumnos
- **THEN** ve debajo de la tabla los comentarios de la clase del mes y, debajo, solo los de Pablo

#### Scenario: El comentario de otro
- **WHEN** Lucía intenta cambiar un comentario que escribió administración en su clase
- **THEN** el sistema lo rechaza; en la lista lo ve, pero sin «Editar» ni «Quitar»

### Requirement: Actividades del club
El encargado de una actividad del club MUST confirmarla desde su espacio en el plazo de las listas (desde 15 minutos
antes hasta el final del día siguiente):
- un **turno**, pulsando «Turno hecho»;
- la actividad de los **viernes**, marcando quién viene: le salen propuestos, sin marcar, los alumnos que vinieron algún
  viernes de ese mes o del anterior, y con un buscador añade a cualquier alumno de alta. Cada marca se guarda al momento
  y es la asistencia (y el punto) de los viernes de Puntos. La actividad queda confirmada si el encargado marca al
  menos a un alumno; las marcas que haga administración desde Puntos no la confirman.

#### Scenario: El encargado de los viernes
- **WHEN** Ángel, encargado de los viernes, abre su lista del viernes 16 y busca y marca a Pablo, que no estaba propuesto
- **THEN** Pablo gana su punto del viernes 16 y la actividad de Ángel queda confirmada

#### Scenario: Solo marca administración
- **WHEN** administración marca en Puntos a Ana el viernes 9 y Ángel no marca a nadie ese día
- **THEN** Ana gana su punto, pero la actividad de Ángel del viernes 9 sale en «Listas sin pasar»

### Requirement: Listas sin pasar
Una clase apuntada en las horas (sesión de un grupo) cuya lista no se pasó, o una actividad del club que su encargado no
confirmó, cuando acaba su plazo MUST aparecer en el
bloque «Listas sin pasar» del resumen, con fecha, clase y profesor, y en un contador junto a «Resumen» en el menú.
Solo cuentan las clases de profesores que pueden pasar lista (con una cuenta activa vinculada a su ficha), desde
el día en que se vinculó su cuenta y nunca antes del día en que se activó la asistencia. Para cada una, administración
MUST poder:
- **quitar la sesión** («No se dio»): deja de contar horas y de salir en el aviso; no se puede si la liquidación de
  ese mes ya está pagada;
- **darla por buena** («Se dio»): sigue contando y deja de salir en el aviso.
No se puede dar por buena una clase cuyo plazo para pasar lista no ha acabado.

#### Scenario: Un profesor que no pasó lista
- **WHEN** Carlos no pasa la lista de su clase del martes 13 y es viernes 16
- **THEN** administración la ve en «Listas sin pasar» y el menú muestra el contador

#### Scenario: Un profesor sin cuenta
- **WHEN** Ana no tiene cuenta de profesorado y su clase del martes no tiene lista
- **THEN** no sale en «Listas sin pasar»: no podía pasarla

#### Scenario: No se dio
- **WHEN** administración pulsa «No se dio» en esa clase y lo confirma
- **THEN** la sesión se quita de las horas de Carlos y del aviso

### Requirement: Asistencia en la ficha del alumno
La ficha de un alumno MUST mostrar su asistencia de la temporada: a cuántas clases con lista pasada vino de cuántas
(y el porcentaje) y las fechas y clases en que faltó.

#### Scenario: Una falta
- **WHEN** Pablo faltó a una de sus ocho clases con lista de la temporada
- **THEN** su ficha muestra «Vino a 7 de 8 clases (88 %)» y la falta con su fecha y clase

### Requirement: Asistencia de un grupo
Administración MUST poder ver la asistencia de un grupo en un mes, en la pestaña «Asistencia» de Clases (eligiendo
grupo y mes) y en la hoja del grupo (debajo de «Inscribir alumno», con el mes en curso y flechas para cambiarlo): una
fila por alumno que estuvo inscrito, una columna por día de clase del mes hasta hoy y el porcentaje de cada alumno.
Cada casilla dice si vino (✓), si faltó (✗), si no hay lista pasada (?) o queda vacía si ese día no le tocaba (aún no
estaba inscrito, ya no estaba o tiene horario especial). Los festivos y los días sin lista se indican en la cabecera.
El porcentaje cuenta solo las clases con lista; por debajo del 75 % sale en rojo. La tabla se ordena por nombre o por
porcentaje y el nombre lleva a la ficha del alumno.

#### Scenario: Quién falta más
- **WHEN** administración abre la asistencia de un grupo en octubre y ordena por porcentaje
- **THEN** arriba sale quien menos ha venido a las clases con lista de ese mes
