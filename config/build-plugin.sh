#!/usr/bin/env bash
###############################################################################
# build-plugin.sh · builds Power ENS as a standalone plugin
#
#   sudo bash config/build-plugin.sh [<OpenSearch Dashboards tree>]
#
# Default tree: the guides' (/opt/power-ens/build), an OpenSearch Dashboards 2.19.5 source prepared with
# `yarn osd bootstrap`. Copies the plugin (only what is distributed) to <tree>/plugins/powerEns and builds
# there; it does NOT touch plugins/main or any other plugin of the tree. With the repository yarn.lock the
# dependencies are always the same (--frozen-lockfile: stops if it does not match package.json).
###############################################################################
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OSD_SRC="${1:-/opt/power-ens/build}"
DEST="$OSD_SRC/plugins/powerEns"

if [ ! -f "$OSD_SRC/package.json" ] || [ ! -d "$OSD_SRC/scripts" ]; then
  echo "not an OpenSearch Dashboards tree: $OSD_SRC" >&2
  exit 2
fi

# `rm -rf "$DEST"` deletes the whole destination: if the repository IS the destination, or one is
# inside the other, it would delete the code (or copy the plugin into itself). Real paths are compared,
# links resolved; `os.path.realpath` works even if the destination does not exist yet.
real_path() { python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"; }
REPO_REAL="$(real_path "$REPO")"
DEST_REAL="$(real_path "$DEST")"
case "$DEST_REAL/" in
  "$REPO_REAL/"*)
    echo "the destination ($DEST_REAL) is the repository or inside it ($REPO_REAL): not building there" >&2
    exit 4
    ;;
esac
case "$REPO_REAL/" in
  "$DEST_REAL/"*)
    echo "the repository ($REPO_REAL) is inside the destination ($DEST_REAL), which is deleted whole: not building there" >&2
    exit 4
    ;;
esac

VERSION_OSD="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$OSD_SRC/package.json")"
if [ "$VERSION_OSD" != "2.19.5" ]; then
  echo "the tree is $VERSION_OSD; Power ENS 1.x builds against 2.19.5" >&2
  exit 3
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$REPO/package.json" "$REPO/opensearch_dashboards.json" "$REPO/LICENSE" \
      "$REPO/common" "$REPO/public" "$REPO/server" "$DEST/"
if [ -f "$REPO/yarn.lock" ]; then
  cp -a "$REPO/yarn.lock" "$DEST/"
fi

# node 18.19.0 from the dashboard itself; yarn from the PATH (or root's nvm).
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
