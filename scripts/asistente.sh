#!/bin/sh
# Petición a la API de la aplicación como la cuenta de asistente (rol «assistant»).
#
#   scripts/asistente.sh GET /api/admin/students
#   scripts/asistente.sh POST /api/admin/students '{"fullName":"..."}'
#
# Configuración en ~/.config/puerta-elvira/asistente.env (solo lectura para el usuario):
#   ASISTENTE_URL=https://dcq8hag8ys38s.cloudfront.net
#   ASISTENTE_EMAIL=asistente@...
#   ASISTENTE_PASSWORD=...        (la temporal del alta; el script la cambia y la guarda aquí)
#
# La sesión se guarda en una cookie en el mismo directorio. Si la contraseña es temporal, se sustituye
# por una aleatoria en la primera llamada. Nunca imprime la contraseña.
set -eu

DIR="${ASISTENTE_DIR:-$HOME/.config/puerta-elvira}"
ENV_FILE="$DIR/asistente.env"
JAR="$DIR/asistente.cookies"

if [ "$#" -lt 2 ]; then
  echo "Uso: $0 METODO /api/ruta ['{json}']" >&2
  exit 64
fi
METHOD="$1"
ROUTE="$2"
BODY="${3:-}"

if [ ! -r "$ENV_FILE" ]; then
  echo "Falta $ENV_FILE (ASISTENTE_URL, ASISTENTE_EMAIL, ASISTENTE_PASSWORD)." >&2
  exit 78
fi
chmod 600 "$ENV_FILE"
# shellcheck disable=SC1090
. "$ENV_FILE"
: "${ASISTENTE_URL:?Falta ASISTENTE_URL}" "${ASISTENTE_EMAIL:?Falta ASISTENTE_EMAIL}" "${ASISTENTE_PASSWORD:?Falta ASISTENTE_PASSWORD}"
touch "$JAR"
chmod 600 "$JAR"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# request METODO RUTA [CUERPO]: deja el cuerpo en $OUT y el código HTTP en $STATUS.
request() {
  if [ -n "${3:-}" ]; then
    RESPONSE=$(curl -sS -b "$JAR" -c "$JAR" -X "$1" "$ASISTENTE_URL$2" \
      -H 'content-type: application/json' -H 'accept: application/json' \
      --data "$3" -w '\n%{http_code}')
  else
    RESPONSE=$(curl -sS -b "$JAR" -c "$JAR" -X "$1" "$ASISTENTE_URL$2" \
      -H 'accept: application/json' -w '\n%{http_code}')
  fi
  STATUS=$(printf '%s' "$RESPONSE" | tail -n 1)
  OUT=$(printf '%s' "$RESPONSE" | sed '$d')
}

credentials() {
  printf '{"email":"%s","password":"%s"}' "$(json_escape "$ASISTENTE_EMAIL")" "$(json_escape "$ASISTENTE_PASSWORD")"
}

login() {
  request POST /api/auth/login "$(credentials)"
  if [ "$STATUS" != "200" ]; then
    echo "No se pudo iniciar sesión ($STATUS): $OUT" >&2
    exit 77
  fi
  if printf '%s' "$OUT" | grep -q '"mustChangePassword":true'; then
    NEW=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)
    request PUT /api/auth/password \
      "{\"currentPassword\":\"$(json_escape "$ASISTENTE_PASSWORD")\",\"newPassword\":\"$NEW\"}"
    if [ "$STATUS" != "204" ]; then
      echo "No se pudo cambiar la contraseña temporal ($STATUS): $OUT" >&2
      exit 77
    fi
    TMP="$ENV_FILE.tmp"
    grep -v '^ASISTENTE_PASSWORD=' "$ENV_FILE" > "$TMP"
    printf 'ASISTENTE_PASSWORD=%s\n' "$NEW" >> "$TMP"
    chmod 600 "$TMP"
    mv "$TMP" "$ENV_FILE"
    ASISTENTE_PASSWORD="$NEW"
    echo "Contraseña temporal sustituida y guardada en $ENV_FILE." >&2
    # Cambiarla cierra la sesión: se abre otra.
    request POST /api/auth/login "$(credentials)"
  fi
}

request "$METHOD" "$ROUTE" "$BODY"
if [ "$STATUS" = "401" ]; then
  login
  request "$METHOD" "$ROUTE" "$BODY"
fi

echo "HTTP $STATUS" >&2
if [ -n "$OUT" ]; then
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "$OUT" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$OUT"
  else
    printf '%s\n' "$OUT"
  fi
fi
case "$STATUS" in
  2*) exit 0 ;;
  *) exit 1 ;;
esac
