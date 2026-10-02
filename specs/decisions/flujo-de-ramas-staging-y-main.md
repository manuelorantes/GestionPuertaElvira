# Flujo de ramas staging y main

## Context

Se quiere un entorno de preproducción (staging) y uno de producción,
con todo integrado primero en staging y promocionado a producción mediante PR.

## Decision

- `main` es producción; `staging` es integración y preproducción.
- Cada cambio nace de `staging` en una rama `feat/…`, `fix/…`, `chore/…` o `docs/…`
  y vuelve a `staging` por PR.
- La release es un PR `staging → main`.
  El job `release-source` del CI rechaza cualquier PR a `main` que no venga de `staging`.
- Ambas ramas están protegidas: PR obligatorio, check `CI` en verde,
  sin force-push y sin borrado.
  Las aprobaciones obligatorias están a 0 mientras haya un único desarrollador.
- Commits y títulos de PR en Conventional Commits (en inglés),
  validados por commitlint en el hook `commit-msg`.
  Ámbitos habituales: `api`, `web`, `docker`, `ci`, `deps`, `specs` y `repo`.

## Consequences

- `staging` siempre debe estar desplegable;
  todo lo que entra en `main` ya ha pasado por `staging`.
- Cuando exista despliegue, cada rama tendrá su entorno:
  staging se desplegará en cada push a `staging` y producción en cada push a `main`.
- Cuando se incorpore otra persona,
  las aprobaciones obligatorias subirán a 1, usando CODEOWNERS.
