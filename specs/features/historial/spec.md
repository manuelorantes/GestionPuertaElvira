# Historial

Registro de todo lo que cambia los datos del club, con quién lo hizo y cómo estaban los datos antes y después,
para poder deshacer una acción o volver a cualquier punto.
Solo superadministración puede verlo y usarlo; administración no lo ve. La cuenta de asistente puede consultarlo
(no deshacer ni volver a un punto).
Decisión de diseño: [historial de cambios con triggers](../../decisions/historial-de-cambios-con-triggers.md).

### Requirement: Registro de acciones
Todo cambio en los datos del club (desde la web o la consola) MUST quedar registrado, agrupado en acciones:
una petición de la web es una acción, firmada por quien la hace y con una etiqueta legible («Registrar cobro», «Editar profesor»…);
lo que llega desde la consola se firma como «Sistema».
Cada cambio MUST guardar lo que se tocó (tabla y clave), la operación (alta, cambio o baja) y la fila completa antes y después.
Los inicios de sesión, cierres de sesión, intentos fallidos, suplantaciones y cambios de cuentas MUST registrarse también,
pero el historial MUST mostrar solo las acciones que cambiaron datos guardados: los eventos de sesión no se listan
(sirven para la seguridad y para la última conexión de la sección Usuarios).
Las consultas (ver pantallas) no se registran.

La lista MUST poder ordenarse desde las cabeceras por fecha y hora
(por defecto, de la más reciente a la más antigua), persona, acción
o lo que afectó, en ambos sentidos.
Se ordena lo que ya está cargado:
las acciones más antiguas que trae «Ver más» se colocan en el orden elegido.

#### Scenario: Ver quién hizo qué
- **WHEN** superadministración abre el historial
- **THEN** ve las acciones de la más reciente a la más antigua con fecha y hora (de Madrid), persona, acción y lo que afectó, puede filtrar por persona y ver el detalle campo a campo (sin contraseñas)

### Requirement: Secciones del historial
Además de la lista general, el historial MUST ofrecer tres secciones que muestran solo una parte de las acciones:
«Alumnos» (las que tocaron a un alumno: sus datos, su alta o baja, sus grupos o sus datos de cobro),
«Pagos» (las que registraron o quitaron un cobro) y «Asistencia y notas» (listas de clase, faltas, asistencias
especiales, confirmaciones de clase y comentarios de clase).
Cada sección MUST filtrarse por periodo, en hora de Madrid: «Hoy» (por defecto), «Esta semana» (desde el lunes),
«Este mes» (desde el día 1) o «Todo». El periodo elegido se mantiene al pasar de una sección a otra.
La lista general MUST quedar como está: todas las acciones, filtrables por persona, sin filtro de periodo.
«Alumnos» MUST verse como la general (detalle, deshacer y volver aquí).
«Asistencia y notas» MUST mostrar una fila por clase (grupo y día; o turno de encargado y día para las
confirmaciones de actividad), con el día, la clase, quién actuó y un resumen de lo que pasó («Pasar lista ×2 ·
Comentar una clase · 2 notas»). Al abrir una clase MUST verse el cuadro de asistencia del grupo en ese mes (el mismo
de Clases, con la columna de ese día resaltada y cada nombre abriendo la ficha del alumno), después las notas que la
clase tiene ahora (alumno si es de uno, texto y autor) o «Sin notas», y al final qué se hizo ese día (fecha y hora,
persona, acción, deshacer y volver aquí; el detalle campo a campo queda en la general). En esta sección el periodo va por el día de la clase, no
por cuándo se hizo cada cosa.
«Pagos» MUST verse como los movimientos de contabilidad: un cobro por fila con fecha y hora, recibo, alumno
(enlace a su ficha), concepto, forma de pago, quién lo registró e importe, con enlace al recibo; un cobro quitado
al deshacer o volver atrás aparece con importe negativo y sin enlace. Al pie MUST verse cuántos cobros hay en el
periodo (y cuántos deshechos) y la suma de todos ellos, no solo de los cargados.
Cuando una sección no tiene nada en el periodo MUST decirlo («No hay cobros hoy»).

#### Scenario: Los cobros de hoy con su suma
- **WHEN** superadministración abre «Pagos» tras registrar hoy dos cobros de 30 € y 45 € y deshacer el segundo
- **THEN** ve «Hoy» marcado, tres filas (+30 €, +45 € y −45 € señalada como deshecha) y al pie «2 cobros (1 deshecho) hoy · Total +30 €»

