# Conciliación bancaria con el extracto del banco

## Context
El saldo del banco de la app se deriva del libro
([saldos derivados del libro](specs/decisions/saldos-de-caja-y-banco-derivados-del-libro.md)),
así que solo es correcto si cada cobro y cada gasto tiene la fecha y la forma de pago reales.
Los cobros con tarjeta no llegan al banco uno a uno: el datáfono abona cada día una liquidación con lo cobrado ese día.
Los cobros importados de la hoja entraron con fechas y formas de pago aproximadas,
y hay recibos y cargos que nadie apunta hasta que se ven en el banco.
El club descarga cada mes el extracto de la cuenta (Excel o PDF) y quiere usarlo para corregir y completar la app,
decidiendo cada cambio.

## Decision
- El extracto **se lee en el navegador** y solo se envían a la API sus movimientos ya normalizados
  (fecha de operación, fecha valor, concepto, importe y saldo en céntimos).
  El Excel (`.xlsx`, aunque el banco lo llame `.xls`) se descomprime y lee con las APIs del navegador, sin librerías;
  el PDF se lee con `pdfjs-dist`, cargado solo al subir un PDF.
  Así la API no depende de formatos de fichero y el fichero no se guarda en ningún sitio.
- La API **calcula las sugerencias en cada pasada**, sin guardarlas:
  lo que no se acepta no deja rastro y vuelve a salir.
  Aceptar una sugerencia usa los casos de uso de siempre (corregir la fecha de un cobro,
  apuntar un gasto o un ingreso, anotar un traspaso, cobrar una cuota).
- Lo del extracto **solo casa con lo que ya es del banco** (revisado el 05/11/2026):
  tarjeta con una liquidación del datáfono, transferencia con una transferencia recibida.
  La conciliación no cambia la forma de pago de nada: lo de efectivo no pasó por el banco,
  y convertirlo descuadraba la caja; si falta algo, se crea su registro (gasto, ingreso o cuota).
- Lo aceptado se recuerda en `accounting_bank_match`: la huella del movimiento del extracto
  (fechas de operación y valor, importe y saldo tras él; no el concepto, que el PDF a veces corta)
  y lo que le corresponde en la app.
  Los movimientos ya casados salen como «cuadra» y lo suyo en la app no se ofrece a otro movimiento.
  Lo que casa solo (mismo importe, fecha cercana, forma de pago del banco) **también se guarda** al subir el extracto
  (revisado el 05/11/2026): sin guardarlo, un extracto posterior que no lo incluía volvía a ofrecer esa cuota
  para otra transferencia de la misma familia.
  Por si casó mal, se puede **deshacer**: el movimiento queda guardado sin nada que le corresponda,
  ya no casa solo y espera a que se acepte su sugerencia o se elija a mano.
- Lo casado queda **bloqueado** (revisado el 05/11/2026): los casos de uso que cambian la forma de pago, la fecha o el
  importe de un cobro, apunte, factura o traspaso, o lo borran, lo rechazan si está en `accounting_bank_match`.
  Así lo que cuadra con el banco no se descuadra desde Cobros o Contabilidad; la única salida es deshacer la
  conciliación.
- Una transferencia con el nombre de un alumno (o de su tutor) sin cobro suyo que casar propone **cobrar su cuota**
  con el caso de uso de Cobros (recibo, cuotas cubiertas y descuentos como siempre), si el importe coincide.
- Una transferencia recibida se puede **repartir a mano** entre cobros por transferencia y cuotas nuevas de varios
  alumnos (revisado el 05/11/2026): una familia paga a veces a varios niños con apellidos distintos.
  Los alumnos a los que paga cada remitente (sacado del concepto, como la contraparte) se recuerdan en
  `accounting_bank_payer` al casar su transferencia y la próxima vez cuentan como si salieran en el concepto,
  así que se propone cobrarles; siempre se acepta a mano.
  Si lo que llega no es justo lo que suman las cuotas elegidas, la diferencia se reparte a partes iguales con una
  corrección en cada recibo (como al corregir un importe en Cobros): lo de más es saldo a favor y lo de menos queda
  pendiente. Se confirma antes, porque cambia lo que debe cada alumno.
- La categoría elegida al apuntar un gasto o un ingreso se recuerda por contraparte (quien cobra o paga, sacado del
  concepto) en `accounting_bank_rule`, para proponerla la próxima vez.
- Solo superadministración usa la conciliación: cambia cobros y gastos de muchas personas de golpe.

## Consequences
- Subir dos veces el mismo extracto, extractos solapados o el mismo en Excel y en PDF no duplica nada.
- Subir un extracto ya escribe en la base de datos (lo que cuadra), aunque no cambia cobros ni gastos.
- Lo conciliado antes de guardar lo que cuadra solo no estaba recordado. Lo del cierre del 02/11/2026 (extracto del
  02/09 al 30/10/2026) se cargó con una migración de datos, calculada con esta misma conciliación;
  lo que no entre en ese periodo se recuerda al subir su extracto.
- Si el banco cambia el formato del Excel o del PDF, hay que adaptar solo el lector de la web.
- Las combinaciones ambiguas de cobros con tarjeta no se adivinan: se eligen a mano.
- `pdfjs-dist` debe seguir en la 6.2.108 o posterior:
  las anteriores ejecutan JavaScript al abrir un PDF malicioso (GHSA-hq66-cqwq-w95j).
