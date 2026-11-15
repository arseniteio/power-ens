#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
failures=0
ok() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; failures=$((failures+1)); }

mkdir -p "$T/ci" && cp "$ROOT/ci/release-notes.sh" "$T/ci/"
cat > "$T/CHANGELOG.md" <<'MD'
# Changelog

## [Unreleased]

## [1.1.0] - 2026-12-01

### Fixed

- Second fix.

## [1.0.0] - 2026-11-13

First release.

[1.1.0]: https://example.com/v1.1.0
[1.0.0]: https://example.com/v1.0.0
MD

r="$(bash "$T/ci/release-notes.sh" 1.1.0 2>&1)"; rc=$?
[ $rc -eq 0 ] && [ "$r" = "$(printf '### Fixed\n\n- Second fix.')" ] && ok "prints only the section of the version" || fail "section of 1.1.0 (rc $rc: $r)"

r="$(bash "$T/ci/release-notes.sh" 1.0.0 2>&1)"; rc=$?
[ $rc -eq 0 ] && [ "$r" = "First release." ] && ok "the last section leaves out the link definitions" || fail "section of 1.0.0 (rc $rc: $r)"

r="$(bash "$T/ci/release-notes.sh" 1.0 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "no entry for 1.0" && ok "a version prefix is not an entry" || fail "version prefix (rc $rc: $r)"

r="$(bash "$T/ci/release-notes.sh" 2.0.0 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "no entry for 2.0.0" && ok "a missing version stops the release" || fail "missing version (rc $rc: $r)"

[ $failures -eq 0 ] && echo "ALL OK" || { echo "$failures FAILURES"; exit 1; }
