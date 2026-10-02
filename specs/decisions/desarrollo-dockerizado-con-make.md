# Desarrollo dockerizado con make

## Context

Se quiere que el proyecto arranque igual en cualquier máquina y en CI,
sin instalar PHP, Composer, Node ni PostgreSQL en el host,
siguiendo la convención de Aircury de un `Makefile` como punto de entrada.

## Decision

- `compose.yaml` define estos servicios:
  - `nginx`;
  - `php-fpm`, con imagen propia (`docker/php/Dockerfile`, etapa `dev`);
  - `vite` (`node:24-alpine`);
  - `postgres` (`postgres:17-alpine`);
  - `e2e`, con la imagen oficial de Playwright y el perfil `e2e`.
- Los contenedores se ejecutan con el UID/GID del usuario del host
  para no generar ficheros de root.
- Toda orden documentada pasa por `make` (`make help` lista los objetivos).
  La documentación nunca pide ejecutar comandos del proyecto en el host.
- La configuración de la API llega por variables de entorno:
  desde `compose.yaml` en desarrollo y desde `phpunit.dist.xml` en tests.
  El cargador de ficheros de entorno de Symfony está desactivado
  (`extra.runtime.disable_dotenv` en `composer.json`),
  así que no hay ficheros de entorno versionados ni secretos en el repositorio.
  Los valores de `compose.yaml` son solo de desarrollo.
- Los puertos se configuran con `APP_PORT` (8080 por defecto) y `DB_PORT` (5432).

## Consequences

- Requisitos del host: Docker con Compose y `make`.
- Los hooks de git (Lefthook) también llaman a Docker,
  así que necesitan el entorno levantado.
- La etapa `prod` del Dockerfile queda preparada para el despliegue,
  pero no se usa hasta que se decida
  (ver [Despliegue en AWS pendiente](specs/decisions/despliegue-en-aws-pendiente.md)).
