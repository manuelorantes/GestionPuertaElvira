# Precio de clases especiales y de alumnos

## Context

La cuota mensual sale de un tramo por las horas semanales de los grupos normales, más las particulares a su precio por hora.
Algunas clases (por ejemplo, la nueva del aula Rey Batallador) tienen un precio propio que no encaja en los tramos,
y a algunos alumnos se les cobra un precio pactado que no depende de sus clases.
Cambiar estos precios mueve cuotas ya generadas (y cobradas), así que solo debe hacerlo superadministración y confirmándolo.

## Decision

- **Clase especial:** un grupo (no de particulares) con precio mensual propio.
  Quien está en él paga ese precio por esa clase y sus horas no cuentan para el tramo.
  La cuota es tramo de los grupos normales + precio de cada clase especial + particulares.
  El precio vive en el contexto de Cobros (`billing_special_class_price`, por grupo), no en el grupo:
  Clases no sabe de dinero; las consultas de grupos solo lo leen para mostrarlo.
- **Precio fijado del alumno:** un precio mensual en su cuenta de cobro (`billing_account.fixed_price_cents`)
  que sustituye a todo lo demás (grupos, clases especiales y particulares).
- Sobre ambos se aplican los descuentos de siempre (familiar, pago adelantado, puntos y especial).
- Cambiarlos recalcula las cuotas con las reglas de siempre (desde el mes siguiente, o el actual del día 1 al 10,
  hasta junio; las fijadas a mano no cambian).
- Solo superadministración los cambia (`access: 'superadmin'` en la API) y la web pide confirmación antes de hacerlo.
  Las rutas cuelgan de `/api/admin/billing`, así que en el historial van a la categoría Cuotas.

## Consequences

- El precio fijado de un alumno oculta los cambios de sus grupos: si cambia de clases, su cuota no cambia hasta que se quite.
- Un grupo de particulares no puede ser clase especial: ya tiene precio por hora.
- El diagnóstico de cuotas usa el mismo cálculo, así que da por buenas las cuotas con estos precios.

Relacionado: [Cuotas mensuales generadas y pago flexible](specs/decisions/cuotas-mensuales-generadas-y-pago-flexible.md).
