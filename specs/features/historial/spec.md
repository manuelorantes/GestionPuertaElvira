# Historial

Registro de todo lo que cambia los datos del club, con quién lo hizo y cómo estaban los datos antes y después,
para poder deshacer una acción o volver a cualquier punto.
Solo superadministración puede verlo y usarlo; administración no lo ve.
Decisión de diseño: [historial de cambios con triggers](../../decisions/historial-de-cambios-con-triggers.md).

### Requirement: Registro de acciones
Todo cambio en los datos del club (desde la web o la consola) MUST quedar registrado, agrupado en acciones:
una petición de la web es una acción, firmada por quien la hace y con una etiqueta legible («Registrar cobro», «Editar profesor»…);
lo que llega desde la consola se firma como «Sistema».
Cada cambio MUST guardar lo que se tocó (tabla y clave), la operación (alta, cambio o baja) y la fila completa antes y después.
Los inicios de sesión, cierres de sesión, intentos fallidos y cambios de cuentas MUST registrarse también.
Las consultas (ver pantallas) no se registran.

#### Scenario: Ver quién hizo qué
- **WHEN** superadministración abre el historial
- **THEN** ve las acciones de la más reciente a la más antigua con fecha y hora (de Madrid), persona, acción y lo que afectó, puede filtrar por persona y ver el detalle campo a campo (sin contraseñas)

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
