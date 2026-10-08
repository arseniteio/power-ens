#!/usr/bin/env bash
###############################################################################
# create-admin-role.sh · crea el rol ensfacil_admin y, si se pide, lo asigna
#
#   sudo bash config/create-admin-role.sh [--dry-run] [--mapear <usuario>]...
#
# Quien tiene el rol ensfacil_admin (o all_access) puede guardar la
# configuración ENS y ver su historial; los demás la ven, pero al guardar
# reciben un 403. El rol no da ningún permiso: es una marca que el plugin busca
# entre los roles del usuario.
#
# Habla con el indexer con su certificado de administración, sin contraseña,
# y comprueba el certificado del indexer contra su CA (nunca `-k`: este script
# escribe en la seguridad del cluster, y sin comprobar a quién se le habla
# cualquiera en medio recibiría el certificado de administración):
#   OS_CERT   por defecto /etc/wazuh-indexer/certs/admin.pem
#   OS_KEY    por defecto /etc/wazuh-indexer/certs/admin-key.pem
#   OS_CA     por defecto /etc/wazuh-indexer/certs/root-ca.pem
#   OS_URL    por defecto https://127.0.0.1:9200 (vale también ENS_OS_URL)
# La URL tiene que llevar el nombre para el que está hecho el certificado del
# indexer: el de una instalación por defecto de Wazuh es para 127.0.0.1, no
# para localhost (con localhost, curl se niega: «no alternative certificate
# subject name matches»).
#
# Se puede repetir: el rol se reescribe igual y el mapeo solo AÑADE los
# usuarios que falten; nunca quita a nadie. --dry-run enseña las peticiones que
# cambiarían algo y no las envía (sí lee el mapeo, para saber qué falta).
###############################################################################
set -euo pipefail

ROL=ensfacil_admin
CUERPO_ROL='{"description":"ENSFácil: puede cambiar la configuración ENS y ver su historial","cluster_permissions":[],"index_permissions":[],"tenant_permissions":[]}'
RUTA_ROL="_plugins/_security/api/roles/$ROL"
RUTA_MAPEO="_plugins/_security/api/rolesmapping/$ROL"

CURL="${CURL:-curl}"
OS_CERT="${OS_CERT:-/etc/wazuh-indexer/certs/admin.pem}"
OS_KEY="${OS_KEY:-/etc/wazuh-indexer/certs/admin-key.pem}"
OS_CA="${OS_CA:-/etc/wazuh-indexer/certs/root-ca.pem}"
OS_URL="${OS_URL:-${ENS_OS_URL:-https://127.0.0.1:9200}}"
OS_URL="${OS_URL%/}"

uso() {
  echo "uso: sudo bash create-admin-role.sh [--dry-run] [--mapear <usuario>]..." >&2
}

PRUEBA=0
USUARIOS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      PRUEBA=1
      shift
      ;;
    --mapear)
      if [ -z "${2:-}" ] || [ "${2#-}" != "$2" ]; then
        echo "--mapear necesita un nombre de usuario" >&2
        uso
        exit 1
      fi
      USUARIOS+=("$2")
      shift 2
      ;;
    -h|--help)
      uso
      exit 0
      ;;
    *)
      echo "opción desconocida: $1" >&2
      uso
      exit 1
      ;;
  esac
done

# Hace falta el certificado para cualquier petición, también para leer el mapeo
# en modo prueba. Sin --mapear, el modo prueba no habla con el indexer.
if [ "$PRUEBA" = 0 ] || [ "${#USUARIOS[@]}" -gt 0 ]; then
  if [ ! -r "$OS_CERT" ] || [ ! -r "$OS_KEY" ]; then
    echo "no se puede leer el certificado de administración ($OS_CERT, $OS_KEY)." >&2
    echo "Ejecutar con sudo, o indicar OS_CERT y OS_KEY." >&2
    exit 2
  fi
  if [ ! -r "$OS_CA" ]; then
    echo "no se puede leer la CA del indexer ($OS_CA): sin ella no se comprueba a quién se habla." >&2
    echo "Ejecutar con sudo, o indicar OS_CA." >&2
    exit 2
  fi
fi