#### Scenario: Cambiar de periodo y de sección
- **WHEN** en «Alumnos» elige «Esta semana» y pasa a «Asistencia y notas»
- **THEN** ve las clases desde el lunes, una por fila, con «Esta semana» marcado

#### Scenario: Abrir una clase
- **WHEN** superadministración abre «Martes 17:00 · 15/10/2026», donde Carlos pasó lista a las 19:47 y comentó a las 19:50
- **THEN** ve el cuadro de asistencia de octubre del grupo con el 15/10 resaltado, las notas de esa clase y las dos acciones con sus botones de deshacer

### Requirement: Detalle legible
El detalle de un cambio MUST entenderse sin conocer la base de datos: cada registro tocado se presenta por su nombre
(«Alta · Cobro · R-2026-0401 · Martina López Herrera», «Cambio · Cuota · Cuota de octubre 2026 · Martina López
Herrera»); los campos llevan su nombre en español; los importes van en euros, las fechas y los meses en español, las
horas como «17:00», los días por su nombre y los valores en clave traducidos («Efectivo», «Iniciación»); y lo que
apunta a otro registro (alumno, profesor, grupo, cobro, cuota, producto, turno, familia directa) MUST mostrar su
nombre con enlace a donde se ve, también si ese registro ya se borró. Los identificadores y las columnas internas
no se muestran, y en altas y bajas tampoco los campos vacíos.

La excepción son las acciones que registran o quitan un cobro:
su detalle MUST resumirse en «Cobro registrado» (o «Cobro quitado») con solo el alumno (enlace a su ficha),
el pago (importe y forma de pago) y el concepto,
sin el número de recibo, la numeración de documentos ni el resto de campos;
a la derecha MUST quedar un botón por cada sitio adonde ir (el cobro, las cuotas del mes…).

#### Scenario: Registrar un cobro
- **WHEN** superadministración abre el detalle de «Registrar cobro»
- **THEN** ve «Cobro registrado» con «Alumno: Martina López Herrera» (enlace a su ficha), «Pago: 40 € · Efectivo»
  y «Concepto: Octubre 2026», y a la derecha «Ir al cobro» e «Ir a las cuotas de octubre 2026»; no ve el recibo
  «R-2026-0401»

#### Scenario: Cambiar los datos de un alumno
- **WHEN** superadministración abre el detalle de «Editar alumno»
- **THEN** ve el cambio campo a campo, con el valor anterior tachado y el nuevo

### Requirement: Ir al elemento cambiado
En el detalle de una acción, cada cambio MUST ofrecer un botón para ir al sitio de la aplicación donde se ve lo
que tocó: el recibo del cobro, la ficha del alumno (también para sus datos de cobro e inscripciones), el grupo,
los profesores, las cuotas o los movimientos del mes, las facturas, el registro de horas, la liquidación o las
tarifas. Si el propio elemento se borró, o es una cuenta de usuario, no hay botón.

#### Scenario: Del historial al cobro
- **WHEN** superadministración abre una acción que cambió un cobro y pulsa «Ir al cobro»
- **THEN** se abre Cobros con el recibo de ese cobro

### Requirement: Deshacer una acción
Administración MUST poder deshacer una acción concreta tras confirmarlo, siempre que ninguna acción posterior haya tocado los mismos registros.

#### Scenario: Acción con consecuencias posteriores
- **WHEN** se intenta deshacer una acción cuyos registros cambió después otra
- **THEN** se rechaza indicando qué acción y quién, para deshacer antes esa o volver a este punto

### Requirement: Volver a un punto
Administración MUST poder devolver todos los datos del club al estado justo después de cualquier acción, tras confirmarlo:
se deshacen, en orden inverso, todos los cambios posteriores de todas las personas.

#### Scenario: Deshacer una vuelta atrás
- **WHEN** superadministración vuelve a un punto y después deshace esa vuelta atrás
- **THEN** los datos quedan como estaban antes de volver atrás

### Requirement: Límites
Las cuentas de usuario y los permisos se registran pero MUST NOT revertirse (evita dejar a alguien sin acceso).
Deshacer y volver atrás MUST quedar registrados como acciones de quien los hace.
Los documentos adjuntos MUST NOT borrarse físicamente, para que una vuelta atrás los recupere.
