# Alumnos

Registro de alumnos del club: datos personales, contacto con la familia, hermanos, alta y baja,
y sus inscripciones en grupos.
Solo administración puede verlos y gestionarlos.

### Requirement: Lista de alumnos
El sistema MUST mostrar los alumnos con su nombre, edad, grupos y estado,
con búsqueda por cualquier parte del nombre (sin distinguir mayúsculas ni tildes)
y con los filtros Todos, Activos, Hermanos y De baja.

#### Scenario: Buscar sin tildes
- **WHEN** administración busca «lopez»
- **THEN** aparecen los alumnos con «López» en el nombre e indica cuántos se muestran de cuántos hay

#### Scenario: Filtrar los de baja
- **WHEN** administración elige «De baja»
- **THEN** solo aparecen los alumnos cuya baja ya ha llegado

### Requirement: Ficha del alumno
La ficha MUST mostrar:

- fecha de nacimiento y edad;
- DNI o NIE (opcional);
- email de contacto (opcional);
- tutores con su teléfono, y el teléfono propio si lo hay;
- si está federado, con su licencia;
- autorización de imagen;
- fechas de alta y de baja;
- hermanos en el club;
- todos sus grupos con horario, aula y profesor.

#### Scenario: Consultar una ficha
- **WHEN** administración abre un alumno
- **THEN** ve todos sus datos y puede llamar a sus tutores desde el teléfono

### Requirement: Alta de alumnos
Un alumno MUST darse de alta con nombre y apellidos, fecha de nacimiento y al menos un grupo.
El DNI o NIE, si se indica, MUST tener una letra de control válida.
Se pueden indicar hermanos ya inscritos.

#### Scenario: Alta en dos grupos
- **WHEN** administración da de alta a un alumno en dos grupos que no coinciden en horario
- **THEN** el alumno queda activo, inscrito en ambos, y cuenta en la ocupación de los dos

#### Scenario: Alta fallida
- **WHEN** el alta no puede completarse (por ejemplo, por un grupo completo sin confirmar)
- **THEN** no queda ningún dato del alumno guardado

### Requirement: Contacto obligatorio
Un alumno menor de edad MUST tener al menos un tutor con teléfono,
y un alumno adulto sin tutores MUST tener teléfono propio.
Como máximo hay dos tutores.

#### Scenario: Menor sin tutor
- **WHEN** se intenta guardar un alumno menor de edad sin tutor
- **THEN** el sistema no lo guarda e indica que necesita al menos un tutor con teléfono

### Requirement: Edición
Administración MUST poder modificar los datos personales de un alumno, aplicando las mismas reglas que en el alta.

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
Un alumno MAY estar en varios grupos, pero MUST NOT estar en dos que coincidan en algún día y hora,
ni dos veces en el mismo grupo.
Un alumno activo MUST conservar al menos un grupo.

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
