# Desarrollo dockerizado con make

## Context

Se quiere que el proyecto arranque igual en cualquier máquina y en CI,
sin instalar Deno, Node ni PostgreSQL en el host,
siguiendo la convención de Aircury de un `Makefile` como punto de entrada.

## Decision

- `compose.yaml` define estos servicios:
  - `nginx`;
  - `api` (`denoland/deno`), la Edge Function ejecutada tal cual contra el PostgreSQL local;
  - `vite` (`node:24-alpine`);
  - `postgres` (`postgres:17-alpine`);
  - `e2e`, con la imagen oficial de Playwright y el perfil `e2e`.
- Los contenedores se ejecutan con el UID/GID del usuario del host
  para no generar ficheros de root.
- Toda orden documentada pasa por `make` (`make help` lista los objetivos).
  La documentación nunca pide ejecutar comandos del proyecto en el host.
- La configuración de la API llega por variables de entorno desde `compose.yaml`
  (`DATABASE_URL`, `TEST_DATABASE_URL`, cookie de sesión, almacenamiento de adjuntos):
  no hay ficheros de entorno versionados ni secretos en el repositorio.
  Los valores de `compose.yaml` son solo de desarrollo.
- Las migraciones SQL (`supabase/migrations`) las aplica `make migrate` con el mismo registro
  que la CLI de Supabase, que es quien las aplica en producción.
- Los puertos se configuran con `APP_PORT` (8080 por defecto) y `DB_PORT` (5432).

## Consequences

- Requisitos del host: Docker con Compose y `make`.
- Los hooks de git (Lefthook) también llaman a Docker,
  así que necesitan el entorno levantado.
- La etapa `prod` del Dockerfile queda preparada para el despliegue,
  pero no se usa hasta que se decida
  (ver [Despliegue en AWS pendiente](specs/decisions/despliegue-en-aws-pendiente.md)).
