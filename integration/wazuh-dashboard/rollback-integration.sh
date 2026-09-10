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
  "public/components/common/data-grid/use-data-grid-columns.ts"
  "public/components/common/modules/modules-defaults.tsx"
  "public/components/common/welcome/components/requirement_vis/lib/get_requirement_alerts.ts"
  "public/components/overview/compliance-table/compliance-table.tsx"
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

    mkdir -p "$TARGET/$(dirname "$REL")"
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
done < <(
    cd "$ROOT/files" &&
    find . -type f -printf "%P\n" | sort
)

echo "===== ELIMINAR DIRECTORIOS CREADOS POR APPLY ====="

ERROR=0
CREATED_DIRS="$BACKUP/.ensfacil-created-dirs"

if [ -f "$CREATED_DIRS" ]; then
    while IFS= read -r REL; do
        [ -n "$REL" ] || continue

        if [ ! -d "$TARGET/$REL" ]; then
            echo "DIRECTORIO_AUSENTE_OK $REL"
            continue
        fi

        if rmdir "$TARGET/$REL" 2>/dev/null; then
            echo "DIRECTORIO_ELIMINADO $REL"
        else
            echo "DIRECTORIO_NO_VACIO $REL"
            ERROR=$((ERROR + 1))
        fi
    done < <(
        awk -F/ '{print NF "\t" $0}' "$CREATED_DIRS" |
        sort -rn -k1,1 |
        cut -f2-
    )
else
    echo "DIRECTORIOS_CREADOS_MANIFEST=NO_PRESENTE"
fi

echo "===== VERIFICACION ====="

for REL in "${BASE_FILES[@]}"; do
    if cmp -s "$BACKUP/$REL" "$TARGET/$REL"; then
        echo "BASE_OK $REL"
    else
        echo "BASE_ERROR $REL"
        ERROR=$((ERROR + 1))
    fi
done

while IFS= read -r REL; do
    if [ -f "$BACKUP/$REL" ]; then
        if cmp -s "$BACKUP/$REL" "$TARGET/$REL"; then
            echo "EXTERNO_RESTAURADO_OK $REL"
        else
            echo "EXTERNO_RESTAURADO_ERROR $REL"
            ERROR=$((ERROR + 1))
        fi
    else
        if [ ! -e "$TARGET/$REL" ]; then
            echo "EXTERNO_ELIMINADO_OK $REL"
        else
            echo "EXTERNO_ELIMINADO_ERROR $REL"
            ERROR=$((ERROR + 1))
        fi
    fi
done < <(
    cd "$ROOT/files" &&
    find . -type f -printf "%P\n" | sort
)

if [ "$ERROR" -ne 0 ]; then
    echo "RESULTADO=ROLLBACK_ERROR"
    exit 10
fi

echo "RESULTADO=ROLLBACK_OK"
