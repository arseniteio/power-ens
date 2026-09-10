#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$ROOT/check-integration.sh"

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
    echo "ERROR: indica la ruta de plugins/main"
    exit 2
fi

if [ ! -x "$CHECK" ]; then
    echo "ERROR: no existe check-integration.sh"
    exit 3
fi

echo "===== PRECHECK ====="
"$CHECK" "$TARGET"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TARGET%/}-ensfacil-backup-$STAMP"
mkdir -p "$BACKUP"

BASE_FILES=(
  "common/constants.ts"
  "public/components/common/data-source/pattern/alerts/index.ts"
  "public/components/common/modules/modules-defaults.tsx"
  "public/components/common/welcome/components/requirement_vis/lib/get_requirement_alerts.ts"
  "public/components/overview/compliance-table/compliance-table.tsx"
  "public/components/overview/index.ts"
  "public/utils/applications.ts"
  "server/routes/index.ts"
  "server/controllers/index.ts"
)

echo "===== BACKUP ====="

for REL in "${BASE_FILES[@]}"; do
    if [ ! -f "$TARGET/$REL" ]; then
        echo "ERROR: falta archivo base $REL"
        exit 4
    fi

    mkdir -p "$BACKUP/$(dirname "$REL")"
    cp -a "$TARGET/$REL" "$BACKUP/$REL"
    echo "BACKUP_OK $REL"
done

while IFS= read -r REL; do
    if [ -e "$TARGET/$REL" ]; then
        mkdir -p "$BACKUP/$(dirname "$REL")"
        cp -a "$TARGET/$REL" "$BACKUP/$REL"
        echo "BACKUP_EXISTENTE $REL"
    fi
done < <(
    cd "$ROOT/files" &&
    find . -type f -printf "%P\n" | sort
)

echo "BACKUP=$BACKUP"

echo "===== APLICAR PATCHES ====="

for P in "$ROOT"/patches/*.patch; do
    NAME="$(basename "$P")"

    if patch --dry-run --force -p1 -d "$TARGET" \
        < "$P" >/dev/null 2>&1; then

        if patch --dry-run --force -R -p1 -d "$TARGET" \
            < "$P" >/dev/null 2>&1; then
            echo "ERROR: patch ambiguo $NAME"
            exit 5
        fi

        echo "APLICANDO $NAME"

        patch --batch --forward -p1 -d "$TARGET" < "$P"

    elif patch --dry-run --force -R -p1 -d "$TARGET" \
        < "$P" >/dev/null 2>&1; then

        echo "OMITIDO_YA_APLICADO $NAME"

    else
        echo "ERROR: estado incompatible del patch $NAME"
        exit 6
    fi
done

echo "===== COPIAR FICHEROS ENS ====="

while IFS= read -r REL; do
    if [ -e "$TARGET/$REL" ]; then

        if cmp -s "$ROOT/files/$REL" "$TARGET/$REL"; then
            echo "FICHERO_YA_PRESENTE $REL"
            continue
        fi

        echo "ERROR: fichero conflictivo $REL"
        exit 7
    fi

    mkdir -p "$TARGET/$(dirname "$REL")"
    cp -a "$ROOT/files/$REL" "$TARGET/$REL"
    echo "COPIA_OK $REL"

done < <(
    cd "$ROOT/files" &&
    find . -type f -printf "%P\n" | sort
)

echo "===== VERIFICACION ====="

ERROR=0

for P in "$ROOT"/patches/*.patch; do
    if patch --dry-run --force -R -p1 -d "$TARGET" \
        < "$P" >/dev/null 2>&1; then

        echo "PATCH_PRESENTE $(basename "$P")"
    else
        echo "PATCH_NO_VERIFICADO $(basename "$P")"
        ERROR=$((ERROR + 1))
    fi
done

while IFS= read -r REL; do
    if cmp -s "$ROOT/files/$REL" "$TARGET/$REL"; then
        echo "FICHERO_OK $REL"
    else
        echo "FICHERO_ERROR $REL"
        ERROR=$((ERROR + 1))
    fi
done < <(
    cd "$ROOT/files" &&
    find . -type f -printf "%P\n" | sort
)

REJECTS=$(find "$TARGET" -type f -name "*.rej" | wc -l)

echo "REJECTS=$REJECTS"

if [ "$REJECTS" -ne 0 ] || [ "$ERROR" -ne 0 ]; then
    echo "RESULTADO=ERROR"
    exit 10
fi

echo "RESULTADO=INTEGRACION_APLICADA"
echo "BACKUP=$BACKUP"
