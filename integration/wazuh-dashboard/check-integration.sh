#!/usr/bin/env bash
set -u

TARGET="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
    echo "ERROR: indica la ruta de plugins/main"
    exit 2
fi

if [ ! -f "$TARGET/package.json" ]; then
    echo "ERROR: no existe package.json en $TARGET"
    exit 3
fi

if ! (cd "$ROOT" && sha256sum -c SHA256SUMS >/dev/null); then
    echo "ERROR: fallo de integridad en los ficheros ENS"
    exit 4
fi

VERSION=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))[\"version\"])" "$TARGET/package.json")
echo "PLUGIN_VERSION=$VERSION"

case "$VERSION" in
    4.14.5|4.14.7) ;;
    *) echo "ERROR: version no validada: $VERSION"; exit 5 ;;
esac

if [ ! -d "$TARGET/public/components/overview/ens" ]; then
    echo "ERROR: el nucleo dashboard/ens no esta presente"
    exit 6
fi

TOTAL=0
OK=0
ERROR=0

for P in "$ROOT"/patches/*.patch; do
    TOTAL=$((TOTAL + 1))
    if patch --dry-run --batch -p1 -d "$TARGET" < "$P" >/dev/null 2>&1; then
        echo "PATCH_APLICABLE $(basename "$P")"
        OK=$((OK + 1))
    else
        echo "PATCH_ERROR $(basename "$P")"
        ERROR=$((ERROR + 1))
    fi
done

CONFLICTS=0
while IFS= read -r REL; do
    if [ -e "$TARGET/$REL" ] && ! cmp -s "$ROOT/files/$REL" "$TARGET/$REL"; then
        echo "FICHERO_CONFLICTIVO $REL"
        CONFLICTS=$((CONFLICTS + 1))
    fi
done < <(cd "$ROOT/files" && find . -type f -printf "%P\n" | sort)

echo "TOTAL_PATCHES=$TOTAL"
echo "PATCHES_APLICABLES=$OK"
echo "PATCHES_ERROR=$ERROR"
echo "CONFLICTOS_FICHEROS=$CONFLICTS"

if [ "$ERROR" -ne 0 ] || [ "$CONFLICTS" -ne 0 ]; then
    echo "RESULTADO=NO_COMPATIBLE"
    exit 7
fi

echo "RESULTADO=COMPATIBLE"
