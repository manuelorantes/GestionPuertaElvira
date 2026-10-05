# Clases

Grupos de clase del club, su horario semanal en las tres aulas (Alfil, Caballo y Peón) y su ocupación.
Solo administración puede verlos y gestionarlos.

### Requirement: Grupos
Cada grupo MUST tener nivel (iniciación, intermedio, avanzado o particular),
profesor activo, uno o más días de lunes a viernes, hora de inicio y de fin entre las 16:00 y las 21:00
en medias horas, aula (Alfil, Caballo o Peón) y plazas (1–30). El nombre (2–80 caracteres) es opcional:
sin nombre, el grupo se llama por su día, hora de inicio, nivel y aula («Lunes 17:00 · Iniciación · Peón»,
«Lunes y miércoles 18:30 · Intermedio · Alfil»), y ese nombre MUST seguir a esos datos cuando cambien.

#### Scenario: Alta de un grupo válido
- **WHEN** administración crea un grupo con todos sus datos válidos
- **THEN** el grupo aparece en el horario semanal y en la lista de grupos

#### Scenario: Grupo sin nombre
- **WHEN** administración crea o edita un grupo dejando el nombre vacío
- **THEN** el grupo se llama por su día, hora, nivel y aula, y al cambiar cualquiera de ellos el nombre cambia con ellos

#### Scenario: Horario incoherente
- **WHEN** la hora de fin no es posterior a la de inicio, o no se elige ningún día
- **THEN** el sistema no guarda el grupo e indica qué dato corregir

#### Scenario: Profesor no disponible
- **WHEN** se elige un profesor inexistente o inactivo
- **THEN** el sistema no guarda el grupo e indica que el profesor no está disponible

#### Scenario: Edición
- **WHEN** administración cambia los datos de un grupo
- **THEN** el horario y la lista reflejan los cambios

### Requirement: Sin conflictos de aula
El sistema MUST impedir dos grupos en la misma aula que coincidan en algún día y franja horaria.
Dos grupos seguidos (uno termina cuando empieza el otro) no coinciden.

#### Scenario: Conflicto de aula
- **WHEN** un grupo nuevo o editado coincide en aula, día y hora con otro
- **THEN** el sistema no lo guarda e indica con qué grupo coincide y en qué horario

#### Scenario: Misma hora en otra aula
- **WHEN** un grupo coincide en día y hora con otro, pero en otra aula
- **THEN** el sistema lo guarda

### Requirement: Modalidad por horas semanales
La modalidad de un grupo MUST derivarse de sus horas semanales (duración × número de días):
3 h o más → «3 h semanales»; 2 h o más → «2 h semanales»; 1 h y media o más → «1 h y media semanal»; menos → «1 h semanal».
Los grupos de nivel «particular» son siempre «Particular».

#### Scenario: Dos clases de hora y media
- **WHEN** un grupo de nivel no particular se reúne lunes y miércoles de 18:00 a 19:30
- **THEN** su modalidad es «3 h semanales»

### Requirement: Horario semanal
El sistema MUST mostrar, por día y aula, cada grupo en su franja de 16:00 a 21:00,
con su nombre, horas, profesor y ocupación, coloreado por nivel y con una leyenda de niveles.

#### Scenario: Consultar el horario
- **WHEN** administración abre «Clases»
- **THEN** ve el horario semanal de las tres aulas y puede abrir cualquier grupo para editarlo

### Requirement: Ocupación
La ocupación de un grupo MUST ser el número de inscripciones activas en la fecha actual frente a sus plazas.
Un grupo lleno se distingue visualmente, y uno con más alumnos que plazas se marca «Sobre el cupo».

#### Scenario: Lista de grupos
- **WHEN** administración consulta la lista de grupos
- **THEN** ve por cada grupo su nivel, profesor, horario, modalidad, aula y ocupación

### Requirement: Acceso restringido
Las operaciones de grupos MUST estar reservadas a cuentas de administración.

#### Scenario: Profesorado o anónimo
- **WHEN** una cuenta de profesorado o alguien sin sesión intenta consultar o modificar grupos
- **THEN** el sistema lo rechaza
