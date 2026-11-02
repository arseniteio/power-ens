#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

failed=()

run() {
  local name="$1"
  shift
  if "$@"; then
    echo "OK   $name"
  else
    echo "FAIL $name"
    failed+=("$name")
  fi
}

run "TypeScript suites" npx --yes tsx --test 'tests/**/*.test.ts'
for test in config/test_*.py; do
  run "$test" python3 "$test"
done
for test in tests/scripts/*.test.sh; do
  run "$test" bash "$test"
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "${#failed[@]} FAIL: ${failed[*]}"
  exit 1
fi
echo "all tests pass"
