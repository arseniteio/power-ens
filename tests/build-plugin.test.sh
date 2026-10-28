#!/usr/bin/env bash
# build-plugin.sh deletes the whole destination before copying: never if the repository is the destination or one is inside the other.
#   bash tests/build-plugin.test.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
failures=0
ok() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; failures=$((failures+1)); }
tree() { mkdir -p "$1/scripts"; echo '{"version":"2.19.5"}' > "$1/package.json"; }
# A fake repository with the real script, in <repo>/config/.
repo_at() { mkdir -p "$1/config"; cp "$ROOT/config/build-plugin.sh" "$1/config/"; echo witness > "$1/WITNESS"; }

# 1. The repository IS the destination: <tree>/plugins/powerEns.
tree "$T/a"; repo_at "$T/a/plugins/powerEns"
r="$(bash "$T/a/plugins/powerEns/config/build-plugin.sh" "$T/a" 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "not building there" && ok "repository = destination: stops with its reason" || fail "repository = destination (rc $rc: $r)"
[ -f "$T/a/plugins/powerEns/WITNESS" ] && ok "and the repository is still whole" || fail "the repository was deleted"

# 2. The same case through a link: the tree is passed by another path.
ln -s "$T/a" "$T/link"
r="$(bash "$T/a/plugins/powerEns/config/build-plugin.sh" "$T/link" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [ -f "$T/a/plugins/powerEns/WITNESS" ] && ok "through a link, the same" || fail "through a link (rc $rc: $r)"

# 3. The tree (and with it the destination) inside the repository.
repo_at "$T/b"; tree "$T/b/osd"
r="$(bash "$T/b/config/build-plugin.sh" "$T/b/osd" 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "not building there" && ok "destination inside the repository: stops" || fail "destination inside the repository (rc $rc: $r)"
[ -f "$T/b/WITNESS" ] && ok "and the repository is still whole" || fail "the repository was deleted"

# 4. The repository inside the destination.
tree "$T/c"; repo_at "$T/c/plugins/powerEns/source"
r="$(bash "$T/c/plugins/powerEns/source/config/build-plugin.sh" "$T/c" 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "inside the destination" && ok "repository inside the destination: stops" || fail "repository inside the destination (rc $rc: $r)"
[ -f "$T/c/plugins/powerEns/source/WITNESS" ] && ok "and the repository is still whole" || fail "the repository was deleted"

# 5. A name that only starts the same is not «inside»: /x/power-ens-repo is not inside /x/power-ens. It reaches the version check (rc 3), it does not stop at the path check (rc 4).
mkdir -p "$T/d"; echo '{"version":"2.19.0"}' > "$T/d/package.json"; mkdir -p "$T/d/scripts"
repo_at "$T/d/plugins/powerEns-repo"
r="$(bash "$T/d/plugins/powerEns-repo/config/build-plugin.sh" "$T/d" 2>&1)"; rc=$?
[ $rc -eq 3 ] && ok "a name prefix does not count as inside" || fail "name prefix (rc $rc: $r)"

[ $failures -eq 0 ] && echo "ALL OK" || { echo "$failures FAILURES"; exit 1; }
