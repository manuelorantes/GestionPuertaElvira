# Cobros y cuotas

Cuotas mensuales del alumnado, cuota de socio, cobros con recibo, facturas bajo petición y tarifas del club.
Solo administración puede verlos y gestionarlos.
Decisión de diseño: [cuotas mensuales generadas y pago flexible](../../decisions/cuotas-mensuales-generadas-y-pago-flexible.md).

### Requirement: Cálculo de la cuota mensual
La cuota mensual MUST ser el tramo por las horas semanales de los grupos normales del alumno
más sus clases particulares:

- tramos por defecto: 3 h o más, 55 €; 2 h o más, 45 €; 1 h y media o más, 40 €; menos, 35 €;
- sin grupos normales, el tramo es 0 €;
- cada particular suma horas semanales × 4 × precio por hora;
- el precio por hora es el pactado con el alumno o, si no lo hay, el del profesor (30 €/h por defecto).

#### Scenario: Dos grupos que suman tres horas
- **WHEN** un alumno está en dos grupos de 1 h y media semanales
- **THEN** su tramo es el de 3 h o más (55 €)

#### Scenario: Particular con precio pactado
- **WHEN** un alumno tiene una particular de 1 h y media semanal con un precio pactado de 35 €/h
- **THEN** paga 210 € al mes por ella

### Requirement: Descuentos
Los descuentos en porcentaje MUST sumarse sobre el importe bruto del cobro:

- familiar (10 %), si tiene familia directa activa en el club (hermanos, padre o madre);
- pago adelantado: 3 meses o más, 10 %; 6 meses o más, 15 %; todo el año, 20 %. El año son 10 meses
  (septiembre a junio): «Todo el año» cobra todos los meses que quedan y solo se ofrece si quedan 9 o 10;
  quien tenga 8 o menos (p. ej. entra en noviembre) no puede acogerse. Cobrar 9 meses cuando quedan 10 no
  da el 20 %. Un bloque de 3 o 6 meses solo se puede cobrar si quedan al menos esos meses;
- descuento especial en porcentaje, con motivo.

Después se restan los descuentos en euros, sin bajar de 0 €:

- canje de puntos: 5 puntos descuentan un 5 % de UNA cuota mensual (la del primer mes), aunque se paguen
  varios meses; con menos de 5 no hay descuento y no se canjean de uno en uno; solo en cuotas mensuales.
  Al registrar el cobro, los 5 puntos se restan. Los puntos tendrán otros usos en el futuro;
- descuento especial en cantidad fija, con motivo.

El descuento especial MUST poder aplicarse a cualquier cobro, incluida la cuota de socio, y siempre lleva motivo.
El total MUST redondearse a céntimos, y las líneas del desglose MUST sumar exactamente el total.

#### Scenario: Familia directa que paga tres meses
- **WHEN** un alumno con familia directa y tramo de 55 € paga 3 meses
- **THEN** el bruto es 165 €, el descuento es del 20 % y el total es 132 €

#### Scenario: Puntos en un cobro de seis meses
- **WHEN** un alumno de tramo 45 € con 5 puntos paga 6 meses canjeando los 5
- **THEN** al total con el 15 % de pago adelantado se le restan 2,25 € (5 % de una cuota), y el alumno se queda con 0 puntos

#### Scenario: Entra en noviembre
- **WHEN** a un alumno le quedan 8 meses por cobrar
- **THEN** no puede acogerse a «Todo el año» ni a su 20 %; 6 meses sigue disponible con el 15 %

#### Scenario: Todo el año desde septiembre
- **WHEN** a un alumno le quedan 10 meses y elige «Todo el año»
- **THEN** se cobran los 10 meses con un 20 % («Pago de todo el año −20 %»)

### Requirement: Horas semanales
Las horas semanales de un alumno, de las que sale su tarifa, MUST ser la suma de lo que realmente hace en cada grupo:
el horario del grupo o, si tiene horario especial, solo los días y la franja a los que viene.

#### Scenario: Horario especial
- **WHEN** un alumno hace media hora en un grupo y una hora entera en otro
- **THEN** sus horas semanales son 1,5 y paga la cuota de 1 h y media

### Requirement: Cuotas del mes
Cada mes de la temporada (septiembre a junio), cada alumno activo MUST tener una cuota pendiente de ese mes,
con el importe de un mes y su descuento familiar, salvo que ya la tenga pagada por adelantado.
Las cuotas de un alumno MUST crearse al momento al darlo de alta, inscribirlo o cambiar sus datos de cobro; las del
mes nuevo, la noche del día 1, con la tarea de cada noche, que además crea cualquier cuota que falte. Consultar las
cuotas o el resumen no crea nada.
Los socios MUST tener una cuota de socio por temporada (50 € por defecto, sin descuentos salvo el especial).
Cualquier alumno que no haya pagado la cuota de socio de la temporada MUST poder pagarla desde «Registrar cobro»
(concepto «Cuota de socio»); al pagarla pasa a ser socio.
Los pedidos de [material deportivo](../material/spec.md) con precio MUST generar un cobro que sale con las cuotas del
mes en que se pidió (y de los meses siguientes mientras quede algo pendiente), con el producto como concepto, y se cobra
con el concepto «Material» de «Registrar cobro» eligiendo el pedido. Ese cobro no se cancela desde «Cuotas»: se cancela
cancelando el pedido.
Cobros y cuotas son cosas distintas (ver [cuotas separadas de los cobros](../../decisions/cuotas-separadas-de-los-cobros.md)):
el estado de cada cuota MUST salir de repartir lo que cubren todos los cobros del alumno entre sus cuotas, de la más
antigua a la más reciente. Lo que cubre un cobro es su importe en cuotas antes de descuentos. Lo que sobra es saldo a
favor y cubre las cuotas siguientes.

