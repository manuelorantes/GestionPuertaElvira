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
- La sesión viaja en una cookie `HttpOnly; SameSite=Strict; Path=/`.
  En producción usa el prefijo `__Host-` y `Secure`, de modo que no se puede fijar desde subdominios
  (ver [Sesiones opacas en base de datos](specs/decisions/sesiones-opacas-en-base-de-datos.md)).
- Defensa CSRF en profundidad: mismo origen, `SameSite=Strict`
  y, además, la API rechaza con 415 las peticiones que cambian estado y no llegan como `application/json`.
  Un formulario de otro origen no puede enviarlas sin una petición previa de CORS, que no se autoriza.
- Todas las respuestas de `/api` llevan `Cache-Control: no-store`.
- Las cabeceras de seguridad se ponen en un único punto (nginx o CDN).
