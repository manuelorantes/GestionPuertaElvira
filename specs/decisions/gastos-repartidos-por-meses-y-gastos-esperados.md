# Gastos repartidos por meses y gastos esperados

## Context
Una cosa es cuándo se paga un gasto y otra a qué meses corresponde.
El IVA es trimestral: el que se paga en enero corresponde a octubre, noviembre y diciembre.
Hasta ahora cada apunte y cada factura tenían un solo «mes al que corresponde» (`period`),
que solo usaba la gráfica «Cuotas vs gastos fijos» del resumen.
«Mes a mes y cierre» iba por la fecha de pago.
Además, el saldo del club que enseña el resumen sale del acumulado de «Mes a mes»
y tiene que ser siempre la suma del banco y la caja
([saldos derivados del libro](specs/decisions/saldos-de-caja-y-banco-derivados-del-libro.md)).
Por otro lado, el club tiene gastos que se repiten cada mes (alquiler, limpieza, presidencia)
y el resumen solo preveía el profesorado:
hasta que se anotaban, esos gastos no contaban en el margen previsto,
y su importe real cambia de un mes a otro (la limpieza depende de las horas).

## Decision
- Cada movimiento lleva un **reparto por meses** (`PeriodShares`):
  una lista de pares «mes → importe» que suma su importe, sin meses repetidos y con cada parte mayor que cero.
  A partes iguales, los céntimos que sobran van a los primeros meses
  (como el reparto de los cobros de cuotas en el resumen).
  Los meses no pueden estar a más de un año de la fecha del movimiento
  ni ser de una temporada cerrada.
- Se guarda en una columna `period_shares` (jsonb) de `accounting_entry`, `accounting_invoice`
  y `accounting_correction`, nula cuando todo corresponde a un solo mes.
  `period` sigue siendo el primer mes, así que las filas antiguas no necesitan migrar datos.
- El libro da a cada línea su reparto (`LedgerLine.shares`):
  el de su apunte, factura o corrección; en los cobros de cuotas, a partes iguales entre los meses que pagan;
  en lo demás, todo a su mes.
- **«Mes a mes»** cuenta ingresos, gastos y resultado por los meses a los que corresponde.
  Su columna de saldo y el **cierre** siguen yendo por la fecha:
  el cierre arrastra lo que de verdad entró y salió del ejercicio.
  Si no coincide con el resultado por meses, la tarjeta de cierre enseña los dos.
  No se guarda el resultado por meses en el cierre:
  como ningún movimiento puede corresponder a meses de una temporada cerrada, se puede recalcular siempre.
- El resumen y «Mes a mes» buscan movimientos hasta un año antes y después de los meses que enseñan,
  porque un movimiento puede pagarse así de lejos de los meses a los que corresponde.
- Un **gasto esperado** (`ExpectedExpense`) es una plantilla: concepto, categoría de gasto (no Profesores),
  importe esperado, meses del año en que se espera y el mes desde el que se espera.
  No se generan apuntes por adelantado: cada mes está pendiente
  hasta que se paga con un apunte manual (por lo que costó de verdad)
  o se marca «No hay este mes».
  Cómo quedó cada mes se guarda en `accounting_expected_month` (sin fila, pendiente);
  la fila de un mes pagado apunta a su apunte con `ON DELETE CASCADE`,
  así que quitar el apunte deja el mes pendiente sin más lógica.
- Lo pendiente de los gastos esperados de categorías del mes se suma en gris a los **gastos previstos**
  de «Cuotas vs gastos fijos» y al margen previsto, también en los meses pasados
  (para que lo olvidado se vea; el diagnóstico lo señala).

## Consequences
- El saldo del club, el del banco y el de la caja no cambian:
  siguen siendo lo que se movió de verdad.
- «Mes a mes» deja de cuadrar con los movimientos de cada mes cuando hay movimientos repartidos;
  la tarjeta de cierre lo explica.
- Un cobro de varios meses ya no cuenta entero en el mes en que se cobró, sino repartido entre los meses que paga.
- Corregir en contabilidad un cobro de varios meses guarda su reparto en la corrección.
  Las correcciones anteriores a esta decisión cuentan todo en su mes.
- Lo que cuesta de verdad cada mes es siempre un apunte normal del libro:
  saldos, «Mes a mes» y cierre no cambian por tener gastos esperados.
- Cambiar el importe de un gasto esperado no toca los meses ya pagados.
- Pagar un gasto esperado con una factura queda fuera por ahora: se paga con un apunte.
