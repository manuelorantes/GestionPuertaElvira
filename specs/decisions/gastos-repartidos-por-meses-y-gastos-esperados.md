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

## Consequences
- El saldo del club, el del banco y el de la caja no cambian:
  siguen siendo lo que se movió de verdad.
- «Mes a mes» deja de cuadrar con los movimientos de cada mes cuando hay movimientos repartidos;
  la tarjeta de cierre lo explica.
- Un cobro de varios meses ya no cuenta entero en el mes en que se cobró, sino repartido entre los meses que paga.
- Corregir en contabilidad un cobro de varios meses guarda su reparto en la corrección.
  Las correcciones anteriores a esta decisión cuentan todo en su mes.
