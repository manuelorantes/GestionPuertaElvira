# Contabilidad

Tesorería del club: movimientos de cada mes, facturas de proveedores con su documento, resultado mes a mes del ejercicio y cierre de temporada.
Solo administración puede verla y gestionarla.
Decisión de diseño: [facturas con adjunto en almacenamiento de documentos](../../decisions/facturas-con-adjunto-en-almacenamiento-de-documentos.md).

### Requirement: Ejercicio contable
El ejercicio MUST ir de septiembre a agosto. Su acumulado MUST empezar en el saldo arrastrado de los ejercicios anteriores cerrados.

### Requirement: Movimientos del mes
El sistema MUST mostrar los movimientos del mes, del más reciente al más antiguo, con fecha, concepto, categoría, forma de pago e importe,
y los totales de ingresos, gastos y resultado. Los movimientos MUST salir de:

- los cobros de Cobros (ingresos «Cuotas» o «Cuota de socio»);
- las liquidaciones pagadas al profesorado (gasto «Profesores», en la fecha de pago);
- las facturas de proveedores pagadas (gasto de su categoría, en la fecha de pago);
- los apuntes manuales.

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

### Requirement: Gastos por categoría
El sistema MUST mostrar los gastos del mes agrupados por categoría (Profesores, Alquiler, Material, Federación, Torneos, Suministros, Otros gastos), de mayor a menor, con su total.

### Requirement: Facturas de proveedores
Una factura MUST tener fecha, número, proveedor, concepto, categoría de gasto e importe, y MAY llevar un documento (PDF, JPG, PNG o WEBP de hasta 10 MB),
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
