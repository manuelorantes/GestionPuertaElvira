# Resumen

Portada del panel para administración con las cifras reales del club. Se compone de Cobros, Contabilidad, Alumnado y Clases.

### Requirement: Cifras clave del mes
El resumen MUST mostrar:

- lo cobrado en el mes frente a lo previsto (cuotas del mes);
- lo pendiente de cobro, con el plazo del día 5;
- los gastos del mes (liquidaciones, facturas y otros gastos);
- los alumnos activos frente a los registrados.

### Requirement: Mes a mes
El resumen MUST mostrar un gráfico de barras de ingresos y gastos de los últimos 12 meses, con el mes en curso destacado
y una descripción accesible con las cifras de cada mes.

### Requirement: Ocupación
El resumen MUST mostrar la ocupación media de los grupos (plazas ocupadas sobre plazas totales), cuántos están completos
y los cuatro grupos con más plazas libres, con acceso a Clases.

### Requirement: Recibos vencidos y últimos movimientos
El resumen MUST listar las cuotas vencidas más antiguas, con «WhatsApp» (si no se ha avisado) y «Cobrar», y los últimos movimientos del libro.

#### Scenario: Cobrar desde el resumen
- **WHEN** administración pulsa «Cobrar» en un recibo vencido
- **THEN** se abre «Registrar cobro» con ese alumno y, al guardar, el resumen se actualiza

### Requirement: Acceso restringido
Las cifras del club MUST estar reservadas a administración; otros roles solo ven el saludo.
