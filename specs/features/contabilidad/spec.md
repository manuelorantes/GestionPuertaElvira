# Contabilidad

Tesorería del club: movimientos de cada mes, facturas de proveedores con su documento, resultado mes a mes del ejercicio y cierre de temporada.
Solo administración puede verla y gestionarla.
Decisión de diseño: [facturas con adjunto en almacenamiento de documentos](../../decisions/facturas-con-adjunto-en-almacenamiento-de-documentos.md).

### Requirement: Ejercicio contable
El ejercicio MUST ir de septiembre a agosto. Su acumulado MUST empezar en el saldo arrastrado de los ejercicios anteriores cerrados.

### Requirement: Saldos del club, del banco y de caja
Debajo del título de Contabilidad, en todas sus pestañas, el sistema MUST mostrar tres cifras:
el saldo del club (el mismo del resumen: lo arrastrado más lo acumulado del ejercicio hasta el mes en curso),
el saldo en el banco y el saldo en caja.
Cada movimiento del libro MUST contar en el banco si su forma de pago es transferencia o tarjeta,
y en caja si es efectivo.
El saldo arrastrado de un ejercicio cerrado MUST repartirse igual:
el cierre guarda lo que el ejercicio movió en caja y el resto es del banco.
El saldo del club MUST ser siempre la suma del banco y la caja.

#### Scenario: Dónde está el dinero
- **WHEN** en el ejercicio han entrado 600 € por transferencia y 80 € en efectivo
- **THEN** el saldo del club es «680 €», el del banco «600 €» y el de caja «80 €»

### Requirement: Traspasos entre caja y banco
Administración MUST poder anotar traspasos de dinero de caja al banco o del banco a caja,
con fecha, importe mayor que cero y una nota opcional, y quitarlos.
Un traspaso MUST mover el importe de un saldo al otro sin cambiar el saldo del club,
y no MUST salir entre los movimientos del mes ni en los totales de ingresos y gastos.
Los traspasos MUST verse en la pestaña «Traspasos», ordenables desde las cabeceras por fecha
(por defecto, del más reciente al más antiguo), traspaso, nota o importe, en ambos sentidos.
No se pueden anotar ni quitar traspasos con fecha de una temporada cerrada.

#### Scenario: Ingresar el efectivo en el banco
- **WHEN** con 600 € en el banco y 80 € en caja, administración traspasa 50 € de caja al banco
- **THEN** el banco pasa a «650 €», la caja a «30 €» y el saldo del club sigue en «680 €»

#### Scenario: Quitar un traspaso
- **WHEN** administración quita ese traspaso y confirma
- **THEN** el dinero vuelve a donde estaba: «600 €» en el banco y «80 €» en caja

### Requirement: Movimientos del mes
El sistema MUST mostrar los movimientos del mes, del más reciente al más antiguo, con fecha, concepto, categoría, forma de pago e importe,
y los totales de ingresos, gastos y resultado. Los movimientos MUST salir de:

- los cobros de Cobros (ingresos «Cuotas», «Cuota de socio» o «Venta de material»);
- las liquidaciones pagadas al profesorado (gasto «Profesores», en la fecha de pago);
- las facturas de proveedores pagadas (gasto de su categoría, en la fecha de pago);
- los apuntes manuales.

En los movimientos de un cobro, el nombre del alumno MUST llevar a su ficha.

Los movimientos MUST poder filtrarse por tipo: «Todo» (por defecto), «Ingresos» o «Pagos». Con «Ingresos»
MUST poder elegirse además la forma de pago: «Todos» (por defecto), «Tarjeta», «Transferencia» o
«Efectivo». Con un filtro activo se indica cuántos movimientos se ven y su suma. El filtro se conserva en la
dirección de la página.

Los movimientos MUST poder ordenarse desde las cabeceras por fecha
(por defecto, del más reciente al más antiguo), concepto, categoría,
forma de pago o importe (con su signo), en ambos sentidos;
el orden elegido se mantiene al cambiar el filtro.

