# Clases

Grupos de clase del club, su horario semanal en las cuatro aulas (Alfil, Caballo, Peón y Rey Batallador) y su ocupación.
Solo administración puede verlos y gestionarlos.

### Requirement: Grupos
Cada grupo MUST tener nivel (iniciación, intermedio, avanzado o particular),
profesor activo, uno o más días de lunes a viernes, hora de inicio y de fin entre las 16:00 y las 21:00
en medias horas, aula (Alfil, Caballo, Peón o Rey Batallador) y plazas (1–30). El nombre (2–80 caracteres) es opcional:
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

### Requirement: Aula compartida con confirmación
Varios grupos MAY coincidir en la misma aula, día y franja horaria, sin límite,
pero el sistema MUST pedir confirmación antes de guardar un grupo que coincida con otros.
Al editar, solo se pide confirmación por los grupos con los que el cambio hace coincidir y antes no coincidía.
Dos grupos seguidos (uno termina cuando empieza el otro) no coinciden.

#### Scenario: Coincidencia sin confirmar
- **WHEN** un grupo nuevo o editado coincide en aula, día y hora con otros y no se ha confirmado
- **THEN** el sistema no lo guarda, indica con qué grupos coincide y en qué horario, y pregunta si compartir el aula

#### Scenario: Coincidencia confirmada
- **WHEN** administración confirma que el grupo comparte el aula
- **THEN** el sistema lo guarda, aunque coincida con uno o varios grupos

#### Scenario: Edición de un grupo que ya compartía aula
- **WHEN** se edita un grupo que ya compartía aula sin hacerlo coincidir con ningún grupo nuevo
- **THEN** el sistema lo guarda sin pedir confirmación

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
Los grupos que coinciden en aula y hora se muestran uno al lado del otro, bajo una sola cabecera del aula.
En la vista de todas las aulas, un aula sin ningún grupo en todo el día no se muestra ese día,
y un día sin grupos en ninguna aula tampoco se muestra; si no hay ningún grupo, se ven de lunes a viernes vacíos.
En la vista de un aula se ven siempre los siete días, de lunes a domingo, aunque no tengan grupos.

#### Scenario: Consultar el horario
- **WHEN** administración abre «Clases»
- **THEN** ve el horario semanal de las cuatro aulas y puede abrir cualquier grupo para editarlo

#### Scenario: Aula vacía un día
- **WHEN** el lunes hay grupos en las aulas Alfil y Peón, pero ninguno en la Caballo
- **THEN** el lunes muestra solo las columnas Alfil y Peón

#### Scenario: Día sin grupos
- **WHEN** el martes no hay ningún grupo en ninguna aula
- **THEN** el martes no aparece en la vista de todas las aulas

#### Scenario: Vista de un aula
- **WHEN** administración elige un aula concreta
- **THEN** ve de lunes a domingo, con los días sin grupos vacíos

#### Scenario: Grupos que comparten aula
- **WHEN** dos grupos coinciden el lunes de 17:00 a 18:00 en el aula Alfil
- **THEN** el lunes muestra los dos grupos uno al lado del otro, bajo una sola cabecera «Alfil»

### Requirement: Ocupación
La ocupación de un grupo MUST contarse por día: cada inscripción activa ocupa plaza los días a los que
el alumno viene (todos los del grupo, salvo horario especial), aunque solo venga parte de la hora.
La ocupación del grupo es la del día más lleno; cuando difiere entre días se muestra día a día («Lun 9 · Mié 8»),
y el horario semanal muestra en cada columna la ocupación de ese día.
Un grupo lleno se distingue visualmente, y uno con más alumnos que plazas se marca «Sobre el cupo».

La lista de grupos MUST poder ordenarse desde las cabeceras por grupo (por defecto), nivel, profesor, horario, aula u
ocupación, en ambos sentidos.

#### Scenario: Lista de grupos
- **WHEN** administración consulta la lista de grupos
- **THEN** ve por cada grupo su nivel, profesor, horario, modalidad, aula y ocupación, y puede ordenarlos por cualquiera
  de esas columnas

#### Scenario: Ocupación distinta según el día
- **WHEN** en un grupo de lunes y miércoles con 12 plazas hay 9 alumnos, uno de ellos solo los lunes
- **THEN** la ocupación es 9/12 el lunes y 8/12 el miércoles, y el miércoles queda una plaza libre más

### Requirement: Acceso restringido
Crear y cambiar grupos e inscribir alumnos MUST estar reservado a cuentas de administración. El profesorado MUST poder
consultar «Clases» de solo lectura, sin ningún botón de gestión: horario semanal, grupos con su ocupación y plazas
libres por día, la hoja de cada grupo (sus alumnos, con enlace a la ficha) y la asistencia con sus comentarios, para
informar a familias y a posibles alumnos nuevos (ver [la decisión](../../decisions/profesorado-lee-datos-del-club.md)).
No ve la lista de profesores con sus tarifas.

#### Scenario: Profesorado
- **WHEN** Lucía, de profesorado, abre Clases
- **THEN** ve los grupos y sus plazas libres, pero no «Nuevo grupo», «Editar» ni «Inscribir alumno», y el sistema
  rechaza cualquier cambio que intente

#### Scenario: Anónimo
- **WHEN** alguien sin sesión intenta consultar o modificar grupos
- **THEN** el sistema lo rechaza
