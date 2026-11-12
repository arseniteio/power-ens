#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OSD_SRC="${1:-/opt/power-ens/build}"
DEST="$OSD_SRC/plugins/powerEns"

if [ ! -f "$OSD_SRC/package.json" ] || [ ! -d "$OSD_SRC/scripts" ]; then
  echo "not an OpenSearch Dashboards tree: $OSD_SRC" >&2
  exit 2
fi

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
case "$VERSION_OSD" in
  2.19.5|2.19.6) ;;
  *)
    echo "the tree is $VERSION_OSD; Power ENS builds against 2.19.5 and 2.19.6" >&2
    exit 3
    ;;
esac

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$REPO/package.json" "$REPO/opensearch_dashboards.json" "$REPO/LICENSE" \
      "$REPO/common" "$REPO/public" "$REPO/server" "$DEST/"
if [ -f "$REPO/yarn.lock" ]; then
  cp -a "$REPO/yarn.lock" "$DEST/"
fi

python3 - "$DEST" "$VERSION_OSD" <<'PY'
import json, sys
dest, version = sys.argv[1], sys.argv[2]
for name, set_version in (
    ("package.json", lambda d: d["opensearchDashboards"].update(version=version)),
    ("opensearch_dashboards.json", lambda d: d.update(opensearchDashboardsVersion=version)),
):
    path = f"{dest}/{name}"
    data = json.load(open(path))
    set_version(data)
    json.dump(data, open(path, "w"), indent=2)
PY

export PATH="/usr/share/wazuh-dashboard/node/bin:/root/.nvm/versions/node/v16.20.0/bin:$PATH"
export YARN_IGNORE_ENGINES=1

cd "$DEST"
if [ -f yarn.lock ]; then
  yarn install --non-interactive --frozen-lockfile
else
  yarn install --non-interactive
fi
node ../../scripts/plugin_helpers build --allow-root --opensearch-dashboards-version="$VERSION_OSD"

for zip in "$DEST"/build/*.zip; do
  python3 "$REPO/config/add-license-notices.py" "$zip" "$REPO/LICENSE" "$REPO/config/apache-2.0.txt"
done

ls -1 "$DEST"/build/*.zip
