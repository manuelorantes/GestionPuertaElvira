# Saldos de caja y banco derivados del libro

## Context
El club quiere saber no solo cuánto dinero tiene, sino dónde está:
en la cuenta bancaria (transferencias y tarjeta) o en caja (efectivo).
El libro de movimientos no tiene tabla propia
([decisión previa](specs/decisions/facturas-con-adjunto-en-almacenamiento-de-documentos.md)
y nota «libro» de `db/schema.dbml`):
se compone en lectura a partir de cobros, liquidaciones, facturas pagadas y apuntes,
y cada movimiento ya lleva su forma de pago.
Además hay dinero que cambia de sitio sin ser ingreso ni gasto:
ingresar el efectivo de caja en el banco o sacar efectivo para un torneo.

## Decision
- Los saldos de banco y caja se **derivan del libro** por la forma de pago de cada movimiento:
  efectivo cuenta en caja; transferencia y tarjeta cuentan en el banco.
  No se guarda ningún saldo: el saldo del club sigue siendo el acumulado del ejercicio
  (desde lo arrastrado) hasta el mes en curso, el mismo que enseña el resumen,
  y es siempre la suma de banco y caja.
- Los **traspasos** entre caja y banco son una entidad propia (`accounting_transfer`),
  con fecha, origen, destino, importe y nota.
  No son movimientos del libro: no salen entre los del mes ni en ingresos y gastos,
  solo mueven dinero de un saldo al otro.
  Respetan el cierre de temporada como cualquier otro apunte.
- El **cierre de temporada** guarda, además de ingresos y gastos,
  lo que el ejercicio movió en caja (`cash_cents`):
  así el saldo arrastrado se reparte entre banco y caja sin recalcular ejercicios cerrados.

## Consequences
- No hay tabla de saldos que pueda descuadrar: corregir la forma de pago de un movimiento
  cambia automáticamente de sitio su importe.
- Los cierres anteriores a esta decisión tienen `cash_cents` a cero
  (el club no tenía ninguno al adoptarla).
  Si alguna vez hiciera falta, bastaría con rellenar esa columna.
- Un traspaso no se puede editar, solo quitar y volver a anotar: es un dato pequeño y poco frecuente.
- Los traspasos quedan en el historial de cambios como «Traspaso entre caja y banco».
