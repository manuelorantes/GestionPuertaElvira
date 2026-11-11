# Alumnos

Registro de alumnos del club: datos personales, contacto con la familia, familia directa, alta y baja,
y sus inscripciones en grupos.
Solo administración puede verlos y gestionarlos.

### Requirement: Número de socio
Cada alumno MUST tener un número de socio único que se le asigna al darlo de alta, en orden creciente
(a un socio provisional, al pasarlo a socio; ver «Socio provisional»).
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
socio, y con los filtros Activos (por defecto; incluye a la familia directa y a los socios sin clases), Socios sin clases
y De baja. La etiqueta «Familia directa» se sigue mostrando en cada alumno.
La lista MUST poder ordenarse por número de socio o alfabéticamente (por defecto), en ambos sentidos.

#### Scenario: Buscar sin tildes
- **WHEN** administración busca «lopez»
- **THEN** aparecen los alumnos con «López» en el nombre e indica cuántos se muestran de cuántos hay

#### Scenario: Filtrar los de baja
- **WHEN** administración elige «De baja»
- **THEN** solo aparecen los alumnos cuya baja ya ha llegado

#### Scenario: Socios sin clases
- **WHEN** administración elige «Socios sin clases»
- **THEN** solo aparecen los alumnos activos que no están inscritos en ningún grupo

### Requirement: Enlace a la ficha
Allí donde el panel muestre el nombre de un alumno (resumen, cuotas, cobros y recibos, movimientos, material, puntos,
clases, asistencia, comentarios, familia directa y «Mis grupos») MUST poder pulsarse para ver su ficha. Quedan fuera
los sitios donde pulsar el nombre ya hace otra cosa (pasar lista, el historial de puntos) y los avisos de confirmación.
Fuera de la sección Alumnos, la ficha MUST abrirse encima de la página en que se está, sin salir de ella: en la zona gris
de fuera hay un botón «Ir a Alumnos» que lleva a su ficha en Alumnos; pulsar en cualquier otro punto de esa zona (o
cerrarla) deja la página como estaba.

#### Scenario: Ficha sin salir del resumen
- **WHEN** administración pulsa el nombre de un alumno en «Recibos vencidos» del resumen
- **THEN** se abre su ficha encima del resumen; si pulsa fuera, se cierra y sigue en el resumen; si pulsa «Ir a
  Alumnos», pasa a la sección Alumnos con su ficha abierta

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
- familia directa en el club;
- todos sus grupos con horario, aula, profesor y desde cuándo está en cada uno;
- sus cuotas y cobros (ver la spec de cobros) y sus pedidos de material deportivo con su estado, desde donde se puede
  apuntar uno nuevo o cobrarlo (ver la spec de material);
- abajo del todo, los comentarios sobre él en sus clases (ver la spec de asistencia).

#### Scenario: Consultar una ficha
- **WHEN** administración abre un alumno
- **THEN** ve todos sus datos y puede llamar a sus tutores desde el teléfono

### Requirement: Historial de cambios del alumno
La ficha MUST mostrar a la superadministración, debajo de los comentarios de las clases, «Historial de cambios»:
cada acción que cambió algo del alumno, de la más reciente a la más antigua, con fecha y hora, quién la hizo
(«Sistema» si fue desde la consola) y, por cada registro tocado, los campos con su valor anterior y el nuevo.
Cuenta lo que no cambia en el día a día: datos personales y de contacto, familia directa, número de socio,
altas, bajas y fecha de alta, grupos (inscribir, quitar, mover, horario especial, desde cuándo)
y datos de cobro del alumno.
Cuotas, cobros, puntos, asistencia, comentarios y material no salen: tienen su propia sección.
Se muestran las 20 últimas y «Ver más» trae las anteriores.
Administración y profesorado MUST NOT verlo.

#### Scenario: Rastrear un cambio de grupo
- **WHEN** la superadministración abre la ficha de un alumno al que movieron de grupo
- **THEN** ve «Mover de grupo» con la fecha, quién lo hizo y el grupo anterior y el nuevo

### Requirement: Puntos en la ficha
La ficha MUST mostrar «Puntos»: los puntos de este mes y cada movimiento de la temporada
(fecha, tipo, motivo y puntos ganados o gastados), del más reciente al más antiguo.
La ven quienes ven la ficha (administración y profesorado).

