# API y web en el mismo origen

## Context

La web consume la API con sesión autenticada.
Si la API y la web viven en dominios distintos hacen falta CORS,
cookies `SameSite=None` y más superficie de ataque CSRF.

## Decision

La web y la API se sirven desde el mismo origen:

- En local, nginx (`http://localhost:8080`) envía `/api/*` a php-fpm
  y el resto al servidor de desarrollo de Vite.
- En producción, el mismo reparto lo hará el CDN o el balanceador
  (por ejemplo, CloudFront con dos orígenes).
- La web llama siempre a rutas relativas (`/api/...`).

## Consequences

- No se configura CORS.
- La autenticación podrá usar cookies `HttpOnly; Secure; SameSite=Strict`.
- Las cabeceras de seguridad se ponen en un único punto (nginx o CDN).
