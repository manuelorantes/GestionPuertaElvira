# Asistencia

Las listas de clase que pasa el profesorado desde el móvil, el aviso a administración de las clases apuntadas cuya
lista no se pasó y la asistencia de cada alumno.

### Requirement: Pasar lista
Quien da una clase un día (su titular o quien le sustituye) MUST poder pasar su lista desde 15 minutos antes de que
empiece la clase (para ir marcando a quien llega) hasta el final del día siguiente. La lista son los alumnos que van
ese día (con su horario especial), sin marcar al abrirla; se marca a quien ha venido y se guarda (quien queda sin marcar,
falta). Dentro del plazo se puede corregir, y una lista ya pasada se abre con lo que se guardó. Solo se pueden marcar
ausentes alumnos de la lista de ese día. Los turnos (encargado del club) y los festivos no tienen lista. Cada lista queda en el
historial.

#### Scenario: Al acabar la clase
- **WHEN** Lucía abre la lista de su clase del martes a las 18:00, marca a todos menos a Pablo y la guarda
- **THEN** la lista queda pasada con Pablo ausente y el resto presentes, y su clase sale «Lista pasada»

#### Scenario: Antes de la clase
- **WHEN** Lucía abre la lista de su clase de las 17:00 a las 16:45
- **THEN** ya puede pasarla; a las 16:44 todavía no

#### Scenario: Fuera de plazo
- **WHEN** Lucía intenta corregir el jueves la lista del martes
- **THEN** el sistema se lo impide: el plazo acabó al final del miércoles

#### Scenario: Una clase que no es suya
- **WHEN** Lucía intenta pasar la lista de una clase que ese día da otro profesor
- **THEN** el sistema lo rechaza

### Requirement: Listas sin pasar
Una clase apuntada en las horas (sesión de un grupo) cuya lista no se pasó cuando acaba su plazo MUST aparecer en el
bloque «Listas sin pasar» del resumen, con fecha, clase y profesor, y en un contador junto a «Resumen» en el menú.
Solo cuentan las clases de profesores que pueden pasar lista (con su cuenta de profesorado activa y vinculada), desde
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
