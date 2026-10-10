# Contabilidad

Tesorería del club: movimientos de cada mes, facturas de proveedores con su documento, resultado mes a mes del ejercicio y cierre de temporada.
Solo administración puede verla y gestionarla.
Decisión de diseño: [facturas con adjunto en almacenamiento de documentos](../../decisions/facturas-con-adjunto-en-almacenamiento-de-documentos.md).

### Requirement: Ejercicio contable
El ejercicio MUST ir de septiembre a agosto. Su acumulado MUST empezar en el saldo arrastrado de los ejercicios anteriores cerrados.

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

#### Scenario: Ingresos en efectivo
- **WHEN** administración elige «Ingresos» y luego «Efectivo»
- **THEN** solo ve los ingresos cobrados en efectivo de ese mes, con su número y su suma

#### Scenario: Sin teclear dos veces
- **WHEN** administración registra un cobro de cuota o paga una liquidación
- **THEN** aparece como movimiento del mes sin anotarlo en Contabilidad

### Requirement: Apuntes manuales
Administración MUST poder anotar ingresos o gastos con fecha, concepto, categoría de su tipo, forma de pago (efectivo, transferencia o tarjeta)
e importe mayor que cero, y quitarlos.

### Requirement: Mes al que corresponde
Cada apunte y cada factura MUST tener un mes al que corresponde (la luz de septiembre pagada en octubre corresponde a
septiembre). Al anotarlos se puede elegir; por defecto es el mes de su fecha (la de la factura, en las facturas). En los
movimientos, el mes al que corresponde MUST ser el de la liquidación o el anticipo para el profesorado y el del cobro en
los cobros. Los movimientos de otro mes MUST indicarlo («Corresponde a septiembre 2026»).

#### Scenario: Luz pagada al mes siguiente
- **WHEN** administración anota el 3 de octubre la luz y elige «Septiembre 2026» como mes al que corresponde
- **THEN** el movimiento sale en octubre con «Corresponde a septiembre 2026», y en el resumen cuenta como gasto de
  septiembre en «Lo que corresponde a cada mes»

### Requirement: Categorías del club
En «Ajustes», administración MUST poder añadir categorías propias de ingresos o de gastos, renombrarlas y quitarlas
mientras ningún movimiento las use. Las de serie no se renombran ni se quitan. No MAY haber dos categorías con el mismo
nombre dentro de los ingresos ni dentro de los gastos. Las del club salen en los desplegables de apuntes y facturas y
se pueden marcar como «del mes».

#### Scenario: Categoría con movimientos
- **WHEN** administración intenta quitar la categoría «Seguro», que ya usa un apunte
- **THEN** no se quita y se explica que tiene movimientos

### Requirement: Categorías del mes
En la pestaña «Ajustes», administración MUST poder marcar qué categorías de ingresos y gastos cuentan como «del mes»
(las que salen en la gráfica «Lo que corresponde a cada mes» del resumen). Por defecto: en ingresos, Cuotas; en gastos,
Profesores, Presidente, Alquiler, Limpieza, Agua, Electricidad y Wifi.

### Requirement: Gastos por categoría
El sistema MUST mostrar los gastos del mes agrupados por categoría (Profesores, Alquiler, Material, Federación, Torneos, Suministros, Presidente, Limpieza, Agua, Electricidad, Wifi,
Otros gastos), de mayor a menor, con su total.

### Requirement: Facturas de proveedores
Una factura MUST tener fecha, número, proveedor, concepto, categoría de gasto, importe y mes al que corresponde, y MAY llevar un documento (PDF, JPG, PNG o WEBP de hasta 10 MB),
que se puede abrir o sustituir. Se marca como pagada con fecha y forma de pago; solo una factura pendiente se puede quitar.

#### Scenario: Documento no válido
- **WHEN** se intenta adjuntar un archivo que no es un PDF ni una foto, o que pasa de 10 MB
- **THEN** se rechaza con un mensaje que lo explica

### Requirement: Mes a mes y cierre
El sistema MUST mostrar los 12 meses del ejercicio con ingresos, gastos, resultado y acumulado, y el total.
Un ejercicio MUST poder cerrarse a partir de su último mes (agosto), en orden y una sola vez.

#### Scenario: Cerrar la temporada
- **WHEN** administración confirma el cierre
- **THEN** se guardan ingresos, gastos y resultado; nada con fecha del ejercicio se puede crear, cambiar ni borrar (apuntes, facturas, cobros, liquidaciones), y el resultado pasa como saldo inicial del siguiente

### Requirement: Acceso restringido
La contabilidad MUST estar reservada a cuentas de administración.
