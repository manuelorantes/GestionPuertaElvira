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
  Aceptar una sugerencia usa los casos de uso de siempre (corregir fecha y forma de pago de un cobro,
  apuntar un gasto o un ingreso, anotar un traspaso, corregir la forma de pago de un movimiento).
- Lo aceptado se recuerda en `accounting_bank_match`: la huella del movimiento del extracto
  (fechas de operación y valor, importe y saldo tras él; no el concepto, que el PDF a veces corta)
  y lo que le corresponde en la app.
  Los movimientos ya casados salen como «cuadra» y lo suyo en la app no se ofrece a otro movimiento.
  Lo que casa exactamente (mismo importe, fecha cercana, forma de pago del banco) cuadra sin guardar nada.
- La categoría elegida al apuntar un gasto o un ingreso se recuerda por contraparte (quien cobra o paga, sacado del
  concepto) en `accounting_bank_rule`, para proponerla la próxima vez.
- Solo superadministración usa la conciliación: cambia cobros y gastos de muchas personas de golpe.

## Consequences
- Subir dos veces el mismo extracto, extractos solapados o el mismo en Excel y en PDF no duplica nada.
- Si el banco cambia el formato del Excel o del PDF, hay que adaptar solo el lector de la web.
- Las combinaciones ambiguas de cobros con tarjeta no se adivinan: se eligen a mano.
- `pdfjs-dist` debe seguir en la 6.2.108 o posterior:
  las anteriores ejecutan JavaScript al abrir un PDF malicioso (GHSA-hq66-cqwq-w95j).
