# Material deportivo como cobro

## Context
El club vende material al alumnado (chándales, polos, relojes…) y quiere llevarlo en la aplicación: productos que se
definen sin tocar el código, pedidos por alumno que acaban en un cobro, compras al proveedor por lotes, stock y margen.
Lo que paga cada alumno por el material tiene que sumar con el resto de lo que mueve en el club (recibos, facturas,
contabilidad, ficha del alumno).

## Decision
- **Contexto propio** (`equipment`): productos, pedidos y compras. Los productos guardan sus campos como datos
  (`fields`: de lista u opcionales de texto), de modo que añadir un producto o un campo no necesita código.
- **Variante**: la combinación de los valores de los campos de lista de un pedido o de una línea de compra
  (`variant_key`, JSON canónico por id de campo). El stock es por variante y se calcula al leer: comprado menos entregado
  (sin contar lo devuelto al cancelar). No se guarda ningún contador.
- **Coste medio**: el coste de una unidad vendida es lo gastado en todas las compras del producto entre todas sus
  unidades compradas. No se elige el lote al entregar.
- **El pedido genera una cuota de Cobros** de tipo `material` (`billing_charge.kind = 'material'`, con su `concept`) al
  pasar a «Pedido». Así sale en «Cuotas», se cobra con el mismo diálogo, tiene recibo y factura, y entra en Contabilidad
  como «Venta de material».
- **Lo cobrado de un pedido solo cubre ese pedido**: los cobros de material apuntan a su cuota (`billing_payment.charge_id`)
  y el reparto de lo cubierto (ver [cuotas separadas de los cobros](cuotas-separadas-de-los-cobros.md)) se hace por cuota
  en el tipo `material`, no de la más antigua a la más reciente como en las mensuales.
- **El estado «Pagado» no se guarda**: sale de que su cuota esté cubierta. La entrega es una marca aparte (fecha).
- Cancelar un pedido cancela lo pendiente de su cuota con la misma regla que las cuotas; la cuota de material no se
  cancela por su cuenta ni sale en «Cuotas canceladas».

## Consequences
- El índice único de `billing_charge` (alumno, tipo, periodo) pasa a excluir el material: un alumno puede tener varios
  pedidos el mismo mes.
- Las compras al proveedor no se apuntan solas en Contabilidad; la factura del proveedor se sigue registrando allí.
- Retirar opciones o campos en uso no se permite, para no dejar pedidos ni stock sin variante.
