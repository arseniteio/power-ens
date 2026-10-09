#!/usr/bin/env bash
# Un control ACTIVE sin runbook hace fallar tests/check-consistency.py, salvo
# que esté declarado con su motivo en tests/controls-without-runbook.json.
#   bash tests/runbookless-control.test.sh
#
# Se corre la comprobación DE VERDAD sobre una copia del plugin con un control
# inventado (op.zzz.9, copia del catálogo de op.exp.10) en ACTIVE y sin runbook.
# En la copia no hay runbooks al lado, así que el script falla además por
# otras cosas (sin clon de ningún runbook): aquí solo se mira la comprobación 14.
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fallos=0

ok()    { echo "  ok   $1"; }
falla() { echo "  FALLA $1"; fallos=$((fallos + 1)); }

P="$T/plugin"
mkdir -p "$P"
cp -R "$RAIZ/tests" "$RAIZ/public" "$RAIZ/config" "$RAIZ/agent" "$P/"
sed -e "s/^  id: 'op.exp.10',\$/  id: 'op.zzz.9',/" \
  "$RAIZ/public/ens/catalog/op-exp-10.ts" > "$P/public/ens/catalog/op-zzz-9.ts"

grep -q "^  id: 'op.zzz.9',\$" "$P/public/ens/catalog/op-zzz-9.ts" \
  && grep -q "^  status: 'ACTIVE',\$" "$P/public/ens/catalog/op-zzz-9.ts" \
  || { echo "  FALLA fixture rota: op.zzz.9 no quedó ACTIVE en el catálogo copiado"; exit 1; }

# Declara (o no) op.zzz.9 en la lista, con el motivo que se le pase.
declara() {
  python3 - "$P/tests/controls-without-runbook.json" "$@" <<'PY'
import json, sys
ruta = sys.argv[1]
lista = json.load(open(ruta, encoding="utf-8"))
lista.pop("op.zzz.9", None)
if len(sys.argv) > 2:
    lista["op.zzz.9"] = sys.argv[2]
json.dump(lista, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
}

comprueba() { python3 "$P/tests/check-consistency.py" 2>&1 | sed -n '/=== 14\./,$p'; }

echo "1. ACTIVE, sin runbook y sin declarar: falla"
declara
salida="$(comprueba)"
if printf '%s\n' "$salida" | grep -q '^FALLA  op.zzz.9: ACTIVE sin runbook y sin declarar$'; then
  ok "la comprobación 14 lo señala"
else
  falla "la comprobación 14 no lo señala"; printf '%s\n' "$salida" | sed 's/^/       | /'
fi

echo "2. La reversión: declarado con su motivo, no falla"
declara "control documental de prueba: todo se declara en pantalla"
salida="$(comprueba)"
if printf '%s\n' "$salida" | grep -q '^FALLA  op.zzz.9'; then
  falla "declarado, sigue fallando"; printf '%s\n' "$salida" | sed 's/^/       | /'
else
  ok "declarado, la comprobación 14 lo admite"
fi
if printf '%s\n' "$salida" | grep -q 'sin runbook: op.zzz.9'; then
  ok "y lo nombra entre los que se juzgan sin runbook"
else
  falla "no lo nombra entre los que se juzgan sin runbook"; printf '%s\n' "$salida" | sed 's/^/       | /'
fi

echo "3. Declarado sin motivo: falla"
declara "   "
salida="$(comprueba)"
if printf '%s\n' "$salida" | grep -q '^FALLA  op.zzz.9: declarado sin runbook pero sin motivo$'; then
  ok "un motivo vacío no vale"
else
  falla "un motivo vacío pasa"; printf '%s\n' "$salida" | sed 's/^/       | /'
fi

echo
[ "$fallos" -eq 0 ] && echo "Todas las comprobaciones pasan." || { echo "$fallos comprobación(es) fallan."; exit 1; }
