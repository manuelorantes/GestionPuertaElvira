# Alumnos

Registro de alumnos del club: datos personales, contacto con la familia, hermanos, alta y baja,
y sus inscripciones en grupos.
Solo administración puede verlos y gestionarlos.

### Requirement: Número de socio
Cada alumno MUST tener un número de socio único que se le asigna al darlo de alta, en orden creciente.
Un número MUST NOT volver a darse a otro alumno, aunque el suyo se dé de baja o se borre: la baja
conserva su número y los altas siguientes continúan la numeración.
Administración MAY repartir de otra forma los números que ya tienen unos alumnos (para cuadrar con el
listado del club), pero MUST NOT darles un número que no tenga ninguno de ellos.

#### Scenario: Alta después de una baja
- **WHEN** hay alumnos con los números 1 a 3, el 3 se da de baja y se da de alta otro
- **THEN** el 3 conserva su número y el nuevo recibe el 4

#### Scenario: Intercambio de números
- **WHEN** administración pide que el alumno 1 tenga el 2 y el alumno 2 tenga el 1
- **THEN** quedan intercambiados; pedir un número que no tiene ninguno de los indicados se rechaza

### Requirement: Lista de alumnos
El sistema MUST mostrar los alumnos con su número de socio, nombre, edad (o «edad sin indicar»), grupos y
estado, con búsqueda por cualquier parte del nombre (sin distinguir mayúsculas ni tildes) o por número de
socio, y con los filtros Todos, Activos, Hermanos, De baja y Socios sin clases.

#### Scenario: Buscar sin tildes
- **WHEN** administración busca «lopez»
- **THEN** aparecen los alumnos con «López» en el nombre e indica cuántos se muestran de cuántos hay

#### Scenario: Filtrar los de baja
- **WHEN** administración elige «De baja»
- **THEN** solo aparecen los alumnos cuya baja ya ha llegado

#### Scenario: Socios sin clases
- **WHEN** administración elige «Socios sin clases»
- **THEN** solo aparecen los alumnos activos que no están inscritos en ningún grupo

### Requirement: Ficha del alumno
La ficha MUST mostrar:

- fecha de nacimiento y edad, si constan;
- DNI o NIE (opcional);
- email de contacto;
- tutores con su teléfono (o «sin teléfono»), y el teléfono propio si lo hay;
- qué datos esperados faltan («Pendiente: …»);
- si está federado, con su licencia;
- autorización de imagen;
- fechas de alta y de baja;
- hermanos en el club;
- todos sus grupos con horario, aula y profesor.

#### Scenario: Consultar una ficha
- **WHEN** administración abre un alumno
- **THEN** ve todos sus datos y puede llamar a sus tutores desde el teléfono

### Requirement: Alta de alumnos
Para dar de alta a un alumno solo MUST ser obligatorio el nombre y apellidos; todo lo demás es opcional.
La fecha de nacimiento, si se indica, no puede ser futura ni de hace más de cien años,
y el DNI o NIE, si se indica, MUST tener una letra de control válida.
En el alta no se eligen grupos: se indican las **horas a las que va a venir** (día, hora de inicio y de fin, en
medias horas) y el sistema MUST traducirlas a grupos: el grupo que da clase a esa hora ese día, completo si
cubre todo su horario o con horario especial si solo cubre parte (o solo algunos de sus días). Si a una hora
hay clase en varias aulas, MUST pedirse el aula; si no hay clase, MUST avisarse y no se puede dar de alta
hasta corregirlo. Se pueden indicar hermanos ya inscritos. Un alumno MAY darse de alta sin ningún horario:
es un socio sin clases, queda marcado como socio (se le pedirá la cuota de socio) y se podrá inscribir más adelante.

#### Scenario: Alta en dos grupos
- **WHEN** administración da de alta a un alumno con horario lunes 17:00–18:00 (aula Alfil) y viernes 16:30–17:30
- **THEN** el alumno queda activo, inscrito en el grupo de cada tramo, y cuenta en la ocupación de los dos

#### Scenario: Alta con horario a caballo de dos grupos
- **WHEN** el horario es lunes 18:30–20:00 y hay grupos de 18:00–19:00 y 19:00–20:00 en esa aula
- **THEN** queda inscrito en el primero con horario especial 18:30–19:00 y en el segundo completo

#### Scenario: Alta fallida
- **WHEN** el alta no puede completarse (por ejemplo, por un grupo completo sin confirmar)
- **THEN** no queda ningún dato del alumno guardado

#### Scenario: Socio sin clases
- **WHEN** administración da de alta a un alumno sin elegir ningún grupo
- **THEN** el alumno queda activo, marcado como socio, aparece en «Socios sin clases» y no ocupa plaza en ningún grupo

### Requirement: Datos pendientes
Los datos que el club espera de cada alumno MUST poder faltar sin impedir el alta, y el sistema MUST
listar, en «Datos pendientes», a los alumnos activos a los que les falta alguno, agrupados por dato:
- la fecha de nacimiento;
- un tutor, si es menor de edad o no consta la edad; y el teléfono del tutor si ningún tutor lo tiene;
- el teléfono propio, si tiene 18 años o más (entonces el tutor no se espera);
- el email de contacto.
Como máximo hay dos tutores. La ficha de cada alumno MUST indicar también qué le falta.

