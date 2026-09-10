#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
BACKUP="${2:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
    echo "ERROR: indica la ruta de plugins/main"
    exit 2
fi

if [ -z "$BACKUP" ] || [ ! -d "$BACKUP" ]; then
    echo "ERROR: indica un backup valido"
    exit 3
fi

BASE_FILES=(
  "common/constants.ts"
  "public/components/common/data-source/pattern/alerts/index.ts"
  "public/components/common/modules/modules-defaults.tsx"
  "public/components/common/welcome/components/requirement_vis/lib/get_requirement_alerts.ts"
  "public/components/overview/index.ts"
  "public/utils/applications.ts"
  "server/routes/index.ts"
  "server/controllers/index.ts"
)

echo "===== RESTAURAR ARCHIVOS BASE ====="
for REL in "${BASE_FILES[@]}"; do
    if [ ! -f "$BACKUP/$REL" ]; then
        echo "ERROR: falta en backup $REL"
        exit 4
    fi
    cp -a "$BACKUP/$REL" "$TARGET/$REL"
    echo "RESTAURADO $REL"
done

echo "===== RESTAURAR FICHEROS ENS EXTERNOS ====="
while IFS= read -r REL; do
    if [ -f "$BACKUP/$REL" ]; then
        mkdir -p "$TARGET/$(dirname "$REL")"
        cp -a "$BACKUP/$REL" "$TARGET/$REL"
        echo "RESTAURADO $REL"
    else
        rm -f "$TARGET/$REL"
        echo "ELIMINADO $REL"
    fi
done < <(cd "$ROOT/files" && find . -type f -printf "%P\n" | sort)

echo "===== VERIFICACION ====="
ERROR=0
for REL in "${BASE_FILES[@]}"; do
    if cmp -s "$BACKUP/$REL" "$TARGET/$REL"; then
        echo "BASE_OK $REL"
    else
        echo "BASE_ERROR $REL"
        ERROR=$((ERROR + 1))
    fi
done

if [ "$ERROR" -ne 0 ]; then
    echo "RESULTADO=ROLLBACK_ERROR"
    exit 10
fi

echo "RESULTADO=ROLLBACK_OK"
