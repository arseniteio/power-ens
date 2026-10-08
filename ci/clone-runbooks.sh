#!/usr/bin/env bash
###############################################################################
# clone-runbooks.sh · clona los runbooks que necesita tests/check-consistency.py
#
#   ci/clone-runbooks.sh <base>
#
# <base> es la carpeta que contiene el plugin (check-consistency.py busca los
# runbooks junto a él). Se clonan con la disposición del servidor (guía 01,
# §10.3): `linux/<control>` en <base>/<control> y
# `zimbra/zimbra-mta/mp.info.6` en <base>/zimbra-mta/mp.info.6.
#
# La lista sale del propio RUNBOOKS de check-consistency.py: un control nuevo
# se da de alta en un solo sitio.
#
# Credenciales: RUNBOOKS_DEPLOY_USER y RUNBOOKS_DEPLOY_TOKEN (token de
# despliegue del grupo, read_repository). RUNBOOKS_URL cambia la base de los
# repositorios; con una base file:// no hacen falta.
###############################################################################
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "uso: ci/clone-runbooks.sh <carpeta que contiene el plugin>" >&2
  exit 1
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$1"
BASE="$(cd "$1" && pwd)"
URL="${RUNBOOKS_URL:-https://gitlab.com/quersystem/ens-controls-runbook}"
URL="${URL%/}"

case "$URL" in
  file://*) ;;
  *)
    faltan=""
    [ -n "${RUNBOOKS_DEPLOY_USER:-}" ] || faltan="$faltan RUNBOOKS_DEPLOY_USER"
    [ -n "${RUNBOOKS_DEPLOY_TOKEN:-}" ] || faltan="$faltan RUNBOOKS_DEPLOY_TOKEN"
    if [ -n "$faltan" ]; then
      echo "ERROR: sin estas variables CI/CD no se pueden clonar los runbooks:$faltan" >&2
      echo "Crea un token de despliegue en el grupo quersystem/ens-controls-runbook" >&2
      echo "(Settings > Repository > Deploy tokens, permiso read_repository) y, en este" >&2
      echo "proyecto (Settings > CI/CD > Variables), las variables RUNBOOKS_DEPLOY_USER" >&2
      echo "(el usuario del token) y RUNBOOKS_DEPLOY_TOKEN (el token, enmascarada)." >&2
      exit 2
    fi
    ;;
esac

# Se lee el diccionario sin ejecutar el script (que corre todas sus
# comprobaciones al importarse).
mapfile -t RUTAS < <(python3 - "$REPO/tests/check-consistency.py" <<'PY'
import ast, sys

arbol = ast.parse(open(sys.argv[1], encoding="utf-8").read())
runbooks = {}
for nodo in arbol.body:
    if isinstance(nodo, ast.Assign) and any(
        isinstance(t, ast.Name) and t.id == "RUNBOOKS" for t in nodo.targets
    ):
        runbooks = ast.literal_eval(nodo.value)
vistas = []
for repos, _xmls in runbooks.values():
    for repo in repos:
        if repo not in vistas:
            vistas.append(repo)
print("\n".join(vistas))
PY
)

if [ "${#RUTAS[@]}" -eq 0 ] || [ -z "${RUTAS[0]}" ]; then
  echo "ERROR: no salió ningún runbook de RUNBOOKS en tests/check-consistency.py" >&2
  exit 3
fi

# El destino quita el subgrupo de plataforma: linux/op.acc.1 -> op.acc.1,
# zimbra/zimbra-mta/mp.info.6 -> zimbra-mta/mp.info.6.
DESTINOS=()
for ruta in "${RUTAS[@]}"; do
  if ! [[ "$ruta" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$ ]] || [[ "/$ruta/" == */../* ]]; then
    echo "ERROR: ruta de runbook no válida en RUNBOOKS: '$ruta'" >&2
    exit 3
  fi
  destino="${ruta#*/}"
  for otro in "${DESTINOS[@]+"${DESTINOS[@]}"}"; do
    if [ "$otro" = "$destino" ]; then
      echo "ERROR: dos runbooks irían a la misma carpeta: $BASE/$destino" >&2
      exit 3
    fi
  done
  if [ "$BASE/$destino" = "$REPO" ]; then
    echo "ERROR: el runbook $ruta iría a la carpeta del propio plugin ($REPO)" >&2
    exit 3
  fi
  DESTINOS+=("$destino")
done

# El token nunca va en la URL (acabaría en .git/config) ni en la línea de
# órdenes: un helper de credenciales lo lee del entorno en el momento. El
# helper vacío de delante anula cualquier otro (p. ej. `store`, que lo
# guardaría en disco).
AYUDANTE='!f() { test "$1" = get || return 0; echo "username=${RUNBOOKS_DEPLOY_USER}"; echo "password=${RUNBOOKS_DEPLOY_TOKEN}"; }; f'
export GIT_TERMINAL_PROMPT=0

echo "Clonando ${#RUTAS[@]} runbooks de $URL en $BASE"
for i in "${!RUTAS[@]}"; do
  ruta="${RUTAS[$i]}"
  destino="$BASE/${DESTINOS[$i]}"
  rm -rf "$destino"
  mkdir -p "$(dirname "$destino")"
  echo "  $ruta -> $destino"
  if ! git -c credential.helper= -c credential.helper="$AYUDANTE" \
        clone --quiet --depth 1 "$URL/$ruta.git" "$destino"; then
    echo "ERROR: no se pudo clonar $URL/$ruta.git" >&2
    exit 4
  fi
done
echo "Runbooks clonados: ${#RUTAS[@]}"