La pestaña «Cuotas» MUST ofrecer un botón por cada mes de la temporada (septiembre a junio) y, antes, «Cuotas de socio»,
que reúne las cuotas de socio de la temporada (las de los meses solo muestran cuotas mensuales). La cabecera «Estado» MUST
permitir ordenar (por alumno, lo pendiente primero o lo cobrado primero) y filtrar por los estados presentes.

En los meses futuros, además de las cuotas ya cobradas por adelantado, MUST mostrarse como «Prevista» la cuota
esperada de cada alumno activo ese mes que aún no la tenga (con la tarifa de hoy). Las previstas no se guardan: pasan a
ser cuotas al cobrarlas o al llegar el mes.

#### Scenario: Alta a mitad de mes
- **WHEN** administración da de alta el día 15 a una alumna en un grupo
- **THEN** su cuota de ese mes aparece al momento en «Cuotas», sin esperar a la noche

#### Scenario: Estados según la fecha
- **WHEN** administración consulta las cuotas del mes
- **THEN** cada cuota aparece como «Cobrada», «Pagada en parte» (con lo que falta), «En plazo» (del día 1 al 5 de su mes), «Vencida» (desde el día 6 o de meses anteriores) o «Próxima» (meses futuros)

### Requirement: Recálculo de cuotas
Cuando cambia lo que determina la cuota de un alumno (sus grupos o su horario especial, su familia directa, su precio
de particulares o el horario de uno de sus grupos), sus cuotas MUST recalcularse con la tarifa nueva desde el mes
siguiente o, si es del día 1 al 10, desde el mes actual, hasta junio, estén cobradas o no. Las cuotas fijadas a mano
no cambian. La diferencia queda como pendiente o como saldo a favor.

Los meses pagados por adelantado (3, 6 meses o todo el año) MUST conservar su descuento al recalcularse: la cuota
nueva es la tarifa nueva con el mismo porcentaje. En cuotas sin porcentaje apuntado (importadas) se deduce de la cuota
que tenía el alumno antes del cambio. Administración MUST poder fijar a mano el descuento de una cuota. El descuento
por pago adelantado se suma al familiar sobre la tarifa base, como al cobrar: con 40 €, un 10 % familiar y un 20 % por
todo el año, la cuota es de 28 € (no 36 € − 20 %). Cada cuota del alumno MUST mostrar sus descuentos (familia y pago
adelantado).

#### Scenario: Cambio de tarifa a mitad de un pago trimestral
- **WHEN** un alumno pagó septiembre, octubre y noviembre a 40 € con un 10 % (36 € cada mes) y el 3 de octubre pasa a 3 horas (55 €)
- **THEN** sus cuotas son 36, 49,50 y 49,50 €, noviembre queda con 27 € pendientes y un cobro de 27 € lo deja todo cobrado

### Requirement: Editar una cuota
Administración MUST poder fijar a mano el importe de una cuota con un motivo, eligiendo si afecta solo a ese mes o
a ese y a todos los siguientes de la temporada, y MUST poder devolverla al importe calculado. Los cobros y sus recibos
no cambian; el reparto se rehace solo.

#### Scenario: Un mes cobrado de más y el siguiente de menos
- **WHEN** un alumno pagó 50 € por septiembre (debían ser 25 €) y 25 € por octubre, y administración fija septiembre en 25 € y octubre en 50 €
- **THEN** las dos cuotas quedan cobradas sin tocar los recibos

### Requirement: Cancelar una cuota
Administración MUST poder cancelar, desde «Cuotas», una cuota mensual o de socio que no esté cobrada, tras confirmar
«¿Seguro que quieres cancelar…?». Si no tiene nada cobrado, se cancela entera: deja de deberse y es como si no existiera
(no sale en los meses ni en el resumen, los cobros no la cubren y la tarea de la noche no la vuelve a crear). Si está
pagada en parte, solo se cancela lo que falta: queda una cuota cobrada por lo que se pagó y lo cancelado aparte, con un
asterisco que lo explica allí donde sale la cuota. Una cuota cobrada no se cancela.
Junto a los meses, separado a la derecha, MUST haber un botón «Cuotas canceladas» con las de la temporada (alumno,
concepto, lo cancelado con su asterisco si fue en parte y el día) y la acción «Reactivar», que la vuelve a deber entera.
En la ficha del alumno, una cuota cancelada sale como «Cancelada».

