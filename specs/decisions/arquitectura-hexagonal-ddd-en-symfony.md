# Arquitectura hexagonal y DDD en Symfony

## Context

El dominio tiene reglas de negocio con peso propio
(tarifas por horas semanales, descuentos acumulables, prorrateos, puntos, liquidaciones de profesores)
que deben poder probarse sin framework ni base de datos.
El framework de Aircury exige límites explícitos entre dominio, aplicación e infraestructura.

## Decision

- `apps/api/src/` se divide en tres capas con dependencias hacia dentro:
  `Infrastructure → Application → Domain`.
- Dentro de cada capa, una carpeta por contexto acotado.
  Contextos previstos: `Identity`, `Students` (alumnado), `Classes` (grupos y horario),
  `Teachers` (profesorado), `Billing` (cuotas y cobros) y `Accounting` (contabilidad).
  Cada contexto se crea con su primera especificación, no antes.
- **Domain**: entidades, value objects, eventos y servicios de dominio.
  Sin vendors salvo `webmozart/assert`.
- **Application**: casos de uso invocables y puertos (interfaces en `*/Port/`).
  Sin vendors salvo `webmozart/assert`.
- **Infrastructure**: controladores HTTP, adaptadores Doctrine, Symfony y logging.
  El `Kernel` vive en `src/Infrastructure/Kernel.php`.
- Los puertos se enlazan explícitamente a sus adaptadores en `config/services.yaml`.
- Deptrac (`apps/api/deptrac.yaml`) hace cumplir las reglas en CI.
- Los contextos se comunican mediante servicios de aplicación o eventos de dominio,
  y los agregados se referencian por identificador.

## Consequences

- Más clases que un CRUD con entidades de Doctrine,
  a cambio de un dominio que se prueba en milisegundos.
- La persistencia necesita modelos y mappers propios
  (ver [PostgreSQL con Doctrine y modelos de persistencia separados](specs/decisions/postgresql-con-doctrine-y-modelos-de-persistencia-separados.md)).
- Cuando haya varios contextos, Deptrac tendrá una capa por contexto
  para impedir imports cruzados de dominio.
