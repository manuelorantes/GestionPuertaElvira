# Integración continua y puertas de calidad

## Context

El framework de Aircury exige TDD, límites de arquitectura explícitos
y paridad entre las comprobaciones locales y las de CI.
Los estándares de desarrollo de Aircury piden cobertura C3 (75 % de líneas)
y una puerta de vulnerabilidades.

## Decision

GitHub Actions (`.github/workflows/ci.yml`) se ejecuta en cada PR
y en cada push a `staging` y `main`.
Cada paso invoca el mismo objetivo de `make` que se usa en local,
y `make ci` lanza el conjunto completo.

| Job | Puertas |
|---|---|
| `api` | `deno fmt --check`, `deno lint`, `deno check` (TypeScript estricto), test de arquitectura, tests de Deno con cobertura ≥ 75 % |
| `web` | ESLint (typescript-eslint strict), Prettier, `tsc`, knip, Vitest con cobertura ≥ 75 %, build, `npm audit` (alta/crítica) |
| `e2e` | Playwright contra la pila completa en Docker (escritorio y móvil) |
| `release-source` | Los PR a `main` solo pueden venir de `staging` |
| `CI` | Agregado; es el único check obligatorio en la protección de ramas |

- **Tests de la API:** `deno test` por capa (`domain`, `application`, `integration`),
  en serie porque comparten la base de datos de test, con cobertura por `lcov`.
- **Tests de la web:** Vitest con Testing Library (consultas por rol y texto),
  y Playwright solo para recorridos críticos.
- **Hooks locales (Lefthook):** `commit-msg` (commitlint), `pre-commit` (formato) y `pre-push` (tests).
- **Dependabot:** semanal, contra `staging`.
- **Despliegue:** el workflow `Despliegue` se ejecuta con cada push a `main` (es decir, con cada release
  ya validada por CI), `Mantener activo` consulta la API cada tres días y `Copia de seguridad` guarda
  cada día el `pg_dump` y los documentos del bucket privado, cifrados, como artefacto. `Horas automáticas y cuotas`
  apunta cada noche las sesiones del día y crea las cuotas que falten del mes (ver `docs/despliegue.md`).

## Consequences

- No se puede fusionar un PR si falla cualquier puerta.
- Los umbrales de cobertura solo suben.
- El job `e2e` es el más lento.
  Si se convierte en un cuello de botella,
  se pasará a un smoke en cada PR y a la suite completa cada noche.