#### Scenario: Menor sin tutor
- **WHEN** se guarda un alumno de 12 años sin tutor y sin email
- **THEN** el alumno queda guardado y aparece en «Datos pendientes» en «Sin tutor» y «Sin email»

#### Scenario: Adulto sin teléfono
- **WHEN** se guarda un alumno de 30 años sin teléfono propio
- **THEN** aparece en «Datos pendientes» en «Sin teléfono», y no se le reclama tutor

#### Scenario: Datos completos
- **WHEN** administración completa los datos que faltaban
- **THEN** el alumno desaparece de «Datos pendientes»

### Requirement: Edición
Administración MUST poder modificar los datos personales de un alumno, con las mismas reglas que en el alta.

#### Scenario: Editar datos
- **WHEN** administración corrige los datos de un alumno
- **THEN** la ficha muestra los datos nuevos

### Requirement: Baja
Un alumno MUST poder darse de baja con una fecha igual o posterior a hoy y no anterior a su alta.
Desde esa fecha deja de contar en la ocupación de todos sus grupos y aparece «De baja», sin perder su historial.

#### Scenario: Baja hoy
- **WHEN** administración da de baja a un alumno con fecha de hoy
- **THEN** el alumno aparece como «De baja» y sus grupos tienen una plaza libre más

#### Scenario: Baja programada
- **WHEN** la fecha de baja es futura
- **THEN** el alumno sigue activo y ocupando plaza hasta ese día

### Requirement: Inscripciones en grupos
Un alumno MAY estar en varios grupos, pero MUST NOT estar en dos cuyos horarios reales coincidan en algún día y hora,
ni dos veces en el mismo grupo.
Un alumno con grupos MUST conservar al menos uno (quitarle el último se impide; un socio sin clases no tiene ninguno).

### Requirement: Horario especial
Una inscripción MAY llevar un horario especial dentro del grupo: solo algunos de sus días, o solo parte de
su franja (en medias horas, dentro del horario del grupo). Por defecto el alumno va a todo el grupo.
El alumno ocupa plaza solo los días a los que viene; sus horas semanales (para la cuota) son las que
realmente hace; la ficha del alumno y la del grupo muestran «Horario especial: Lun · 18:30–19:00».
El horario especial MUST poder cambiarse o quitarse después, con las mismas comprobaciones que una inscripción.

#### Scenario: Media hora de un grupo y la hora del siguiente
- **WHEN** un alumno se inscribe en el grupo de 18:00–19:00 solo de 18:30 a 19:00 y en el de 19:00–20:00 entero
- **THEN** ocupa plaza en los dos, no hay conflicto de horario entre ambos y su cuota es la de 1 h y media semanal

#### Scenario: Solo los lunes
- **WHEN** un alumno se inscribe solo los lunes en un grupo de lunes y miércoles de hora y media
- **THEN** ocupa plaza solo el lunes y su cuota es la de 1 h y media semanal

#### Scenario: Fuera del grupo
- **WHEN** el horario especial indica un día que no es del grupo o una hora fuera de su franja
- **THEN** el sistema lo rechaza indicando el dato

#### Scenario: Añadir un grupo
- **WHEN** administración añade a un alumno un grupo que no coincide con los suyos
- **THEN** el alumno queda inscrito y la ocupación del grupo aumenta

#### Scenario: Coincidencia de horario
- **WHEN** el grupo coincide en horario con otro del alumno
- **THEN** el sistema lo impide e indica con qué grupo coincide

#### Scenario: Mover de grupo
- **WHEN** administración mueve a un alumno de un grupo a otro
- **THEN** sale del primero y entra en el segundo en una sola operación, y la ocupación de ambos se actualiza

#### Scenario: Quitar el único grupo
- **WHEN** se intenta quitar el único grupo de un alumno activo
- **THEN** el sistema lo impide y sugiere darle de baja o moverlo a otro grupo

### Requirement: Grupo completo
Inscribir o mover a un alumno a un grupo completo MUST requerir una confirmación explícita que muestre la ocupación.

#### Scenario: Confirmar la inscripción
- **WHEN** el grupo está completo y administración confirma «Inscribir igualmente»
- **THEN** el alumno queda inscrito y el grupo aparece «Sobre el cupo»

### Requirement: Hermanos
La relación de hermanos MUST ser mutua.

#### Scenario: Vincular hermanos
- **WHEN** administración indica que A es hermano de B
- **THEN** la ficha de A muestra a B y la de B muestra a A, y ambos aparecen con el filtro «Hermanos»

### Requirement: Acceso restringido
Las operaciones de alumnos MUST estar reservadas a cuentas de administración.

#### Scenario: Profesorado o anónimo
- **WHEN** una cuenta de profesorado o alguien sin sesión intenta consultar o modificar alumnos
- **THEN** el sistema lo rechaza