### Requirement: Alta de alumnos
Para dar de alta a un alumno solo MUST ser obligatorio el nombre y apellidos; todo lo demás es opcional.
La fecha de nacimiento, si se indica, no puede ser futura ni de hace más de cien años,
y el DNI o NIE, si se indica, MUST tener una letra de control válida.
En el alta no se eligen grupos: se indican las **horas a las que va a venir** (día, hora de inicio y de fin, en
medias horas) y el sistema MUST traducirlas a grupos: el grupo que da clase a esa hora ese día, completo si
cubre todo su horario o con horario especial si solo cubre parte (o solo algunos de sus días). Si a una hora
hay varios grupos posibles (en varias aulas o compartiendo aula), MUST pedirse el grupo; si no hay clase, MUST avisarse y no se puede dar de alta
hasta corregirlo. Se puede indicar familia directa ya inscrita. Un alumno MAY darse de alta sin ningún horario:
es un socio sin clases, queda marcado como socio (se le pedirá la cuota de socio) y se podrá inscribir más adelante.
La fecha de alta MUST poder elegirse (por defecto hoy, nunca futura): sus grupos empiezan ese día.
Si es del día 16 en adelante del mes en curso y tiene horario, el alta MUST preguntar qué paga de ese mes
(ver [cuota del mes de un alta tardía](../cobros/spec.md)).
Mientras se escribe el nombre de un alumno nuevo, el sistema MUST avisar de los alumnos que coinciden en **nombre y
primer apellido** (todas las palabras menos la última, o las dos si solo hay dos; sin tildes ni mayúsculas), con su
número de socio, edad y grupos: primero los de baja, con la fecha de la baja y «Es este: darle de alta de nuevo», que
cierra el alta y abre su ficha con «Dar de alta de nuevo» (ver «Volver a darse de alta»); después los de alta, con
«Ver ficha». Es solo un aviso: si es otra persona, el alta sigue igual.

#### Scenario: Alta en dos grupos
- **WHEN** administración da de alta a un alumno con horario lunes 17:00–18:00 (aula Alfil) y viernes 16:30–17:30
- **THEN** el alumno queda activo, inscrito en el grupo de cada tramo, y cuenta en la ocupación de los dos

#### Scenario: Alta con horario a caballo de dos grupos
- **WHEN** el horario es lunes 18:30–20:00 y hay grupos de 18:00–19:00 y 19:00–20:00 en esa aula
- **THEN** queda inscrito en el primero con horario especial 18:30–19:00 y en el segundo completo

#### Scenario: Alta fallida
- **WHEN** el alta no puede completarse (por ejemplo, por un grupo completo sin confirmar)
- **THEN** no queda ningún dato del alumno guardado

#### Scenario: Ya estuvo en el club
- **WHEN** administración escribe «Pablo Gil Ruiz» en un alta nueva y hay un Pablo Gil Ruiz de baja desde junio
- **THEN** le sugiere que es ese alumno; si pulsa «Es este: darle de alta de nuevo», se abre su ficha para darle de alta
  de nuevo con su número de socio e historial

#### Scenario: Otra persona con nombre parecido
- **WHEN** administración escribe «Pablo Gil Ruiz» y hay un Pablo Gil Martín de alta
- **THEN** le avisa de que ya hay un alumno de alta con un nombre parecido, y puede dar de alta al nuevo igualmente

#### Scenario: Toda alta es socia
- **WHEN** administración da de alta a un alumno en un grupo
- **THEN** queda marcado como socio y se le crea la cuota de socio de la temporada, además de su cuota mensual

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

### Requirement: Socio provisional
Administración MUST poder dar de alta a alguien como **socio provisional**:
ha pagado la cuota de socio (o la va a pagar),
pero el club todavía no tiene su hoja de inscripción para darlo de alta del todo.
En el alta, la opción «Socio provisional» MUST ofrecerse junto a la de socio con clases o sin clases.
Como en cualquier alta, solo el nombre es obligatorio;
un socio provisional MUST NOT tener grupos ni familia directa.

Un socio provisional:
- MUST NOT tener número de socio: se le da al pasarlo a socio, el siguiente de la numeración;
- es socio a efectos de cobros: su cuota de socio se cobra como la de cualquiera
  y lo cobrado entra en la contabilidad como siempre;
- MUST NOT aparecer en la lista de alumnos (en ningún filtro), en «Datos pendientes», en el recuento de alumnos
  ni en las listas de asistencia y de puntos;
- MUST NOT poder inscribirse en grupos, vincularse como familia directa, darse de baja ni volver a darse de alta
  mientras sea provisional.

