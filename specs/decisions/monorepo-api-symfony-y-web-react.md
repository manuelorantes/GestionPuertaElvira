# Monorepo con API Symfony y web React

**Estado:** sustituida por [Backend en Deno sobre Supabase](specs/decisions/backend-en-deno-sobre-supabase.md) (octubre de 2026). Lo que sigue describe la API en PHP ya retirada; se conserva porque las decisiones de arquitectura (capas, contextos, modelos separados) siguen vigentes en Deno.

## Context

El club necesita una aplicación de gestión (alumnos, clases, profesores, cobros, contabilidad)
y una web pública con los precios.
El diseño de partida (`GestionClub.dc.html`) es una aplicación React de una sola página.
Hay un único desarrollador y se quiere seguir los estándares de Aircury.

## Decision

Un único repositorio con dos aplicaciones:

- `apps/api`: API JSON en Symfony 7.4 LTS sobre PHP 8.5.
- `apps/web`: SPA en React 19 + Vite + TypeScript.

La infraestructura local (`docker/`, `compose.yaml`), el `Makefile`,
las especificaciones (`specs/`) y el CI son comunes a ambas.
La API y la web se versionan y despliegan juntas desde la misma rama.

## Consequences

- Un cambio que toca API y web va en un único PR y se revisa entero.
- El contrato entre ambas es el OpenAPI de la API (`/api/doc.json`).
- Si en el futuro la web pública necesita SEO o renderizado en servidor,
  se puede añadir otra aplicación en `apps/` sin mover las existentes.
