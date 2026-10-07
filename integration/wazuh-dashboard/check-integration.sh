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

VERSION=$(
    python3 -c \
    'import json,sys; print(json.load(open(sys.argv[1]))["version"])' \
    "$TARGET/package.json"
)

echo "PLUGIN_VERSION=$VERSION"

case "$VERSION" in
    4.14.5|4.14.7) ;;
    *)
        echo "ERROR: version no validada: $VERSION"
        exit 5
        ;;
esac

if [ ! -d "$TARGET/public/components/overview/ens" ]; then
    echo "ERROR: el nucleo dashboard/ens no esta presente"
    exit 6
fi

# La vista de cumplimiento importa el catálogo de requisitos, que no es un
# fichero de la integración: viaja con el núcleo y se copia con él.
if [ ! -f "$TARGET/common/compliance-requirements/ens-requirements.ts" ]; then
    echo "ERROR: falta common/compliance-requirements/ens-requirements.ts (se copia de dashboard/ens-requirements.ts)"
    exit 8
fi

TOTAL=0
APLICABLE=0
APLICADO=0
AMBIGUO=0
CONFLICTO=0

for P in "$ROOT"/patches/*.patch; do
    TOTAL=$((TOTAL + 1))

    patch --dry-run --force -p1 -d "$TARGET" \
        < "$P" >/dev/null 2>&1
    FORWARD_RC=$?

    patch --dry-run --force -R -p1 -d "$TARGET" \
        < "$P" >/dev/null 2>&1
    REVERSE_RC=$?

    if [ "$FORWARD_RC" -eq 0 ] && [ "$REVERSE_RC" -ne 0 ]; then
        echo "PATCH_APLICABLE $(basename "$P")"
        APLICABLE=$((APLICABLE + 1))

    elif [ "$FORWARD_RC" -ne 0 ] && [ "$REVERSE_RC" -eq 0 ]; then
        echo "PATCH_YA_APLICADO $(basename "$P")"
        APLICADO=$((APLICADO + 1))

    elif [ "$FORWARD_RC" -eq 0 ] && [ "$REVERSE_RC" -eq 0 ]; then
        echo "PATCH_AMBIGUO $(basename "$P")"
        AMBIGUO=$((AMBIGUO + 1))

    else
        echo "PATCH_CONFLICTO $(basename "$P")"
        CONFLICTO=$((CONFLICTO + 1))
    fi
done

FILES_TOTAL=0
FILES_AUSENTES=0
FILES_PRESENTES=0
FILES_CONFLICTO=0

while IFS= read -r REL; do
    FILES_TOTAL=$((FILES_TOTAL + 1))

    if [ ! -e "$TARGET/$REL" ]; then
        echo "FICHERO_AUSENTE $REL"
        FILES_AUSENTES=$((FILES_AUSENTES + 1))

    elif cmp -s "$ROOT/files/$REL" "$TARGET/$REL"; then
        echo "FICHERO_YA_PRESENTE $REL"
        FILES_PRESENTES=$((FILES_PRESENTES + 1))

    else
        echo "FICHERO_CONFLICTIVO $REL"
        FILES_CONFLICTO=$((FILES_CONFLICTO + 1))
    fi
done < <(
    cd "$ROOT/files" &&
    find . -type f -printf "%P\n" | sort
)

echo "TOTAL_PATCHES=$TOTAL"
echo "PATCHES_APLICABLES=$APLICABLE"
echo "PATCHES_YA_APLICADOS=$APLICADO"
echo "PATCHES_AMBIGUOS=$AMBIGUO"
echo "PATCHES_CONFLICTO=$CONFLICTO"

echo "TOTAL_FICHEROS=$FILES_TOTAL"
echo "FICHEROS_AUSENTES=$FILES_AUSENTES"
echo "FICHEROS_YA_PRESENTES=$FILES_PRESENTES"
echo "CONFLICTOS_FICHEROS=$FILES_CONFLICTO"

if [ "$AMBIGUO" -ne 0 ] ||
   [ "$CONFLICTO" -ne 0 ] ||
   [ "$FILES_CONFLICTO" -ne 0 ]; then

    echo "RESULTADO=NO_COMPATIBLE"
    exit 7
fi

echo "RESULTADO=COMPATIBLE"