Si hay socios provisionales, Alumnos MUST mostrar un aviso con cuántos hay
(«1 socio provisional por completar», «N socios provisionales por completar»)
que lleva a «Socios provisionales»: la lista de todos ellos, con su nombre y su fecha de alta,
desde la que se abre la ficha de cada uno.
En su ficha MUST poder editarse sus datos y MUST haber una acción «Pasar a socio»,
con confirmación, que no exige ningún dato: lo decide administración (cuando tiene la hoja rellena).
Al pasarlo a socio, recibe el siguiente número de socio, conserva su fecha de alta y su historial de cobros,
y desde entonces es un alumno como los demás (aparece en la lista, en «Datos pendientes» si le falta algo,
y ya se puede inscribir en grupos).

#### Scenario: Cuota cobrada sin hoja de inscripción
- **WHEN** administración da de alta a «Álvaro Tejero Gilabert» como socio provisional y le cobra la cuota de socio
- **THEN** el cobro aparece en la contabilidad, Álvaro no sale en la lista de alumnos ni tiene número de socio,
  y Alumnos avisa de «1 socio provisional por completar»

#### Scenario: Pasar a socio
- **WHEN** el último número de socio dado es el 120 y administración pasa a socio a un socio provisional
- **THEN** recibe el número 121, aparece en la lista de alumnos y desaparece de «Socios provisionales»

#### Scenario: Sin grupos mientras es provisional
- **WHEN** administración intenta inscribir en un grupo a un socio provisional
- **THEN** se rechaza con el aviso de que primero hay que pasarlo a socio

### Requirement: Edición
Administración MUST poder modificar los datos personales de un alumno, con las mismas reglas que en el alta, y su última
alta en el club mientras está de alta: nunca futura, antes de su baja anterior ni desde su última baja. Los grupos que
empezaban el mismo día que el alta se mueven con ella; si otro de sus grupos empieza antes de la fecha nueva, se rechaza
(hay que cambiar antes su «En el grupo desde»).
Si la fecha nueva es de un mes posterior, sus cuotas de los meses anteriores se borran y sus cobros pasan a los
meses siguientes (ver [cuota del mes de un alta tardía](../cobros/spec.md)).

#### Scenario: Editar datos
- **WHEN** administración corrige los datos de un alumno
- **THEN** la ficha muestra los datos nuevos

### Requirement: Baja
Un alumno MUST poder darse de baja con una fecha igual o posterior a hoy y no anterior a su alta.
Desde esa fecha deja de contar en la ocupación de todos sus grupos y aparece «De baja», sin perder su historial.
El diálogo de baja MUST ofrecer cancelar sus cuotas pendientes (ver «Cancelar una cuota» en la spec de cobros): las
lista, con las de los meses posteriores a la baja ya marcadas, y se puede marcar o desmarcar cada una.
Al darse de baja, el alumno MUST dejar de ser familia directa de quien lo era. Si alguno se queda sin ningún familiar
directo de alta en el club, el diálogo de baja MUST avisar antes de confirmar de que ese alumno pierde el descuento
familiar; al confirmar, sus cuotas MUST recalcularse sin descuento desde el mes siguiente a la baja (lo ya cobrado no
cambia y el mes de la baja se queda como estaba).

#### Scenario: Baja hoy
- **WHEN** administración da de baja a un alumno con fecha de hoy
- **THEN** el alumno aparece como «De baja» y sus grupos tienen una plaza libre más

#### Scenario: Su hermana se queda sin familia directa
- **WHEN** administración da de baja a Pablo el 10 de octubre y Lola, su única familia directa en el club, tenía pagados
  octubre, noviembre y diciembre con descuento familiar
- **THEN** el diálogo avisa de que Lola pierde el descuento familiar; al confirmar, Lola ya no tiene familia directa,
  octubre se queda igual y noviembre y diciembre pasan a la cuota sin descuento (lo que falte, pendiente)

#### Scenario: Volver a darse de alta
- **WHEN** Martina, de baja desde el 2 de octubre, vuelve el 15 de noviembre y administración pulsa «Dar de alta de
  nuevo», elige ese día y su grupo
- **THEN** vuelve a estar activa, con el mismo número de socio, en su grupo desde el 15 de noviembre; su ficha muestra
  «Última alta en el club» 15/11, «Última baja en el club» 02/10 y, en «Altas y bajas», los dos periodos

#### Scenario: Baja programada
- **WHEN** la fecha de baja es futura
- **THEN** el alumno sigue activo y ocupando plaza hasta ese día