# peticion MÉTODO RUTA [CUERPO]: deja el cuerpo de la respuesta en RESPUESTA y
# el código HTTP en CODIGO. Nunca usuario ni contraseña: solo el certificado.
RESPUESTA=
CODIGO=
peticion() {
  local metodo="$1" ruta="$2" cuerpo="${3:-}" salida
  local args=(-sS --cacert "$OS_CA" --cert "$OS_CERT" --key "$OS_KEY" -X "$metodo" -w '\n%{http_code}')
  if [ -n "$cuerpo" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$cuerpo")
  fi
  if ! salida="$("$CURL" "${args[@]}" "$OS_URL/$ruta")"; then
    echo "no se pudo hablar con el indexer en $OS_URL" >&2
    exit 1
  fi
  CODIGO="${salida##*$'\n'}"
  RESPUESTA="${salida%$'\n'*}"
}

# cambio MÉTODO RUTA CUERPO: lo imprime y, salvo en modo prueba, lo envía.
cambio() {
  echo "$1 $2 $3"
  if [ "$PRUEBA" = 1 ]; then
    return 0
  fi
  peticion "$1" "$2" "$3"
  case "$CODIGO" in
    2??) echo "   -> $CODIGO" ;;
    *)
      echo "   -> $CODIGO $RESPUESTA" >&2
      echo "el indexer ha rechazado la petición; no se sigue." >&2
      exit 1
      ;;
  esac
}

if [ "$PRUEBA" = 1 ]; then
  echo "== modo prueba: no se envía ningún cambio"
fi

echo "== rol $ROL"
cambio PUT "$RUTA_ROL" "$CUERPO_ROL"

if [ "${#USUARIOS[@]}" -gt 0 ]; then
  echo "== asignación de $ROL"
  peticion GET "$RUTA_MAPEO"
  case "$CODIGO" in
    200) EXISTE=1 ;;
    404) EXISTE=0 ;;
    *)
      echo "no se pudo leer el mapeo de $ROL: $CODIGO $RESPUESTA" >&2
      exit 1
      ;;
  esac

  # Qué falta: los usuarios pedidos que no están ya, sin repetir. Si el mapeo no
  # existe se crea con ellos (no hay nadie a quien quitar); si existe, se añaden
  # con PATCH `add` al final de `users`, que no toca a los que ya estaban.
  PLAN="$(RESPUESTA="$RESPUESTA" python3 -c '
import json, os, sys

rol, existe, pedidos = sys.argv[1], sys.argv[2] == "1", sys.argv[3:]
actuales = []
if existe:
    datos = json.loads(os.environ.get("RESPUESTA") or "{}")
    actuales = list((datos.get(rol) or {}).get("users") or [])

nuevos, ya = [], []
for usuario in pedidos:
    if usuario in actuales:
        if usuario not in ya:
            ya.append(usuario)
    elif usuario not in nuevos:
        nuevos.append(usuario)

compacto = dict(ensure_ascii=False, separators=(",", ":"))
if not nuevos:
    print("NADA")
    print("")
elif existe:
    print("PATCH")
    print(json.dumps([{"op": "add", "path": "/users/-", "value": u} for u in nuevos], **compacto))
else:
    print("PUT")
    print(json.dumps({"users": nuevos}, **compacto))
print(", ".join(ya))
' "$ROL" "$EXISTE" "${USUARIOS[@]}")"

  METODO="$(printf '%s\n' "$PLAN" | sed -n 1p)"
  CUERPO="$(printf '%s\n' "$PLAN" | sed -n 2p)"
  YA="$(printf '%s\n' "$PLAN" | sed -n 3p)"

  if [ -n "$YA" ]; then
    echo "ya tienen el rol: $YA"
  fi
  if [ "$METODO" != NADA ]; then
    cambio "$METODO" "$RUTA_MAPEO" "$CUERPO"
  fi
fi

if [ "$PRUEBA" = 1 ]; then
  exit 0
fi

# Cómo queda.
peticion GET "$RUTA_MAPEO"
if [ "$CODIGO" = 200 ]; then
  ACTUALES="$(RESPUESTA="$RESPUESTA" python3 -c '
import json, os, sys
datos = json.loads(os.environ.get("RESPUESTA") or "{}")
print(", ".join((datos.get(sys.argv[1]) or {}).get("users") or []))
' "$ROL")"
  echo "usuarios con el rol $ROL: ${ACTUALES:-ninguno}"
else
  echo "el rol $ROL no está asignado a nadie todavía (asignarlo con --mapear <usuario>)"
fi
echo "Los usuarios con $ROL o all_access pueden guardar la configuración ENS."