#### Scenario: Ingresos en efectivo
- **WHEN** administración elige «Ingresos» y luego «Efectivo»
- **THEN** solo ve los ingresos cobrados en efectivo de ese mes, con su número y su suma

#### Scenario: Sin teclear dos veces
- **WHEN** administración registra un cobro de cuota o paga una liquidación
- **THEN** aparece como movimiento del mes sin anotarlo en Contabilidad

### Requirement: Ir a un movimiento o a una factura
Un enlace a un movimiento concreto MUST abrir Contabilidad en el mes de ese movimiento,
con el filtro de su tipo («Ingresos» o «Pagos»),
desplazar la vista hasta su fila y resaltarla con un fondo algo más oscuro durante tres segundos.
Un enlace a una factura MUST hacer lo mismo en «Facturas».
Si el movimiento ya no existe, el sistema MUST avisarlo y mostrar el mes actual.
El enlace «Ir a Facturas» de un movimiento que viene de una factura MUST llevar a esa factura.

#### Scenario: Desde un hallazgo del diagnóstico
- **WHEN** administración pulsa el nombre de un apunte en un hallazgo
- **THEN** ve el mes de ese apunte, filtrado por su tipo, con su fila resaltada tres segundos

#### Scenario: El apunte se quitó
- **WHEN** administración sigue un enlace a un apunte que ya no existe
- **THEN** ve el aviso «Ese movimiento ya no existe.» sobre los movimientos del mes actual

### Requirement: Apuntes manuales
Administración MUST poder anotar ingresos o gastos con fecha, concepto, categoría de su tipo, forma de pago (efectivo, transferencia o tarjeta)
e importe mayor que cero, y quitarlos.

### Requirement: Editar movimientos
Cada movimiento del libro MUST tener un botón de editar (lápiz) junto a los demás, para cambiar su concepto, categoría
(de su mismo tipo), forma de pago, importe y meses a los que corresponde. Antes de guardar MUST pedirse confirmación con la
lista de lo que cambia («Importe: 45 € → 40 €»). No se pueden editar los de una temporada cerrada.

- En apuntes manuales y facturas se cambia el apunte o la factura.
- En cobros, liquidaciones y anticipos se corrige solo cómo salen en contabilidad (el libro, sus totales y las gráficas
  del resumen): el recibo, las cuotas del alumno y la nómina del profesor no cambian, y el movimiento queda marcado como
  «Corregido en contabilidad». La confirmación MUST avisar de ello. La forma de pago de un cobro es la excepción: cambia
  también en el cobro y en su recibo.

#### Scenario: Corregir un cobro en contabilidad
- **WHEN** administración edita un cobro de 45 € en efectivo y lo deja en 40 € por transferencia, y confirma
- **THEN** el libro muestra 40 € por transferencia y «Corregido en contabilidad»; el recibo sigue siendo de 45 €, ahora
  por transferencia, y las cuotas del alumno no cambian

### Requirement: Meses a los que corresponde
Una cosa es cuándo se paga un movimiento (su fecha) y otra a qué meses corresponde.
Cada apunte y cada factura MUST corresponder a uno o varios meses (la luz de septiembre pagada en octubre corresponde a
septiembre; el IVA de octubre a diciembre, pagado en enero, a esos tres meses).
Al anotarlos se puede elegir en «Mes al que corresponde»: por defecto, el mes de su fecha (la de la factura, en las
facturas); otro mes; o «Varios meses…», que reparte el importe a partes iguales entre los meses elegidos (los
céntimos que sobran, a los primeros) y deja escribir a mano lo que va a cada mes.
Un reparto MUST sumar el importe, sin meses repetidos y con más de 0 € en cada mes; si no, no se guarda y se explica
(«El reparto suma 250 € y el importe es 300 €.»).
Los meses MUST estar a menos de un año de la fecha del movimiento y no MAY ser de una temporada cerrada.
En los demás movimientos, lo que corresponde a cada mes MUST ser: en las liquidaciones y anticipos, su mes; en los
cobros de cuotas, el importe a partes iguales entre los meses que pagan; en los demás cobros, el mes del cobro.
Editar un movimiento MUST permitir cambiar también su reparto.
Los movimientos que no corresponden solo al mes de su fecha MUST indicarlo («Corresponde a septiembre 2026»,
«Corresponde a octubre, noviembre y diciembre 2026»).

