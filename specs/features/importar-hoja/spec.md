# Importar hoja de cálculo

Pasar a la aplicación la hoja de cálculo del club (una fila por alumno con lo cobrado cada mes y sus datos de contacto),
revisando fila a fila antes de guardar nada. Solo administración.

### Requirement: Lectura de la hoja
El sistema MUST aceptar el CSV exportado (coma o punto y coma) o las celdas pegadas (tabulador), con la fila de cabecera.
Reconoce por cabecera: nombre (primera columna), Cuota Anual, Chándal y polo, Federativa, Septiembre…Junio, Fecha de nacimiento,
Madre o padre, Teléfono y e-mail, y una o varias columnas de grupo (cabecera con «Grupo» o «Clase»; dentro de una celda,
varios grupos separados por «;»). Fotos, Tarjetero y banco se ignoran.
Importes con coma o punto; fechas d/m/aa o d/m/aaaa; teléfonos españoles de 9 cifras; emails válidos.
Lo que no se entiende MUST avisarse y quedar vacío. Los meses de septiembre a diciembre son de la temporada en curso y los de enero a junio del año siguiente.

#### Scenario: Columnas de grupo
- **WHEN** una fila trae «Lunes 17:00» en una columna de grupo y «Jueves 18:30 Alfil» en otra
- **THEN** la revisión propone esos dos grupos (por nombre completo, propio o por defecto, o por palabras que lo describan: día, hora, nivel, aula; «Lun» vale por «lunes»)
- **AND** si un texto no corresponde a ningún grupo o a varios, la fila lo avisa y el grupo se elige a mano

### Requirement: Revisión antes de importar
Cada fila MUST casarse con el alumno de nombre igual (sin tildes ni mayúsculas) y, si no lo hay, proponer el alta con los datos de la hoja
y hasta tres alumnos parecidos. «Parecido» significa el mismo nombre de pila y apellidos compatibles («Francisco» o «Francisco Rodríguez»
se parecen a «Francisco Rodríguez Gil»); compartir solo el apellido no basta («Mar García» no se parece a «Rafa García»). Administración decide por fila: vincular a un alumno, crear uno (corrigiendo los datos y eligiendo uno o varios grupos, porque quien viene dos días puede ir a dos grupos de un día) u omitir,
y acepta cada fila por separado (o todas las revisadas de una vez, en orden). Nada se guarda hasta aceptar la fila.

#### Scenario: Alumno nuevo
- **WHEN** una fila no coincide con ningún alumno
- **THEN** se proponen nombre, fecha de nacimiento, tutor, teléfono, email y grupos; solo el nombre es obligatorio (lo que falte queda en «Datos pendientes» de Alumnos) y sin grupo el alumno entra como socio sin clases

### Requirement: Qué se registra
Al importar, por cada fila aceptada:
- cada mes con importe MUST registrarse como cobro de la cuota de ese mes por ese importe exacto, con recibo, fechado el día 3 de ese mes (o hoy si no ha llegado); un mes ya cobrado no se duplica;
- «Cuota Anual» con importe MUST marcar al alumno como socio y registrar su cuota de socio por ese importe;
- «Chándal y polo» y «Federativa» con importe MUST registrarse como ingresos en Contabilidad a nombre del alumno;
- un alumno nuevo MUST darse de alta desde el primer mes con cobro (o el inicio de temporada).

#### Scenario: Una fila falla
- **WHEN** una fila falla al aceptarla (por ejemplo, un menor sin teléfono)
- **THEN** no se guarda nada de esa fila, se explica el motivo en la propia fila y las demás filas no se ven afectadas

### Requirement: Posibles duplicados
Antes de crear un alumno cuyo nombre coincide con otro o se parece a uno existente, el sistema MUST avisar del posible duplicado
y ofrecer vincular la fila a ese alumno o confirmar que es otra persona. Sin esa confirmación no se crea.

#### Scenario: Nombre parecido
- **WHEN** administración acepta crear «Pablo Lopez» y existe «Pablo López Herrera»
- **THEN** se muestra el aviso con ese alumno y las opciones «Es la misma persona: vincular» y «Es otra persona: crear igualmente»

### Requirement: Historial
Cada fila importada MUST ser una acción del historial («Importar fila de la hoja: <nombre>») firmada por quien la acepta, y MUST poder deshacerse por separado.
