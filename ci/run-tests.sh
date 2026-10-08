#!/usr/bin/env bash
###############################################################################
# run-tests.sh · las pruebas del README (sección «Desarrollo»), con veredicto
#
#   ci/run-tests.sh
#
# Corre lo mismo que el bucle del README: check-consistency.py, cada
# tests/*.test.ts con `npx --yes tsx` y cada tests/*.test.sh. El bucle del
# README solo imprime OK/FAIL y nunca falla; aquí se enseña además el final de
# la salida de cada suite que falla, y se sale con error si falla alguna.
###############################################################################
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 1

SALIDA="$(mktemp)"
trap 'rm -f "$SALIDA"' EXIT
total=0
fallidas=()

suite() {
  local nombre="$1"
  shift
  total=$((total + 1))
  if "$@" >"$SALIDA" 2>&1; then
    echo "OK   $nombre"
  else
    echo "FAIL $nombre"
    tail -n 40 "$SALIDA" | sed 's/^/     | /'
    fallidas+=("$nombre")
  fi
}

# La comprobación de coherencia se enseña entera, como en el README.
total=$((total + 1))
if python3 tests/check-consistency.py; then
  echo "OK   tests/check-consistency.py"
else
  echo "FAIL tests/check-consistency.py"
  fallidas+=("tests/check-consistency.py")
fi
echo

for t in tests/*.test.ts; do
  suite "$t" timeout 180 npx --yes tsx "$t"
done
for s in tests/*.test.sh; do
  suite "$s" bash "$s"
done

echo
if [ "${#fallidas[@]}" -gt 0 ]; then
  echo "${#fallidas[@]} de $total suites FALLAN:"
  printf '  %s\n' "${fallidas[@]}"
  exit 1
fi
echo "las $total suites pasan"