#### Scenario: Cancelar una cuota sin cobrar
- **WHEN** administración cancela la cuota de octubre de Martina (45 €) y lo confirma
- **THEN** deja de salir en octubre y en lo pendiente, sale en «Cuotas canceladas» y en su ficha como «Cancelada»; al
  reactivarla, vuelve a deberse

#### Scenario: Cancelar lo que falta de una cuota pagada en parte
- **WHEN** la cuota de octubre de Martina es de 60 €, tiene 45 € cobrados y administración la cancela
- **THEN** queda como cobrada por 45 €, con un asterisco que dice que era de 60 € y se cancelaron 15 €, y esos 15 € salen
  en «Cuotas canceladas»

### Requirement: Cuotas del alumno
La tarjeta de cobros del alumno MUST mostrar sus cuotas de la temporada (mes, importe, si está fijada a mano y su
motivo, lo cubierto y lo pendiente) y su saldo a favor, con la acción de editar cada cuota.

#### Scenario: Julio y agosto
- **WHEN** administración consulta julio o agosto
- **THEN** no hay cuotas

### Requirement: Registrar un cobro
Un cobro MUST indicar el alumno, el concepto (1 mes, 3 meses, 6 meses, todo el año o cuota de socio),
la forma de pago (efectivo, datáfono o transferencia) y la fecha, y MUST mostrar el desglose antes de guardarlo.
La lista de cobros MUST mostrar los totales por forma de pago.
Un cobro de N meses MUST pagar primero las cuotas pendientes más antiguas y después los meses siguientes, sin pasar de junio.
De una cuota pagada en parte se cobra solo lo que falta.

#### Scenario: Ponerse al día y adelantar
- **WHEN** un alumno con septiembre y octubre pendientes paga 3 meses
- **THEN** quedan pagados septiembre, octubre y noviembre con un único recibo

#### Scenario: Más meses de los que quedan
- **WHEN** se intentan cobrar más meses de los que quedan de temporada
- **THEN** el cobro se rechaza indicando cuántos meses quedan

### Requirement: Corregir un cobro
Administración MUST poder corregir de un cobro ya registrado:

- la forma de pago (efectivo, datáfono o transferencia);
- la fecha, dentro de la temporada de su recibo y nunca futura;
- el importe, indicando el motivo, que queda como línea «Corrección: <motivo>» del recibo con la diferencia.

El número de recibo y los meses cobrados no cambian. El recibo y Contabilidad muestran los datos corregidos y
cada cambio queda en el historial.

#### Scenario: Anotado como transferencia y pagado en efectivo
- **WHEN** administración cambia a «Efectivo» un cobro registrado como transferencia
- **THEN** el recibo y el movimiento de Contabilidad pasan a «Efectivo» con el mismo importe

### Requirement: Recibos y facturas
Cada cobro MUST tener un recibo con número correlativo por temporada (R-2026-0001), imprimible,
con alumno, quien paga, concepto, desglose, total y forma de pago.
A petición, un cobro MUST poder tener una sola factura con número correlativo propio (F-2026-0001),
datos fiscales del club y del cliente (nombre, NIF y dirección), y el IVA del 21 % incluido en el precio y desglosado.

#### Scenario: Emitir factura
- **WHEN** administración emite la factura de un cobro de 45 €
- **THEN** la factura muestra una base imponible de 37,19 €, un IVA de 7,81 € y un total de 45 €

#### Scenario: Segunda factura
- **WHEN** se intenta emitir otra factura del mismo cobro
- **THEN** se rechaza porque ya tiene factura

### Requirement: Aviso por WhatsApp
Para una cuota vencida, administración MUST poder abrir WhatsApp con el teléfono del tutor
y un mensaje ya escrito (alumno, mes e importe). La cuota queda marcada como «Avisado».

### Requirement: Datos de cobro del alumno
La ficha del alumno MUST mostrar:

- sus horas semanales de clase y la cuota mensual que le corresponde hoy;
- si se le aplica el descuento familiar;
- si la cuota de socio de la temporada está pagada o pendiente (y su importe);
- sus puntos del mes (se gestionan en la sección Puntos; aquí solo se ven y se canjean al cobrar);
- si tiene particulares, el precio por hora pactado, que MUST poder cambiarse;
- el total de lo que mueve en el club: lo cobrado y lo pendiente de cuotas, cuota de socio y material deportivo, y la
  suma de todo.

Los meses a cobrar (1, 3, 6 o resto de temporada) se eligen en cada cobro; no hay forma de pago preferida.

También MUST mostrar su historial de cobros, con acceso a cada recibo.

### Requirement: Tarifas y ajustes
Administración MUST poder cambiar los tramos, la cuota de socio, los descuentos, el precio por hora de las particulares
(por defecto y por profesor) y los datos fiscales del club.
Los cambios MUST afectar solo a las cuotas y cobros nuevos.