#### Scenario: Luz pagada al mes siguiente
- **WHEN** administración anota el 3 de octubre la luz y elige «Septiembre 2026» como mes al que corresponde
- **THEN** el movimiento sale en octubre con «Corresponde a septiembre 2026», y en el resumen cuenta como gasto de
  septiembre en «Cuotas vs gastos fijos»

#### Scenario: IVA trimestral
- **WHEN** administración anota el 20 de enero de 2027 el IVA, 300 €, y elige «Varios meses…» con octubre, noviembre
  y diciembre de 2026
- **THEN** el movimiento sale en enero con «Corresponde a octubre, noviembre y diciembre 2026» y en «Mes a mes» suma
  100 € a los gastos de cada uno de esos meses; el saldo de enero baja 300 €

### Requirement: Categorías del club
En «Ajustes», administración MUST poder añadir categorías propias de ingresos o de gastos, renombrarlas y quitarlas
mientras ningún movimiento las use. Las de serie no se renombran ni se quitan. No MAY haber dos categorías con el mismo
nombre dentro de los ingresos ni dentro de los gastos. Las del club salen en los desplegables de apuntes y facturas y
se pueden marcar como «del mes».

#### Scenario: Categoría con movimientos
- **WHEN** administración intenta quitar la categoría «Seguro», que ya usa un apunte
- **THEN** no se quita y se explica que tiene movimientos

### Requirement: Gastos esperados
En «Ajustes», administración MUST poder definir los **gastos esperados** del club:
lo que paga cada mes (alquiler, limpieza, presidencia…) con su concepto, una categoría de gasto, lo que suele costar
y en qué meses del año se espera (por defecto, de septiembre a junio).
Se espera desde el mes en que se añade.
No MAY ser de la categoría Profesores: lo del profesorado ya se prevé con su horario.
La tabla se ordena desde sus cabeceras (Concepto, Categoría, Importe, Meses),
y cada gasto esperado se edita o se quita; quitarlo no quita los apuntes con que se pagó.

En Movimientos, junto a «Gastos de <mes>», la tarjeta **«Gastos esperados de <mes>»** MUST mostrar los del mes,
cada uno en uno de tres estados, y abajo lo que falta por pagar:
- **pendiente**, con «Pagar» y «No hay este mes»;
- **pagado**, con lo que costó, la fecha y, si no coincide, lo que se esperaba;
- **«No hay este mes»**, con «Volver a esperarlo».

«Pagar» abre un diálogo con el importe pagado (por defecto, lo esperado), la fecha (hoy), la forma de pago
y los [meses a los que corresponde](#requirement-meses-a-los-que-corresponde) (por defecto, el del gasto esperado,
aunque se pague otro mes).
Al pagar se anota un apunte manual de gasto con su concepto y su categoría, y ese mes queda pagado.
Para cambiar lo pagado se edita el apunte; si se quita, el mes vuelve a estar pendiente.
No MAY pagarse ni saltarse un mes de una temporada cerrada.

#### Scenario: La limpieza costó más
- **WHEN** la limpieza se espera a 120 € al mes y en noviembre se pagan 135,50 € el 2 de diciembre
- **THEN** en Movimientos de diciembre sale «Limpieza» por −135,50 €, que corresponde a noviembre;
  en noviembre la limpieza sale pagada («se esperaban 120 €») y ya no cuenta como prevista en el resumen

#### Scenario: Un mes sin limpieza
- **WHEN** en agosto no hay limpieza y administración pulsa «No hay este mes»
- **THEN** deja de contar como prevista; con «Volver a esperarlo» vuelve a estar pendiente

