# Resumen

Portada del panel para administración con las cifras reales del club. Se compone de Cobros, Contabilidad, Alumnado y Clases.

### Requirement: Cifras clave del mes
El resumen MUST mostrar:

- el saldo del club: el acumulado del ejercicio hasta el mes en curso que enseña «Mes a mes» de
  [Contabilidad](../contabilidad/spec.md) (desde el saldo arrastrado), con el resultado de la temporada debajo
  (p. ej. «+1240 € esta temporada»);
- lo pendiente de cobro de las cuotas del mes (y el material), las mismas cifras que «Cuotas» de ese mes en Cobros, con
  el plazo del día 5 y, aparte en la misma línea, lo que falta por cobrar de cuotas de socio de la temporada (p. ej.
  «Plazo hasta el 5 de octubre · y 2750 € de cuotas de socio»);
- el margen previsto del mes: las cuotas del mes en curso (cobradas y previstas) menos sus gastos fijos (anotados y
  profesorado previsto), las mismas cifras que el mes en curso de «Cuotas vs gastos fijos», con el detalle debajo
  (p. ej. «3920 € de cuotas · 2100 € de gastos fijos»);
- los socios activos (de alta hoy) y, debajo, cuántos de ellos están en al menos una clase (p. ej. «107» y «92 en
  alguna clase»).

#### Scenario: Saldo y margen
- **WHEN** el ejercicio arrastra 14.100 € y en lo que va de temporada han entrado 5.000 € y salido 3.760 €
- **THEN** el saldo del club es «15.340 €» y debajo pone «+1240 € esta temporada»; si en octubre hay 3.920 € de cuotas
  cobradas o previstas y 2.100 € de gastos fijos, el margen previsto de octubre es «+1820 €»

### Requirement: Mes a mes
El resumen MUST mostrar dos gráficos de barras de ingresos y gastos de la temporada en curso, de septiembre a agosto,
con el mes en curso destacado y una descripción accesible con las cifras de cada mes:

- **Ingresos y gastos de cada mes**: todo lo que entra y sale en cada mes, por fecha (cuadra con los totales de
  Contabilidad de ese mes).
- **Cuotas vs gastos fijos**: lo que corresponde a cada mes, solo las [categorías del mes](../contabilidad/spec.md)
  de Contabilidad, cada movimiento en el mes al que corresponde. Las cuotas mensuales, repartidas a partes iguales
  entre los meses que paga cada cobro; lo del profesorado, en el mes de la liquidación; apuntes y facturas, en su mes
  al que corresponde. Sobre los ingresos de cada mes, apiladas en el verde claro de los grupos de iniciación, las
  **cuotas previstas**: lo que falta por cobrar de las cuotas mensuales de ese mes. En el mes en curso y los pasados,
  lo pendiente de las cuotas emitidas (una cuota cancelada ya no se debe y desaparece de ahí); en los meses que
  vienen, además, las que se emitirán a los alumnos matriculados hoy que aún no tengan la de ese mes (las
  [previstas](../cobros/spec.md) de Cobros, con la tarifa de hoy). Julio y agosto no tienen cuotas. Sobre los gastos,
  en gris, el **profesorado previsto**: lo que costará el
  profesorado ese mes según el horario (las [horas esperadas](../profesorado/spec.md) de Rentabilidad: clases y
  actividades de los días del mes salvo festivos, a la tarifa de hoy), menos lo del profesorado que ya esté en el
  libro ese mes. Del mes en curso en adelante; los meses pasados, julio y agosto no tienen.
Al pasar el ratón por una barra (o al tocarla en el móvil) MUST mostrarse a cuánto dinero equivale, p. ej. «Ingresos de
octubre 2026: 4120 €», «Cuotas previstas de noviembre 2026: 1340 €» o «Profesorado previsto de noviembre 2026:
1200 €».

#### Scenario: Un pago trimestral
- **WHEN** un alumno paga en octubre tres meses por 121,50 €
- **THEN** «Ingresos y gastos de cada mes» suma 121,50 € a octubre y «Cuotas vs gastos fijos» suma 40,50 € a
  octubre, a noviembre y a diciembre, sin cuota prevista en esos meses

#### Scenario: Cuotas previstas de los meses que vienen
- **WHEN** en octubre un alumno matriculado en un grupo de dos horas semanales solo ha pagado octubre
- **THEN** «Cuotas vs gastos fijos» muestra de noviembre a junio una cuota prevista de 45 € sobre los ingresos, y
  nada previsto en octubre ni en julio y agosto

#### Scenario: Cuota del mes sin cobrar y cancelada
- **WHEN** en octubre un alumno recién matriculado tiene su cuota de octubre de 45 € emitida y sin cobrar
- **THEN** «Cuotas vs gastos fijos» muestra en octubre 45 € de cuotas previstas y ningún ingreso; si administración
  cancela esa cuota, octubre se queda sin previstas

#### Scenario: Profesorado previsto
- **WHEN** en octubre una profesora a 15 €/h da una clase de una hora los lunes y miércoles y aún no se ha pagado
  su liquidación
- **THEN** «Cuotas vs gastos fijos» muestra en octubre y en cada mes hasta junio, sobre los gastos, el profesorado
  previsto de ese mes (sus lunes y miércoles no festivos × 15 €), y nada en julio ni en agosto

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
