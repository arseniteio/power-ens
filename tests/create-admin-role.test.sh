#!/usr/bin/env bash
# create-admin-role.sh crea el rol ensfacil_admin y lo asigna sin quitar a nadie.
#   bash tests/create-admin-role.test.sh
#
# El indexer es un curl falso: apunta cada petición (método, ruta y cuerpo) y
# contesta al mapeo lo que diga FALSO_MAPEO / FALSO_MAPEO_CODIGO.
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fallos=0

ROL_PUT='PUT _plugins/_security/api/roles/ensfacil_admin {"description":"ENSFácil: puede cambiar la configuración ENS y ver su historial","cluster_permissions":[],"index_permissions":[],"tenant_permissions":[]}'
MAPEO='_plugins/_security/api/rolesmapping/ensfacil_admin'

cat > "$T/curl" <<'FALSO'
#!/usr/bin/env bash
metodo=GET; url=; datos=
printf '%s\n' "$*" >> "$REGISTRO.args"
while [ $# -gt 0 ]; do
  case "$1" in
    -X) metodo="$2"; shift 2 ;;
    --data-binary|--data|-d) datos="$2"; shift 2 ;;
    https://*|http://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
ruta="${url#*://}"; ruta="${ruta#*/}"
printf '%s %s %s\n' "$metodo" "$ruta" "$datos" >> "$REGISTRO"
case "$metodo $ruta" in
  "GET _plugins/_security/api/rolesmapping/ensfacil_admin") printf '%s\n%s' "$FALSO_MAPEO" "$FALSO_MAPEO_CODIGO" ;;
  "PUT _plugins/_security/api/roles/ensfacil_admin") printf '{"status":"OK"}\n%s' "${FALSO_ROL_CODIGO:-200}" ;;
  *) printf '{"status":"OK"}\n200' ;;
esac
FALSO
chmod +x "$T/curl"
: > "$T/admin.pem"; : > "$T/admin-key.pem"; : > "$T/root-ca.pem"

CON_ANA='{"ensfacil_admin":{"hosts":[],"users":["ana"],"reserved":false,"hidden":false,"backend_roles":[],"and_backend_roles":[]}}'
CON_RSIS='{"ensfacil_admin":{"hosts":[],"users":["ana","rsis"],"reserved":false,"hidden":false,"backend_roles":[],"and_backend_roles":[]}}'
NO_EXISTE='{"status":"NOT_FOUND","message":"Resource '"'"'ensfacil_admin'"'"' not found."}'

# corre MAPEO CODIGO args... -> deja la salida en $T/salida, el código en $rc y
# lo que llegó al indexer en $T/registro
corre() {
  local mapeo="$1" codigo="$2"; shift 2
  : > "$T/registro"; : > "$T/registro.args"
  REGISTRO="$T/registro" FALSO_MAPEO="$mapeo" FALSO_MAPEO_CODIGO="$codigo" \
    CURL="$T/curl" OS_CERT="$T/admin.pem" OS_KEY="$T/admin-key.pem" OS_CA="$T/root-ca.pem" \
    bash "$RAIZ/config/create-admin-role.sh" "$@" > "$T/salida" 2>&1
  rc=$?
}
# las peticiones que cambian algo, tal como las imprime el script
impresas() { grep -E '^(PUT|PATCH|POST|DELETE) ' "$T/salida"; }
# las que llegaron al indexer y cambian algo
enviadas() { grep -E '^(PUT|PATCH|POST|DELETE) ' "$T/registro"; }
compara() {  # descripción, esperado, obtenido
  if [ "$2" = "$3" ]; then echo "  ok   $1"
  else echo "  FALLA $1"; echo "        esperado: $2"; echo "        obtenido: $3"; fallos=$((fallos+1)); fi
}

echo "· --dry-run --mapear rsis, el mapeo existe con ana"
corre "$CON_ANA" 200 --dry-run --mapear rsis
compara "sale bien" 0 "$rc"
compara "imprime el PUT del rol y el PATCH que añade rsis" \
  "$ROL_PUT"$'\n'"PATCH $MAPEO [{\"op\":\"add\",\"path\":\"/users/-\",\"value\":\"rsis\"}]" "$(impresas)"
compara "no envía ningún cambio" "" "$(enviadas)"

echo "· --dry-run sin --mapear"
corre "$CON_ANA" 200 --dry-run
compara "sale bien" 0 "$rc"
compara "imprime solo el PUT del rol" "$ROL_PUT" "$(impresas)"
compara "no habla con el indexer" "" "$(cat "$T/registro")"

