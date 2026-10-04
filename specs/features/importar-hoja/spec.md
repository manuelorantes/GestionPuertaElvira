# Importar hoja de cálculo

Pasar a la aplicación la hoja de cálculo del club (una fila por alumno con lo cobrado cada mes y sus datos de contacto),
revisando fila a fila antes de guardar nada. Solo administración.

### Requirement: Lectura de la hoja
El sistema MUST aceptar el CSV exportado (coma o punto y coma) o las celdas pegadas (tabulador), con la fila de cabecera.
Reconoce por cabecera: nombre (primera columna), Cuota Anual, Chándal y polo, Federativa, Septiembre…Junio, Fecha de nacimiento,
Madre o padre, Teléfono y e-mail. Fotos, Tarjetero y banco se ignoran.
Importes con coma o punto; fechas d/m/aa o d/m/aaaa; teléfonos españoles de 9 cifras; emails válidos.
Lo que no se entiende MUST avisarse y quedar vacío. Los meses de septiembre a diciembre son de la temporada en curso y los de enero a junio del año siguiente.

### Requirement: Revisión antes de importar
Cada fila MUST casarse con el alumno de nombre igual (sin tildes ni mayúsculas) y, si no lo hay, proponer el alta con los datos de la hoja
y hasta tres alumnos parecidos. Administración decide por fila: vincular a un alumno, crear uno (corrigiendo los datos y eligiendo su grupo) u omitir.
Nada se guarda hasta aceptar.

#### Scenario: Alumno nuevo
- **WHEN** una fila no coincide con ningún alumno
- **THEN** se proponen nombre, fecha de nacimiento, tutor, teléfono y email, y no se puede importar hasta elegir un grupo (y un teléfono de tutor si es menor)

### Requirement: Qué se registra
Al importar, por cada fila aceptada:
- cada mes con importe MUST registrarse como cobro de la cuota de ese mes por ese importe exacto, con recibo, fechado el día 3 de ese mes (o hoy si no ha llegado); un mes ya cobrado no se duplica;
- «Cuota Anual» con importe MUST marcar al alumno como socio y registrar su cuota de socio por ese importe;
- «Chándal y polo» y «Federativa» con importe MUST registrarse como ingresos en Contabilidad a nombre del alumno;
- un alumno nuevo MUST darse de alta desde el primer mes con cobro (o el inicio de temporada).

#### Scenario: Todo o nada
- **WHEN** una fila falla al importar (por ejemplo, un menor sin teléfono)
- **THEN** no se guarda nada de ninguna fila y se explica el motivo

### Requirement: Historial
La importación MUST ser una sola acción del historial («Importar hoja de cálculo») firmada por quien la hace, y MUST poder deshacerse entera.
