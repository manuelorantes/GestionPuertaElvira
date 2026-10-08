# Despliegue en producción

Producción cuesta 0 € al mes: Supabase (plan gratuito) para la base de datos, los adjuntos y la API,
y CloudFront (capa gratuita permanente) para servir web y API desde el mismo origen con un subdominio
`*.cloudfront.net`. Decisión y alternativas en la
[ADR](../specs/decisions/backend-en-deno-sobre-supabase.md).

```
navegador ── https://xxxx.cloudfront.net ──┬── /api/*  → Edge Function «api»  (Supabase)
                                           └── /*      → bucket público «web» (Supabase Storage)
                                                             ↓
                                              PostgreSQL + bucket privado «documentos»
```

Lo que se despliega sale siempre de `main`: el workflow [Despliegue](../.github/workflows/deploy.yml)
se ejecuta con cada release y aplica las migraciones, publica la función y sube la web compilada.
Nada se despliega a mano desde un ordenador.

## 1. Proyecto de Supabase (una vez)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región `eu-west-1` o la más cercana a Granada)
   y guarda la contraseña de la base de datos en un gestor de contraseñas.
2. **Storage → New bucket**:
   - `web`, **público** (la web compilada);
   - `documentos`, **privado** (adjuntos de facturas; la función los sirve con su clave de servicio).
3. **Settings → API**: apunta el *Project ref* (`<ref>` en `https://<ref>.supabase.co`).
4. Botón **Connect** (arriba) → pestañas del *pooler*: copia dos URL,
   - **Session pooler** (puerto 5432) para las migraciones: la conexión «directa» es solo IPv6
     y GitHub Actions no la alcanza;
   - **Transaction pooler** (puerto 6543) para la función.
   Son de la forma `postgresql://postgres.<ref>:[CONTRASEÑA]@aws-0-eu-west-1.pooler.supabase.com:<puerto>/postgres`.
   Si la contraseña lleva caracteres especiales, codifícala en percent-encoding.
5. **Account → Access tokens**: crea un token personal para la CLI (solo lo usará GitHub Actions).
   Los tokens caducan como mucho al año: cuando el workflow empiece a fallar con un 401, genera otro
   y actualiza el secreto `SUPABASE_ACCESS_TOKEN`.

## 2. Secretos y variables en GitHub (una vez)

En el repositorio, las **variables** van en *Settings → Secrets and variables → Actions → Variables*
(a nivel de repositorio: los workflows se omiten sin fallar mientras no existan) y los **secretos** en
*Settings → Environments → `produccion`* (créalo si no existe):

| Tipo | Nombre | Valor |
|---|---|---|
| Variable (repositorio) | `SUPABASE_PROJECT_REF` | el *Project ref* |
| Variable (repositorio) | `APP_URL` | la URL de CloudFront (paso 3); hasta entonces, `https://<ref>.supabase.co/functions/v1` |
| Secreto (`produccion`) | `SUPABASE_ACCESS_TOKEN` | el token personal de la CLI |
| Secreto (`produccion`) | `SUPABASE_DB_URL` | la URL del *session pooler* (5432) |
| Secreto (`produccion`) | `SUPABASE_POOLER_URL` | la URL del *transaction pooler* (6543), con `?sslmode=require` |
| Secreto (`produccion`) | `BACKUP_PASSPHRASE` | contraseña larga para cifrar las copias de seguridad (guárdala en el gestor de contraseñas) |

La función recibe sola `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; el workflow le fija el resto
(`DATABASE_URL`, cookie `__Host-pe_session` con `Secure`, bucket `documentos`).

Después lanza el workflow **Despliegue** a mano (*Run workflow*) o haz una release.
Al terminar, `https://<ref>.supabase.co/functions/v1/api/health` debe responder `{"status":"healthy",...}`.

## 3. CloudFront (una vez)

Hace falta una cuenta de AWS; la distribución entra en la capa gratuita permanente
(1 TB de salida y 2 millones de invocaciones de CloudFront Functions al mes). La plantilla es
[`infra/cloudfront.yaml`](../infra/cloudfront.yaml) (CloudFormation, sin dependencias):

```sh
make cloudfront ARGS=<ref>     # aws-cli en Docker; necesita AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY y AWS_REGION
```

También puede crearse desde la consola de AWS (CloudFormation → Create stack → subir la plantilla).
La salida `AppUrl` es la URL pública: ponla en la variable `APP_URL` del entorno `produccion`
y vuelve a lanzar el workflow para que la comprobación final use esa URL.

La web no necesita invalidaciones: los ficheros con hash se suben con un año de caché e `index.html`
sin caché, y CloudFront respeta esas cabeceras.

Supabase Storage sirve el HTML de los buckets públicos como `text/plain` y con una CSP que bloquea
scripts y estilos (medidas de seguridad suyas, sin opción en el plan gratuito), así que la web **solo
funciona a través de CloudFront**, cuya función de respuesta restaura `text/html` y quita esa CSP.
La URL directa del bucket no sirve para usar la aplicación.

