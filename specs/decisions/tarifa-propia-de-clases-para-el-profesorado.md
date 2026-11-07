# Tarifa propia de clases para el profesorado

## Context

Cada profesor cobra sus horas a su tarifa por hora.
Algunas clases (por ejemplo, las nuevas del aula Rey Batallador) se pagan distinto:
a un precio por hora propio, o a un tanto fijo por sesión, dure lo que dure.
Cambiarlo mueve liquidaciones, así que solo debe hacerlo superadministración y confirmándolo.

## Decision

- La tarifa vive en Profesorado (`payroll_group_pay`, por grupo: `unit` hour o session y `amount_cents`), no en el grupo:
  Clases no sabe de dinero; su consulta de grupos solo la lee para mostrarla, y no al profesorado.
- Va con la clase, no con el profesor: la cobra quien la dé, también un sustituto.
- Por hora: los minutos que cuentan de la sesión a ese precio.
  Por sesión: el precio entero, o la parte proporcional a lo que cuenta si se pisa con otra sesión el mismo día
  (las reglas de solapes no cambian).
- El cálculo (`GroupPay`) está en el dominio y lo usan la liquidación, el coste del registro de horas,
  la rentabilidad y la nómina prevista del resumen.
  La tarifa de la liquidación sigue siendo la del profesor; la vista marca `customRates` cuando el importe no es horas × tarifa.
- Como la tarifa del profesor: cambia las liquidaciones sin pagar; las pagadas guardan su importe y su detalle.
- Solo superadministración (`access: 'superadmin'`) y con confirmación en la web; en el historial, Profesorado.

## Consequences

- El coste de una sesión de un mes ya pagado se calcula con la tarifa de hoy en el registro de horas,
  aunque la liquidación pagada conserve lo que se pagó.
- Las clases de particulares pueden tener tarifa propia como cualquier otra.

Relacionado: [Precio de clases especiales y de alumnos](specs/decisions/precio-de-clases-especiales-y-de-alumnos.md).