echo "· --dry-run --mapear rsis, el mapeo no existe"
corre "$NO_EXISTE" 404 --dry-run --mapear rsis
compara "sale bien" 0 "$rc"
compara "crea el mapeo con rsis" \
  "$ROL_PUT"$'\n'"PUT $MAPEO {\"users\":[\"rsis\"]}" "$(impresas)"

echo "· --dry-run --mapear rsis, rsis ya tiene el rol"
corre "$CON_RSIS" 200 --dry-run --mapear rsis
compara "no lo vuelve a añadir" "$ROL_PUT" "$(impresas)"
compara "lo dice" 1 "$(grep -c 'rsis' "$T/salida")"

echo "· de verdad, --mapear rsis --mapear ana --mapear rsis, el mapeo existe con ana"
corre "$CON_ANA" 200 --mapear rsis --mapear ana --mapear rsis
compara "sale bien" 0 "$rc"
compara "envía el PUT del rol y un PATCH que solo añade rsis, una vez" \
  "$ROL_PUT"$'\n'"PATCH $MAPEO [{\"op\":\"add\",\"path\":\"/users/-\",\"value\":\"rsis\"}]" "$(enviadas)"
compara "nunca quita ni sustituye usuarios" 0 "$(grep -cE '"op":"(remove|replace)"' "$T/registro")"
compara "con el certificado" 4 "$(grep -c -- "--cert $T/admin.pem --key $T/admin-key.pem" "$T/registro.args")"
compara "sin usuario ni contraseña en la línea de órdenes" 0 "$(grep -cE -- '(^| )(-u|--user) ' "$T/registro.args")"
compara "comprueba el certificado del indexer con su CA" 4 "$(grep -c -- "--cacert $T/root-ca.pem" "$T/registro.args")"
compara "nunca sin comprobarlo (-k / --insecure)" 0 "$(grep -cE -- '(^| )(-k|--insecure)( |$)' "$T/registro.args")"

echo "· de verdad, sin --mapear"
corre "$CON_ANA" 200
compara "sale bien" 0 "$rc"
compara "envía solo el PUT del rol" "$ROL_PUT" "$(enviadas)"
compara "dice quién tiene el rol" 1 "$(grep -c 'ana' "$T/salida")"

echo "· el indexer rechaza el rol"
FALSO_ROL_CODIGO=403; export FALSO_ROL_CODIGO
corre "$CON_ANA" 200 --mapear rsis
unset FALSO_ROL_CODIGO
compara "sale con error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compara "no toca el mapeo" "$ROL_PUT" "$(enviadas)"

echo "· errores de uso"
corre "$CON_ANA" 200 --mapear
compara "--mapear sin usuario es un error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compara "y no envía nada" "" "$(cat "$T/registro")"
corre "$CON_ANA" 200 --otra
compara "una opción desconocida es un error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
: > "$T/registro"
REGISTRO="$T/registro" CURL="$T/curl" OS_CERT="$T/no-existe.pem" OS_KEY="$T/admin-key.pem" \
  bash "$RAIZ/config/create-admin-role.sh" > "$T/salida" 2>&1; rc=$?
compara "sin certificado legible es un error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compara "y no envía nada" "" "$(cat "$T/registro")"
: > "$T/registro"
REGISTRO="$T/registro" CURL="$T/curl" OS_CERT="$T/admin.pem" OS_KEY="$T/admin-key.pem" OS_CA="$T/no-existe-ca.pem" \
  bash "$RAIZ/config/create-admin-role.sh" > "$T/salida" 2>&1; rc=$?
compara "sin CA legible es un error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compara "que lo dice" 1 "$(grep -c 'indexer CA' "$T/salida")"
compara "y no envía nada" "" "$(cat "$T/registro")"
echo "· por defecto"
compara "la CA del indexer de Wazuh" 1 "$(grep -c 'OS_CA="${OS_CA:-/etc/wazuh-indexer/certs/root-ca.pem}"' "$RAIZ/config/create-admin-role.sh")"
compara "y 127.0.0.1, el nombre de su certificado" 1 "$(grep -c 'ENS_OS_URL:-https://127.0.0.1:9200' "$RAIZ/config/create-admin-role.sh")"

[ $fallos -eq 0 ] && echo "TODO OK" || { echo "$fallos FALLOS"; exit 1; }
