# Flujo de ramas staging y main

## Context

Se quiere un entorno de preproducción (staging) y uno de producción,
con todo integrado primero en staging y promocionado a producción mediante PR.

## Decision

- `main` es producción; `staging` es integración y preproducción.
- La rama por defecto en GitHub es `main`, de modo que el repositorio muestra lo que está en producción.
  Al abrir un PR de cambio hay que elegir `staging` como destino;
  la plantilla de PR lo recuerda y `release-source` bloquea los errores.
- Cada cambio nace de `staging` en una rama `feat/…`, `fix/…`, `chore/…` o `docs/…`
  y vuelve a `staging` por PR.
- **Todos los PR se fusionan con «Rebase and merge»**, también la release.
  Es el único método habilitado en GitHub (merge commit y squash están desactivados),
  así que el historial es lineal y no hay commits de merge.
- La release es un PR `staging → main`.
  Como el rebase crea commits nuevos en `main`, **tras cada release se limpia `staging`** con `make sync-staging`:
  rebasa `staging` sobre `main` (las copias ya publicadas desaparecen y lo integrado después se conserva) y lo sube con force-push.
  Si no, la siguiente release volvería a incluir commits ya publicados.
  El job `release-source` del CI rechaza cualquier PR a `main` que no venga de `staging`.
- `main` está protegida: PR obligatorio, check `CI` en verde, sin force-push y sin borrado.
- `staging` tiene un ruleset con PR obligatorio (solo rebase), check `CI` en verde y sin borrado,
  pero **permite force-push** para poder limpiarla tras cada release;
  el rol de administrador del repositorio puede saltarse el ruleset para hacerlo.
  (En un repositorio personal GitHub no deja dar esa excepción a GitHub Actions, por eso la limpieza no es un workflow.)
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