## 4. Primer administrador

Las cuentas se crean por consola contra la base de datos de producción, desde el contenedor de la API
y con la URL del pooler en `DATABASE_URL` (no la guardes en ningún fichero del repositorio):

```sh
docker compose run --rm --no-deps -e DATABASE_URL='postgresql://...' api \
  deno task console app:user:create junta@club.es 'Nombre Apellidos' superadministrator
```

La contraseña temporal se muestra una sola vez; habrá que cambiarla al entrar.

La cuenta con la que la inteligencia artificial usa la aplicación (rol `assistant`) se explica en
[asistente.md](./asistente.md).

## Mantener el proyecto activo

Supabase pausa los proyectos gratuitos tras una semana sin peticiones. El workflow
[Mantener activo](../.github/workflows/keep-alive.yml) consulta `/api/health` (que lee de la base de datos)
cada tres días. Si el proyecto llegara a pausarse, se reactiva desde el panel de Supabase sin perder datos.

## Copias de seguridad

El workflow [Copia de seguridad](../.github/workflows/copia-seguridad.yml) se ejecuta cada día a las 04:23 UTC
(también a mano con *Run workflow*). Hace un `pg_dump` de la base de datos, descarga los documentos del bucket
privado `documentos` (adjuntos de facturas), lo empaqueta todo en un tar y lo cifra con la contraseña del
secreto `BACKUP_PASSPHRASE` (el repositorio es público). Se guarda como artefacto del run: 35 días las copias
diarias y 90 días (el máximo en un repositorio público) la del día 1 de cada mes. Se descargan desde
*Actions → Copia de seguridad → el run → Artifacts*.

El tar contiene `copia.dump` y la carpeta `documentos/` con las mismas claves que en el bucket
(`invoices/<uuid>/<uuid>.pdf`). Si el bucket tiene documentos y alguno no se descarga, el run falla.

Para restaurar en un proyecto nuevo o en el mismo (borra lo que haya):

```sh
gpg -d copia-2026-11-01.tar.gpg | tar -x                # pide la contraseña del secreto; deja copia.dump y documentos/
docker compose run --rm --no-deps -v "$PWD:/copia" postgres \
  pg_restore -d 'postgresql://...session pooler...' --no-owner --no-privileges --clean --if-exists /copia/copia.dump
```

Y para volver a subir los documentos (con la clave `service_role` de *Project Settings → API Keys*):

```sh
cd documentos
find . -type f | sed 's#^\./##' | while read -r f; do
  curl -fsS -o /dev/null -X POST "https://<ref>.supabase.co/storage/v1/object/documentos/$f" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "x-upsert: true" -H "Content-Type: application/pdf" --data-binary "@$f"
done
```

Las copias anteriores a octubre de 2026 son solo la base de datos (`copia-AAAA-MM-DD.dump.gpg`): se
descifran con `gpg -d … > copia.dump`, sin `tar`.

Conviene probar la restauración una vez al año contra la base local (`make db-reset` después).

## Horas automáticas

El workflow [Horas automáticas](../.github/workflows/horas-automaticas.yml) apunta cada noche a las 21:30 UTC
(después del cierre del club) las sesiones de las clases y turnos del día, con
`deno task console app:payroll:propose-sessions` contra la base de datos de producción. Consultar la API no las
apunta. Rellena desde el mes anterior, así que si una noche falla, la siguiente lo recupera; también se puede
lanzar a mano con *Run workflow*. En local: `make console ARGS=app:payroll:propose-sessions`.

## Si el despliegue falla por el token

Si los pasos «Secretos de la función» o «Subir la web» fallan con `FGA Authentication Error. Unauthorized`
o con un 500 al pedir la clave de servicio, y la API de Supabase responde con normalidad sin token,
el token de acceso ha dejado de valer. Revócalo en *Account → Access tokens*, genera otro, actualiza
el secreto `SUPABASE_ACCESS_TOKEN` del entorno `produccion` y vuelve a lanzar **Despliegue** a mano.
Las migraciones no dependen del token, así que la base de datos queda al día aunque la función y la web no.

## Qué vigilar

- **Supabase → Edge Functions → Logs** para errores de la API (los logs son JSON con `requestId`).
- **Copias de seguridad**: el plan gratuito de Supabase no las hace; las hace el workflow de arriba, cada día.
- **Workflows programados** (copia de seguridad, horas automáticas, mantener activo): GitHub los desactiva en un
  repositorio público tras 60 días sin actividad. Si eso pasa, se reactivan en *Actions* con *Enable workflow*.
- **Límites gratuitos** (500 MB de base de datos, 1 GB de Storage, 500 000 invocaciones de funciones al mes):
  muy por encima del uso del club.
