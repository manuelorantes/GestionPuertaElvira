# PostgreSQL con Doctrine y modelos de persistencia separados

## Context

Los datos son relacionales (alumnos, grupos, cobros, facturas)
y requieren transacciones fiables, sobre todo en cobros y contabilidad.
El despliegue futuro previsto es AWS, con Aurora PostgreSQL.
El dominio no debe conocer el ORM.

## Decision

- PostgreSQL 17 en local, en CI y en producción.
- Doctrine ORM solo en `Infrastructure/Persistence/Doctrine`:
  modelos de persistencia con atributos en `Model/`,
  mappers hacia y desde el dominio,
  y repositorios que implementan los puertos de Application.
  `auto_mapping` está desactivado.
- El esquema se gestiona con Doctrine Migrations (`apps/api/migrations`),
  que se revisan a mano antes de commitear.
- Identificadores UUIDv7 generados en el dominio.
- Importes de dinero como enteros en céntimos.
- `db/schema.dbml` documenta el esquema y se actualiza con cada migración.
- Los tests de integración usan la base `club_test`,
  y DAMA DoctrineTestBundle revierte cada test dentro de una transacción.

## Consequences

- Duplicación controlada entre entidad de dominio y modelo de persistencia.
- Las migraciones son la única vía para cambiar el esquema.
  CI comprueba que el mapeo es válido y que no quedan migraciones pendientes.
- Aurora PostgreSQL es compatible, así que el despliegue en AWS no obliga a cambiar nada.
