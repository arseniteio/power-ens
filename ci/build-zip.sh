#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: ci/build-zip.sh <osd-version>   (2.19.5 for Wazuh 4.14.7, 2.19.6 for Wazuh 4.14.8 and 4.14.9)" >&2
  exit 1
}

[ $# -eq 1 ] || usage
case "$1" in
  2.19.5) ref=v4.14.7 ;;
  2.19.6) ref=v4.14.8 ;;
  *) usage ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
image="power-ens-osd-builder:$1"

if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker build --build-arg WAZUH_DASHBOARD_REF="$ref" -f "$root/ci/osd-builder.Dockerfile" -t "$image" "$root/ci"
fi

mkdir -p "$root/dist"
docker run --rm -v "$root:/src:ro" -v "$root/dist:/dist" "$image" \
  bash -c "bash /src/config/build-plugin.sh /osd && cp /osd/plugins/powerEns/build/powerEns-$1.zip /dist/"
echo "dist/powerEns-$1.zip"
