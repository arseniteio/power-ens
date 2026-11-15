#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: ci/release-notes.sh <version>}"
root="$(cd "$(dirname "$0")/.." && pwd)"

notes="$(awk -v heading="## [$version]" '
  index($0, "## [") == 1 { inside = index($0, heading) == 1; next }
  /^\[[^]]+\]: / { next }
  inside
' "$root/CHANGELOG.md" | sed -e '/./,$!d')"

[ -n "$notes" ] || { echo "CHANGELOG.md has no entry for $version" >&2; exit 1; }
printf '%s\n' "$notes"
