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
Los socios MUST tener una cuota de socio por temporada (50 € por defecto, sin descuentos salvo el especial).
Cualquier alumno que no haya pagado la cuota de socio de la temporada MUST poder pagarla desde «Registrar cobro»
(concepto «Cuota de socio»); al pagarla pasa a ser socio.
El importe de una cuota no cambia aunque después cambien las tarifas o los grupos.

#### Scenario: Estados según la fecha
- **WHEN** administración consulta las cuotas del mes
- **THEN** cada cuota aparece como «Cobrada», «En plazo» (del día 1 al 5 de su mes), «Vencida» (desde el día 6 o de meses anteriores) o «Próxima» (meses futuros)

#### Scenario: Julio y agosto
- **WHEN** administración consulta julio o agosto
- **THEN** no hay cuotas

### Requirement: Registrar un cobro
Un cobro MUST indicar el alumno, el concepto (1 mes, 3 meses, 6 meses, todo el año o cuota de socio),
la forma de pago (efectivo, datáfono o transferencia) y la fecha, y MUST mostrar el desglose antes de guardarlo.
La lista de cobros MUST mostrar los totales por forma de pago.
Un cobro de N meses MUST pagar primero las cuotas pendientes más antiguas y después los meses siguientes, sin pasar de junio.

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
- sus puntos, que se suman y restan a mano, nunca bajan de 0 y se canjean al cobrar;
- si tiene particulares, el precio por hora pactado, que MUST poder cambiarse.

Los meses a cobrar (1, 3, 6 o resto de temporada) se eligen en cada cobro; no hay forma de pago preferida.

También MUST mostrar su historial de cobros, con acceso a cada recibo.

### Requirement: Tarifas y ajustes
Administración MUST poder cambiar los tramos, la cuota de socio, los descuentos, el precio por hora de las particulares
(por defecto y por profesor) y los datos fiscales del club.
Los cambios MUST afectar solo a las cuotas y cobros nuevos.
