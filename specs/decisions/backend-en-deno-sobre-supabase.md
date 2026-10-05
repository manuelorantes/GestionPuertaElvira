# Backend en Deno sobre Supabase

**Estado:** aceptado. Revisa [Monorepo con API Symfony y web React](specs/decisions/monorepo-api-symfony-y-web-react.md),
[Arquitectura hexagonal y DDD en Symfony](specs/decisions/arquitectura-hexagonal-ddd-en-symfony.md) y
[PostgreSQL con Doctrine y modelos de persistencia separados](specs/decisions/postgresql-con-doctrine-y-modelos-de-persistencia-separados.md),
y sustituye a [Despliegue en AWS pendiente](specs/decisions/despliegue-en-aws-pendiente.md).

## Context

El club quiere producción a 0 €/mes y con todo en Supabase (base de datos, adjuntos y ejecución),
y ha decidido asumir el coste de reescribir la API, que estaba en PHP/Symfony, en el único lenguaje que
ejecutan las Edge Functions de Supabase: TypeScript sobre Deno. Lo que no cambia, y es el contrato de la
reescritura: las especificaciones de `specs/features/`, la web React, la base de datos (esquema, triggers
del historial) y la API HTTP que consume la web (rutas, JSON, códigos de error y cookies).

## Decision

- **Una Edge Function `api`** (`supabase/functions/api/`) con [Hono](https://hono.dev) atiende todas las rutas
  `/api/*`. Supabase la publica en `/functions/v1/api/*`, de modo que las rutas internas conservan el prefijo `/api`.
- **Misma arquitectura hexagonal**, ahora en TypeScript: `src/domain`, `src/application` (casos de uso y puertos)
  y `src/infrastructure` (HTTP, SQL, adaptadores). Las reglas de dependencia (`Infrastructure → Application → Domain`;
  cada contexto de dominio solo importa `common`) las comprueba un test de arquitectura en lugar de Deptrac.
- **PostgreSQL con SQL directo** (`postgres.js`, sin ORM): los repositorios mapean filas a objetos de dominio.
  **Cada petición es una transacción**: dentro se fijan las variables de sesión del historial (`set_config(..., true)`),
  valen los bloqueos `pg_advisory_xact_lock` y el puerto `TransactionRunner` usa puntos de guardado.
  Así funciona igual contra el pooler de Supabase en modo transacción (el recomendado para Edge Functions).
- **La autenticación propia se mantiene** ([Sesiones opacas en base de datos](specs/decisions/sesiones-opacas-en-base-de-datos.md)).
  Contraseñas con bcrypt (`hash-wasm`, válido en el runtime de borde); los hashes argon2id de la etapa PHP se
  verifican y se migran al iniciar sesión. El límite de intentos vive en la tabla `identity_login_attempt`.
- **Esquema gestionado con las migraciones de Supabase** (`supabase/migrations/*.sql`), partiendo de una línea base
  volcada del esquema actual (triggers incluidos). Los comandos de consola (`app:user:*`, semillas de desarrollo)
  son scripts de Deno que se conectan a la base de datos con `DATABASE_URL`.
- **Adjuntos en Supabase Storage** (bucket privado) a través de su API compatible con S3.
- **Web en el mismo origen**: CloudFront (subdominio gratuito) reenvía `/api/*` a la Edge Function y el resto al
  bucket público de Supabase Storage con la web compilada
  ([API y web en el mismo origen](specs/decisions/api-y-web-en-el-mismo-origen.md) sigue vigente).
- **En local**, la función se ejecuta con Deno (`deno serve`) contra el PostgreSQL de Compose; no hace falta la
  pila completa de Supabase. nginx reparte `/api/*` a Deno.
- **Migración por contextos**, cada uno en su PR a `staging`: mientras dura, nginx envía a Deno solo los prefijos ya
  portados y el resto a PHP, y los tests de Playwright son la prueba de equivalencia. Al terminar se elimina `apps/api`.
- Calidad: `deno fmt`, `deno lint`, `deno check`, tests de Deno por capa con cobertura ≥ 75 %, test de arquitectura.

## Consequences

- Los 370 tests de PHPUnit se reescriben en Deno siguiendo los mismos casos; mientras conviven, CI ejecuta ambos.
- Las Edge Functions limitan el tiempo de CPU por petición (2 s en el plan gratuito): las operaciones pesadas
  (generar cuotas, volver a un punto) se apoyan en SQL, no en bucles en memoria.
- Supabase gratis pausa el proyecto tras 7 días sin uso; un workflow programado consulta `/api/health`.
- OpenAPI (`/api/doc.json`) deja de generarse automáticamente; el contrato son `specs/features/` y los `api.ts` de la web.
