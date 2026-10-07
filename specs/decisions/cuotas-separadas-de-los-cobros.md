# Cuotas separadas de los cobros

## Context
Un cobro es el dinero que entra (fecha, forma de pago, recibo). Una cuota es lo que el alumno debe cada mes.
Hasta ahora cada cuota quedaba «pagada por» un cobro concreto, de modo que corregir el importe de un mes ya cobrado
(se cobró de más un mes y de menos el siguiente, o el alumno cambia de tarifa a mitad de un pago adelantado)
obligaba a tocar recibos o descuentos. El club quiere reorganizar las cuotas sin tocar los cobros.

## Decision
- **Valor cubierto de un cobro** (`billing_payment.credit_cents`): lo que cubre en importes de cuota, antes de
  descuentos (pago adelantado, puntos, especial). Un cobro de 3 meses a 40 € con un 10 % cubre 120 €, aunque entren 108 €.
  Corregir el importe de un cobro corrige también su valor cubierto en la misma diferencia.
- **Reparto automático**: el estado de cada cuota se calcula repartiendo el valor cubierto de todos los cobros del
  alumno (por tipo: cuotas mensuales y cuota de socio por separado) entre sus cuotas, de la más antigua a la más
  reciente. Cada cuota queda cubierta, cubierta en parte o pendiente; lo que sobra es saldo a favor y cubre las
  siguientes cuotas en cuanto existen. Se calcula al leer (en SQL con funciones de ventana), no se guarda.
- **Importe de una cuota editable**: se puede fijar a mano con un motivo, solo ese mes o ese y los siguientes de la
  temporada (se crean las cuotas que falten). Las fijadas a mano no cambian con el recálculo automático.
- **Recálculo automático**: al cambiar lo que determina la cuota de un alumno (grupos, horario especial, familia
  directa, precio de particulares o tarifa de un grupo), las cuotas no fijadas a mano se recalculan desde el mes
  siguiente, o desde el actual si es del día 1 al 10, hasta junio, estén cobradas o no. La diferencia aparece como
  pendiente o como saldo a favor.
- `billing_charge.paid_by` deja de decidir el estado; se conserva como referencia del cobro que la cubrió primero.
- Contabilidad, recibos y facturas no cambian: los ingresos se cuentan por la fecha y el importe de cada cobro.

## Consequences
- Los datos existentes se convierten sin pérdida: el valor cubierto de cada cobro es la suma de las cuotas que pagaba.
- Si un alumno tenía un mes sin pagar y otro posterior pagado, el reparto cubre primero el más antiguo: el pendiente
  pasa al mes más reciente. Es el comportamiento buscado (el dinero salda primero la deuda más antigua).
- Las consultas de cuotas son algo más costosas (ventanas por alumno); para el volumen del club es despreciable.
