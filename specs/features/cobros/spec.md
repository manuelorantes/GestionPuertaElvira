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
Los descuentos MUST sumarse en porcentaje sobre el importe bruto del cobro:

- familiar (10 %), si tiene hermanos activos;
- pago adelantado: 3 meses o más, 10 %; 6 meses o más, 15 %; 7 meses o más (resto de temporada), 20 %;
- descuento especial puntual, con porcentaje y motivo (por ejemplo, el canje de puntos).

El total MUST redondearse a céntimos, y las líneas del desglose MUST sumar exactamente el total.

#### Scenario: Hermanos que pagan tres meses
- **WHEN** un alumno con hermanos y tramo de 55 € paga 3 meses
- **THEN** el bruto es 165 €, el descuento es del 20 % y el total es 132 €

### Requirement: Cuotas del mes
Cada mes de la temporada (septiembre a junio), cada alumno activo MUST tener una cuota pendiente de ese mes,
con el importe de un mes y su descuento familiar, salvo que ya la tenga pagada por adelantado.
Los socios MUST tener una cuota de socio por temporada (50 € por defecto, sin descuentos).
El importe de una cuota no cambia aunque después cambien las tarifas o los grupos.

#### Scenario: Estados según la fecha
- **WHEN** administración consulta las cuotas del mes
- **THEN** cada cuota aparece como «Cobrada», «En plazo» (del día 1 al 5 de su mes), «Vencida» (desde el día 6 o de meses anteriores) o «Próxima» (meses futuros)

#### Scenario: Julio y agosto
- **WHEN** administración consulta julio o agosto
- **THEN** no hay cuotas

### Requirement: Registrar un cobro
Un cobro MUST indicar el alumno, el concepto (1 mes, 3 meses, 6 meses, resto de temporada o cuota de socio),
la forma de pago (efectivo o transferencia) y la fecha, y MUST mostrar el desglose antes de guardarlo.
Un cobro de N meses MUST pagar primero las cuotas pendientes más antiguas y después los meses siguientes, sin pasar de junio.
El prorrateo MUST permitirse solo al cobrar un mes, y cobra los días que quedan desde la fecha hasta fin de mes.

#### Scenario: Ponerse al día y adelantar
- **WHEN** un alumno con septiembre y octubre pendientes paga 3 meses
- **THEN** quedan pagados septiembre, octubre y noviembre con un único recibo

#### Scenario: Más meses de los que quedan
- **WHEN** se intentan cobrar más meses de los que quedan de temporada
- **THEN** el cobro se rechaza indicando cuántos meses quedan

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
La ficha del alumno MUST mostrar y permitir cambiar:

- su forma de pago preferida (solo propone el concepto al cobrar);
- si es socio;
- el precio por hora pactado de sus particulares;
- sus puntos, que se suman y restan a mano y nunca bajan de 0.

También MUST mostrar su historial de cobros, con acceso a cada recibo.

### Requirement: Tarifas y ajustes
Administración MUST poder cambiar los tramos, la cuota de socio, los descuentos, el precio por hora de las particulares
(por defecto y por profesor) y los datos fiscales del club.
Los cambios MUST afectar solo a las cuotas y cobros nuevos.