### Requirement: Certificado de matrícula
Administración MUST poder emitir desde la ficha de un alumno de alta («Emitir certificado», junto a «Editar») un
certificado de matrícula listo para imprimir, como papel oficial del club: arriba el logo, el nombre, el NIF y la
dirección del club, sin sello.
El certificado MUST decir que el alumno, con su DNI o NIE, tiene matrícula en el club para el curso, en su horario de
clase, y desde qué día pertenece al club (su última alta), con el lugar y la fecha, y quién lo firma con su cargo.
Al abrirlo se MUST proponer: su DNI o NIE de la ficha, el curso de hoy con los dos años completos («2026/2027»), el
horario de sus grupos de hoy (su horario especial si lo tiene, p. ej. «los viernes de 17:00 a 18:30 horas»), Granada,
hoy y el firmante por defecto; todo se puede cambiar antes de emitirlo.
Sin DNI o NIE no se MUST emitir; si no consta en la ficha (o se corrige), el que se escribe MUST guardarse también en
ella.
Se MUST poder elegir si sale con la firma escaneada o con el hueco para firmarlo a mano; la firma escaneada MUST usarse
solo con el firmante por defecto y si se ha subido; con cualquier otro firmante, se firma a mano.
Cada certificado emitido MUST quedar registrado tal como se emitió (aunque luego cambie la ficha): la ficha MUST
mostrar «Certificados emitidos», del último al primero, con el curso, la fecha, quién firma, si lleva la firma
escaneada y quién lo emitió, y cada uno se MUST poder volver a abrir para imprimirlo.

#### Scenario: Certificado de un alumno sin DNI en la ficha
- **WHEN** administración emite el certificado de Santiago, que va los viernes de 17:00 a 18:30, escribe su DNI
  13468404H y deja el firmante por defecto con la firma escaneada
- **THEN** sale «Manuel Orantes Taboada, Presidente del Club Ajedrez Puerta Elvira, CERTIFICA: Que Santiago Fernández
  Hernández, con DNI 13468404H, tiene matrícula en el Club Ajedrez Puerta Elvira para el curso 2026/2027, en horario de
  clase los viernes de 17:00 a 18:30 horas, y pertenece al club desde el …», «En Granada, a 11 de noviembre de 2026.»
  y la firma; su ficha pasa a tener ese DNI y el certificado aparece en «Certificados emitidos»

#### Scenario: Firma otra persona
- **WHEN** al emitirlo se cambia el firmante por «Lucía Moreno Gil, Secretaria»
- **THEN** no se puede elegir la firma escaneada y el certificado sale con el hueco para firmarlo a mano

### Requirement: Firmante de los certificados
Administración MUST poder cambiar en «Tarifas y ajustes» de Cobros el firmante por defecto de los certificados (nombre
y cargo; al principio, Manuel Orantes Taboada, Presidente) y subir, cambiar o quitar su firma escaneada (PNG o JPEG de
hasta 2 MB), que solo ve quien gestiona el club. La firma es de esa persona: al guardar a otra persona como firmante
por defecto, la firma escaneada MUST quitarse (avisando antes).

#### Scenario: Cambiar el firmante por defecto
- **WHEN** administración cambia el firmante por defecto de Manuel Orantes Taboada a Lucía Moreno Gil
- **THEN** se avisa de que la firma escaneada se quita, y desde entonces los certificados salen para firmar a mano
  hasta que se suba la de Lucía

### Requirement: Volver a darse de alta
Un alumno de baja (con su baja ya llegada) MUST poder volver a darse de alta, tantas veces como haga falta, con
«Dar de alta de nuevo» en su ficha: fecha de alta (por defecto hoy, nunca futura ni anterior a su última baja) y los
grupos en los que entra desde ese día; sin grupos, vuelve como socio sin clases. Con grupos y fecha del día 16 en
adelante del mes en curso, MUST preguntar qué paga de ese mes, como en el alta. Conserva su número de socio, su familia
y todo su historial. Cada periodo de alta MUST quedar guardado: mientras está de baja no está en ningún grupo (sus grupos
terminan con la baja), no sale en las listas ni se le crean cuotas de los meses en que no estuvo de alta ningún día; y
todo lo que depende de si estaba de alta un día (cuotas, puntos, listas) MUST tener en cuenta todos sus periodos. Si se
ha dado de alta más de una vez, la ficha MUST mostrar «Última alta en el club» y «Última baja en el club» en vez de
«Alta en el club» y «Baja», y debajo «Altas y bajas» con cada periodo, del más reciente al más antiguo.