### Requirement: Categorías del mes
En la pestaña «Ajustes», administración MUST poder marcar qué categorías de ingresos y gastos cuentan como «del mes»
(las que salen en la gráfica «Cuotas vs gastos fijos» del resumen). Por defecto: en ingresos, Cuotas; en gastos,
Profesores, Presidente, Alquiler, Limpieza, Agua, Electricidad y Wifi.

### Requirement: Gastos por categoría
El sistema MUST mostrar los gastos del mes agrupados por categoría (Profesores, Alquiler, Material, Federación, Torneos, Suministros, Presidente, Limpieza, Agua, Electricidad, Wifi,
Otros gastos), de mayor a menor, con su total.

### Requirement: Facturas de proveedores
Una factura MUST tener fecha, número, proveedor, concepto, categoría de gasto, importe y meses a los que corresponde, y MAY llevar un documento (PDF, JPG, PNG o WEBP de hasta 10 MB),
que se puede abrir o sustituir. Se marca como pagada con fecha y forma de pago; solo una factura pendiente se puede quitar.
La lista MUST poder ordenarse desde las cabeceras por fecha
(por defecto, de la más reciente a la más antigua), número, proveedor,
concepto, categoría, importe o estado, en ambos sentidos.

#### Scenario: Documento no válido
- **WHEN** se intenta adjuntar un archivo que no es un PDF ni una foto, o que pasa de 10 MB
- **THEN** se rechaza con un mensaje que lo explica

### Requirement: Editar una factura
Solo superadministración MUST poder editar una factura desde «Facturas», también si ya está pagada,
con un botón de editar (lápiz) a la derecha del todo de su fila que administración no ve.
Se cambian la fecha, el número, el proveedor, el concepto, la categoría, el importe y los meses a los que corresponde
y, en una factura pagada, la fecha y la forma de pago; el documento no cambia.
Antes de guardar MUST pedirse confirmación con la lista de lo que cambia («Importe: 950 € → 900 €»).
No se puede editar una factura de una temporada cerrada ni moverla a una.

#### Scenario: Corregir el pago de una factura pagada
- **WHEN** superadministración edita la factura del alquiler pagada el 1 de octubre por transferencia, la deja en 900 € pagados el 3 en efectivo y confirma
- **THEN** la factura y su movimiento del libro salen con 900 €, el 3 de octubre y en efectivo

#### Scenario: Administración no edita facturas
- **WHEN** administración abre «Facturas»
- **THEN** no ve el botón de editar en ninguna fila

### Requirement: Mes a mes y cierre
El sistema MUST mostrar los 12 meses del ejercicio con ingresos, gastos y resultado, contando cada movimiento en los
[meses a los que corresponde](#requirement-meses-a-los-que-corresponde), y el saldo del club al acabar cada mes, que
va por la fecha de los movimientos (cuando se movió el dinero), y el total.
Un ejercicio MUST poder cerrarse a partir de su último mes (agosto), en orden y una sola vez.
El cierre MUST arrastrar lo movido de verdad en el ejercicio (por fecha), no el resultado por meses: así el saldo del
club sigue siendo la suma del banco y la caja. Si no coinciden, la tarjeta de cierre MUST mostrar los dos
(«Movido en caja y banco»).

#### Scenario: Cerrar la temporada
- **WHEN** administración confirma el cierre
- **THEN** se guardan los ingresos, los gastos y el resultado movidos en el ejercicio, y lo movido en caja; nada con fecha del ejercicio se puede crear, cambiar ni borrar (apuntes, facturas, cobros, liquidaciones, traspasos), ni hacer que corresponda a sus meses, y ese resultado pasa como saldo inicial del siguiente, repartido entre banco y caja

### Requirement: Diagnóstico de datos
Contabilidad MUST tener una pestaña «Diagnóstico» con lo que no cuadra en los datos del club, explicado y con su
solución, que se puede aceptar o descartar (ver [la spec de diagnóstico](../diagnostico/spec.md)).

### Requirement: Acceso restringido
La contabilidad MUST estar reservada a cuentas de administración.
