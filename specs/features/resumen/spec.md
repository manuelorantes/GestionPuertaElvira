# Resumen

Portada del panel para administración con las cifras reales del club. Se compone de Cobros, Contabilidad, Alumnado y Clases.

### Requirement: Cifras clave del mes
El resumen MUST mostrar:

- lo cobrado en el mes frente a lo previsto: solo las cuotas del mes (y el material), las mismas cifras que «Cuotas» de
  ese mes en Cobros;
- lo pendiente de cobro de esas cuotas, con el plazo del día 5 y, aparte en la misma línea, lo que falta por cobrar de
  cuotas de socio de la temporada (p. ej. «Plazo hasta el 5 de octubre · y 2750 € de cuotas de socio»);
- los gastos del mes (liquidaciones, facturas y otros gastos);
- los alumnos activos frente a los registrados.

### Requirement: Mes a mes
El resumen MUST mostrar un gráfico de barras de ingresos y gastos de la temporada en curso, de septiembre a agosto, con
el mes en curso destacado y una descripción accesible con las cifras de cada mes. Las cuotas mensuales MUST contar en el
mes al que corresponden (cada cobro repartido a partes iguales entre los meses que paga), no en el mes en que se
cobran; el resto de ingresos (cuota de socio, subvenciones, promociones, apuntes) y los gastos, en su fecha.
Al pasar el ratón por una barra (o al tocarla en el móvil) MUST mostrarse a cuánto dinero equivale, p. ej. «Ingresos de
octubre 2026: 4120 €».

#### Scenario: Un pago trimestral
- **WHEN** un alumno paga en octubre tres meses por 121,50 €
- **THEN** el gráfico suma 40,50 € a octubre, a noviembre y a diciembre

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