### Requirement: Inscripciones en grupos
Un alumno MAY estar en varios grupos, pero MUST NOT estar en dos cuyos horarios reales coincidan en algún día y hora,
ni dos veces en el mismo grupo.
Un alumno MUST poder dejar cualquiera de sus grupos, también el último: sigue de alta, como socio sin clases.
Quitarle de un grupo desde la ficha MUST pedir confirmación antes.
En la ficha, el nombre de cada grupo MUST ser un enlace que abre ese grupo en Clases.
Cada inscripción tiene la fecha desde la que el alumno está en el grupo, que es la que cuenta para sus listas y sus
cuotas. Al añadir un grupo MUST poder elegirse «Desde» (por defecto hoy), y la ficha MUST mostrar «En el grupo desde» en
cada grupo y permitir corregirla (por ejemplo, si venía antes de que se le inscribiera). Esa fecha nunca puede ser futura,
anterior a su alta en el club ni pisar otra inscripción suya en el mismo grupo.

#### Scenario: Venía antes de inscribirle
- **WHEN** Hugo, de alta desde el 1 de octubre, se inscribió el día 7 en el grupo de los viernes y administración cambia
  «En el grupo desde» al 1 de octubre
- **THEN** sale en la lista del viernes 2 y su asistencia de ese día cuenta como de su grupo

### Requirement: Horario especial
Una inscripción MAY llevar un horario especial dentro del grupo: solo algunos de sus días, o solo parte de
su franja (en medias horas, dentro del horario del grupo). Por defecto el alumno va a todo el grupo.
El alumno ocupa plaza solo los días a los que viene; sus horas semanales (para la cuota) son las que
realmente hace; la ficha del alumno y la del grupo muestran «Horario especial: Lun · 18:30–19:00».
En el alta, el horario especial sale de las horas indicadas y además MUST poder ajustarse a mano en cada grupo
(mismo diálogo que en la ficha), antes de guardar.
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
- **WHEN** administración quita el único grupo de un alumno activo y lo confirma
- **THEN** sale del grupo, sigue de alta como socio sin clases (aparece en «Socios sin clases») y no se le dan de baja
  ni se le cancelan las cuotas ya emitidas

### Requirement: Grupo completo
Inscribir o mover a un alumno a un grupo completo MUST requerir una confirmación explícita que muestre la ocupación.

#### Scenario: Confirmar la inscripción
- **WHEN** el grupo está completo y administración confirma «Inscribir igualmente»
- **THEN** el alumno queda inscrito y el grupo aparece «Sobre el cupo»

### Requirement: Familia directa
La familia directa son hermanos, padres y madres que están en el club; da derecho al descuento familiar.
La familia es un grupo: la relación MUST ser mutua y transitiva. Vincular a dos alumnos MUST unir sus familias (cada
uno queda vinculado con todos los familiares del otro), y quitar a un familiar desde la ficha de un alumno MUST sacarlo
de toda la familia de ese alumno, tras confirmarlo.

#### Scenario: Vincular familia directa
- **WHEN** administración indica que A es familia directa de B (por ejemplo, su madre o su hermano)
- **THEN** la ficha de A muestra a B y la de B muestra a A, y ambos aparecen con el filtro «Familia directa»

#### Scenario: Tres en la familia
- **WHEN** A y B son familia directa y administración vincula a C con B
- **THEN** C queda vinculado también con A, y las fichas de los tres muestran a los otros dos

#### Scenario: Quitar a uno de la familia
- **WHEN** A, B y C son familia directa y administración quita a C desde la ficha de A y lo confirma
- **THEN** C deja de ser familia directa de A y de B, que siguen siéndolo entre ellos

#### Scenario: Se arrepiente de quitar a un familiar
- **WHEN** administración pulsa quitar a C de la familia de A y cancela la confirmación
- **THEN** la familia sigue igual

### Requirement: Acceso restringido
Dar de alta, cambiar, inscribir, dar de baja, cobrar o apuntar pedidos MUST estar reservado a cuentas de
administración. El profesorado MUST poder consultar «Alumnos» de solo lectura: la lista y la ficha completa de cualquier
alumno (datos personales y de contacto, familia, cuotas y cobros con sus recibos, material, asistencia y comentarios),
sin ningún botón de gestión ni «Datos pendientes» (ver
[la decisión](../../decisions/profesorado-lee-datos-del-club.md)).

#### Scenario: Profesorado
- **WHEN** Lucía, de profesorado, abre la ficha de Martina, que no es alumna suya
- **THEN** ve su DNI, los teléfonos de su familia y si tiene cuotas pendientes, pero no «Editar», «Dar de baja»,
  «Registrar cobro» ni «Apuntar pedido», y el sistema rechaza cualquier cambio que intente

#### Scenario: Anónimo
- **WHEN** alguien sin sesión intenta consultar o modificar alumnos
- **THEN** el sistema lo rechaza
