# Cuotas mensuales generadas y pago flexible

## Context

El club cobra cuotas mensuales del día 1 al 5 de cada mes de la temporada (septiembre a junio).
Las familias pueden pagar un mes, varios meses por adelantado con descuento, o cambiar de forma de pago cuando quieran.
Hay que saber en todo momento quién ha pagado, quién está en plazo y quién está vencido,
y el histórico no debe cambiar si después cambian las tarifas o los grupos del alumno.

## Decision

- Contexto **Billing**, con su propia capa de dominio en Deptrac.
  Obtiene de Alumnado y Clases el perfil de facturación de cada alumno mediante el puerto `StudentDirectory`:
  horas semanales de sus grupos normales, sus clases particulares y si tiene hermanos activos.
- Cada mes de la temporada, cada alumno activo tiene una **cuota guardada** (`Charge`).
  Su importe se fija al generarla: un mes, con el descuento familiar.
  La generación es idempotente: se lanza al consultar el mes y con el comando `app:billing:generate-charges`
  (cuando haya despliegue se programará el día 1).
  Los socios tienen además una cuota de socio por temporada.
- El estado se deriva de la fecha:
  - pagada;
  - en plazo, si es del mes actual y hoy es día ≤ 5;
  - vencida, si es del mes actual y hoy es día > 5, o si es de un mes anterior;
  - próxima, si es de un mes futuro.
- **Pago flexible:** un cobro de N meses paga las N cuotas pendientes más antiguas y crea, ya pagadas,
  las de los meses siguientes que aún no existan, sin pasar de junio.
  La preferencia de la ficha solo propone el número de meses.
- **Cálculo** en el servicio de dominio `FeeCalculator`:
  - tramo por horas semanales de los grupos normales;
  - más las particulares (horas semanales × 4 × precio por hora);
  - descuentos sumados (familiar, pago adelantado según los meses, descuento especial puntual);
  - prorrateo opcional en el mes de alta;
  - redondeo a céntimos.
- **Recibo** numerado por temporada; **factura** bajo petición, una por cobro, con el IVA del 21 % incluido en el precio
  (base = total / 1,21). Ambos se imprimen desde el navegador.
- Los importes son enteros en céntimos (`Money`).

## Consequences

- El histórico es estable: cambiar tarifas solo afecta a las cuotas y cobros nuevos.
- Una baja después de pagar por adelantado deja cuotas futuras pagadas; los reembolsos quedan para Contabilidad.
- Las cuotas de meses pasados solo se generan si se consultan esos meses.
  El comando de generación permite rellenarlas si hace falta.
