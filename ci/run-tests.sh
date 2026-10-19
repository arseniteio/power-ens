#!/usr/bin/env bash
###############################################################################
# run-tests.sh · the README's tests ("Development" section), with a verdict
#
#   ci/run-tests.sh
#
# Runs what the README loop runs: check-consistency.py, each config/test_*.py,
# each tests/*.test.ts with `npx --yes tsx` and each tests/*.test.sh. The
# README loop only prints OK/FAIL and never fails; this one also shows the tail
# of the output of each failing suite, and exits with an error if any fails.
###############################################################################
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT
total=0
failed=()

suite() {
  local name="$1"
  shift
  total=$((total + 1))
  if "$@" >"$OUTPUT" 2>&1; then
    echo "OK   $name"
  else
    echo "FAIL $name"
    tail -n 40 "$OUTPUT" | sed 's/^/     | /'
    failed+=("$name")
  fi
}

# The consistency check is shown whole, as in the README.
total=$((total + 1))
if python3 tests/check-consistency.py; then
  echo "OK   tests/check-consistency.py"
else
  echo "FAIL tests/check-consistency.py"
  failed+=("tests/check-consistency.py")
fi
echo

for p in config/test_*.py; do
  suite "$p" python3 "$p"
done

for t in tests/*.test.ts; do
  # The CI runner shares its CPU with the lab indexer: heavier suites need more than 180 s there.
  suite "$t" timeout 600 npx --yes tsx "$t"
done
for s in tests/*.test.sh; do
  suite "$s" bash "$s"
done

echo
if [ "${#failed[@]}" -gt 0 ]; then
  echo "${#failed[@]} of $total suites FAIL:"
  printf '  %s\n' "${failed[@]}"
  exit 1
fi
echo "ALL OK: all $total suites pass"
