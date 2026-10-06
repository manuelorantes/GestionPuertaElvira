# Cuenta de asistente

La inteligencia artificial que ayuda a mantener la aplicación puede entrar en ella con una cuenta propia,
de rol **asistente**, para consultar datos y hacer los cambios que se le pidan. Tiene los mismos permisos
que administración (ni historial ni importación de hojas) y todo lo que hace queda en el historial con su
nombre, como cualquier otra cuenta.

## Alta de la cuenta (una vez, desde el ordenador de quien administra)

Igual que cualquier cuenta, por consola contra la base de datos de producción (ver
[despliegue](./despliegue.md#4-primer-administrador)):

```sh
docker compose run --rm --no-deps -e DATABASE_URL='postgresql://...' api \
  deno task console app:user:create asistente@club.es 'Asistente IA' assistant
```

La consola muestra una contraseña temporal una sola vez. Guárdala en un fichero fuera del repositorio,
que solo pueda leer tu usuario:

```sh
mkdir -p ~/.config/puerta-elvira && chmod 700 ~/.config/puerta-elvira
cat > ~/.config/puerta-elvira/asistente.env <<'FIN'
ASISTENTE_URL=https://dcq8hag8ys38s.cloudfront.net
ASISTENTE_EMAIL=asistente@club.es
ASISTENTE_PASSWORD=<contraseña temporal>
FIN
chmod 600 ~/.config/puerta-elvira/asistente.env
```

## Uso

```sh
make asistente ARGS="GET /api/auth/me"
make asistente ARGS="GET /api/admin/students?filter=active"
make asistente ARGS="POST /api/admin/students '{\"fullName\":\"Nombre Apellidos\"}'"
```

El script `scripts/asistente.sh` inicia sesión cuando hace falta y guarda la cookie en el mismo
directorio. En la primera llamada sustituye la contraseña temporal por una aleatoria y la deja en el
fichero: nadie necesita verla ni copiarla. Nunca la imprime.

Para retirar el acceso: `make user-disable ARGS="asistente@club.es"` (con `DATABASE_URL` de producción,
como en el alta).
