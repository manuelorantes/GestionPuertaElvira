# Sesiones opacas en base de datos

## Context

El panel gestiona datos de menores.
La especificación de autenticación exige que:

- una cuenta desactivada deje de funcionar en su siguiente acción;
- cerrar sesión invalide la sesión de verdad;
- la sesión caduque tras 2 horas sin actividad y, como mucho, a las 12 horas.

La API debe poder ejecutarse en varios procesos y, en el futuro, en AWS Lambda.
El catálogo de Aircury propone JWT en una cookie `HttpOnly`,
y boards-ai usa JWT de corta duración más un refresh token.

## Decision

- Al iniciar sesión se genera un **token aleatorio de 256 bits**.
  Viaja solo en una cookie `HttpOnly; SameSite=Strict; Path=/`,
  que en producción es `__Host-pe_session` con `Secure`.
- En PostgreSQL se guarda solo el **hash SHA-256 del token**,
  junto al usuario, la hora de inicio y la de la última actividad (agregado `Session` del contexto Identity).
- En cada petición, el autenticador busca la sesión por el hash del token
  y comprueba la caducidad (`SessionPolicy`: 2 h de inactividad y 12 h de máximo) y que el usuario siga activo.
  La última actividad se actualiza como mucho una vez por minuto.
- Cerrar sesión elimina la sesión.
  Desactivar una cuenta, restablecer su contraseña o cambiarla
  elimina sus sesiones (salvo, al cambiarla, la sesión desde la que se cambia).
- El framework HTTP es solo un adaptador de entrada:
  el middleware de la API delega en el caso de uso `AuthenticateSession`.
- La configuración de la cookie (`SESSION_COOKIE_NAME`, `SESSION_COOKIE_SECURE`) llega por variables de entorno.

## Consequences

- Revocación inmediata y caducidad por inactividad sin listas negras ni renovaciones en la web.
- Una consulta indexada por petición autenticada, y una escritura por minuto como mucho.
- Si se roba la base de datos, los hashes no sirven para suplantar sesiones.
- Las sesiones caducadas se borran al usarse.
  Cuando haya despliegue, una tarea periódica limpiará las que no se vuelvan a usar.
- Se aparta de la propuesta JWT del catálogo de Aircury.
  Si alguna vez hiciera falta autenticar clientes de terceros, se añadiría un mecanismo de tokens aparte.
