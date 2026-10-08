# Gestión Puerta Elvira

Aplicación de gestión del **Club Ajedrez Puerta Elvira** (Granada):
alumnos, clases y horario, profesores y sus horas, cuotas y cobros, y contabilidad.
Incluye también la web pública con los precios de la temporada.

- `supabase/functions/api`: API JSON en TypeScript sobre Deno (Edge Function de Supabase) con arquitectura hexagonal.
- `supabase/migrations`: esquema de la base de datos (migraciones SQL).
- `apps/web`: SPA en React 19 + Vite + TypeScript + Tailwind.
- PostgreSQL 17. Todo se ejecuta en Docker a través de `make`.

## Requisitos

- Docker con Compose v2.
- `make`.
- Nada más: Deno, Node y PostgreSQL viven en contenedores.

## Primera vez

```sh
make init
```

Instala dependencias, crea las bases de datos (desarrollo y test),
aplica migraciones e instala los hooks de git.
Después abre <http://localhost:8080>.

### Usuarios de desarrollo

`make init` (y `make seed`) crea estas cuentas **solo en local**:

| Email | Contraseña | Rol |
|---|---|---|
| `admin@puertaelvira.test` | `desarrollo-admin` | Superadministración (también el historial) |
| `junta@puertaelvira.test` | `desarrollo-junta` | Administración |
| `profe@puertaelvira.test` | `desarrollo-profe` | Profesorado (con los datos de demostración, vinculada a Lucía Moreno Gil) |
| `nuevo@puertaelvira.test` | `desarrollo-nuevo` | Administración, con contraseña temporal |
| `ia@puertaelvira.test` | `desarrollo-ia` | Asistente (la IA; ver [docs/asistente.md](docs/asistente.md)) |

`make seed` las restablece y reinicia los bloqueos por intentos fallidos.
También crea, si no hay ninguno, los 5 profesores, 18 grupos y 16 alumnos **ficticios** del diseño,
con sus cuotas y cobros desde septiembre (dos alumnos con cuotas vencidas para probar los avisos).
Las cuotas de cada mes se generan solas al consultarlo; `make console ARGS="app:billing:generate-charges"` las genera a mano.
`make e2e` los reinicia antes de las pruebas, así que borra los alumnos, grupos y profesores que hayas creado en local.

### Cuentas reales y primer administrador

Las cuentas se gestionan por consola; todavía no hay pantalla de usuarios.

```sh
make user-create ARGS="junta@ejemplo.es 'Nombre Apellidos' administrator"   # muestra la contraseña temporal
make user-reset-password ARGS="junta@ejemplo.es"                            # nueva contraseña temporal
make user-disable ARGS="junta@ejemplo.es"     # make user-enable ARGS="..."
make user-role ARGS="junta@ejemplo.es teacher"
```

La contraseña temporal se muestra una sola vez: hay que entregarla en persona,
y la persona tendrá que cambiarla al entrar.

## Día a día

| Comando | Qué hace |
|---|---|
| `make up` / `make down` | Arranca o para el entorno |
| `make logs ARGS=api` | Logs de un servicio |
| `make test` | Tests de API y web |
| `make lint` | Todas las comprobaciones estáticas |
| `make fix` | Aplica los formateadores |
| `make e2e` | Tests de extremo a extremo (Playwright) |
| `make ci` | Lo mismo que GitHub Actions |
| `make migrate` | Aplica las migraciones pendientes (`make migration ARGS=nombre` crea una) |
| `make console ARGS="app:billing:generate-charges"` | Consola de la API |
| `make help` | Todos los objetivos |

URLs locales:

- Web: <http://localhost:8080>
- API: <http://localhost:8080/api/health>
- PostgreSQL: `localhost:5480` (cambia el puerto con `DB_PORT`) (usuario `club`, contraseña `club`; solo desarrollo)

Los puertos se cambian con `APP_PORT` y `DB_PORT`.

## Cómo se trabaja

El proyecto sigue el [Aircury AI Framework](FRAMEWORK.md),
con las adaptaciones de [`FRAMEWORK.local.md`](FRAMEWORK.local.md).

- **Especificación primero:** cada funcionalidad pasa por Spec Kit
  (specify → clarify → plan → tasks → analyse → implement).
  El comportamiento vigente queda en [`specs/features/`](specs/features/).
- **TDD:** test que falla, implementación mínima, refactor.
- **Decisiones** en [`specs/decisions/`](specs/decisions/) (ADRs).
- **Ramas:** se parte de `staging`, PR a `staging`, y la release es un PR `staging → main`.
  Commits en [Conventional Commits](https://www.conventionalcommits.org/).
  Ver [flujo de ramas](specs/decisions/flujo-de-ramas-staging-y-main.md).

## Arquitectura

```
supabase/functions/api/
  index.ts           arranque de la Edge Function
  src/domain/        reglas de negocio puras (sin framework), un directorio por contexto
  src/application/   casos de uso y puertos
  src/infrastructure/ HTTP (Hono), SQL (postgres.js), almacenamiento, historial, logging
  scripts/           consola (cuentas, semillas, cuotas) y migraciones
  tests/             tests por capa (domain, application, integration) y de arquitectura
supabase/migrations/ esquema SQL (lo aplica `make migrate` en local y la CLI de Supabase en producción)
apps/web/src/
  app/             arranque, proveedores y rutas
  pages/           pantallas
  shared/          cliente de API, UI común
```

Las dependencias van `infrastructure → application → domain`, y un test de arquitectura lo comprueba en CI.
Más detalle en las [ADRs](specs/decisions/), empezando por
[Backend en Deno sobre Supabase](specs/decisions/backend-en-deno-sobre-supabase.md).

## Despliegue

Producción es Supabase (base de datos, adjuntos y la Edge Function) con CloudFront delante para servir
web y API desde el mismo origen, todo en capas gratuitas
([ADR](specs/decisions/backend-en-deno-sobre-supabase.md)).
Cada release (push a `main`) lanza el workflow **Despliegue**: migraciones, función y web.
La puesta en marcha paso a paso está en [`docs/despliegue.md`](docs/despliegue.md).

## Estándares de desarrollo

| Dimensión | Nivel actual |
|---|---|
| Revisión | PR obligatorio + CI en verde (0 aprobaciones mientras haya un solo desarrollador) |
| Cobertura | ≥ 75 % de líneas en API y web |
| E2E | Smoke de Playwright en cada PR |
| Lint | `deno lint`, `deno check` estricto, test de arquitectura, ESLint strict, Prettier, knip: cero errores |
| Seguridad | `npm audit` (alta/crítica) en CI; sin secretos en el repo |
| Despliegue | Automático desde `main` (Supabase + CloudFront); ping cada 3 días para no pausar el proyecto |
