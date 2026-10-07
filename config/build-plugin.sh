#!/usr/bin/env bash
###############################################################################
# build-plugin.sh · compila ENSFácil como plugin independiente
#
#   sudo bash config/build-plugin.sh [<árbol de OpenSearch Dashboards>]
#
# El árbol por defecto es el de las guías (/opt/ensfacil/build), un código
# fuente de OpenSearch Dashboards 2.19.5 preparado con `yarn osd bootstrap`.
# Copia el plugin a <árbol>/plugins/ensfacil (solo lo que se distribuye) y
# compila allí; NO toca plugins/main ni ningún otro plugin del árbol.
#
# Con el yarn.lock del repositorio, las dependencias salen siempre las mismas
# (--frozen-lockfile: si no cuadra con package.json, se para).
###############################################################################
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OSD_SRC="${1:-/opt/ensfacil/build}"
DEST="$OSD_SRC/plugins/ensfacil"

if [ ! -f "$OSD_SRC/package.json" ] || [ ! -d "$OSD_SRC/scripts" ]; then
  echo "no es un árbol de OpenSearch Dashboards: $OSD_SRC" >&2
  exit 2
fi

VERSION_OSD="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$OSD_SRC/package.json")"
if [ "$VERSION_OSD" != "2.19.5" ]; then
  echo "el árbol es $VERSION_OSD; ENSFácil 1.x se compila contra 2.19.5" >&2
  exit 3
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$REPO/package.json" "$REPO/opensearch_dashboards.json" "$REPO/LICENSE" \
      "$REPO/common" "$REPO/public" "$REPO/server" "$DEST/"
if [ -f "$REPO/yarn.lock" ]; then
  cp -a "$REPO/yarn.lock" "$DEST/"
fi

# node 18.19.0 del propio dashboard; yarn, el del PATH (o el de nvm de root).
export PATH="/usr/share/wazuh-dashboard/node/bin:/root/.nvm/versions/node/v16.20.0/bin:$PATH"
export YARN_IGNORE_ENGINES=1

cd "$DEST"
if [ -f yarn.lock ]; then
  yarn install --non-interactive --frozen-lockfile
else
  yarn install --non-interactive
fi
node ../../scripts/plugin_helpers build --allow-root --opensearch-dashboards-version=2.19.5

ls -1 "$DEST"/build/*.zip
