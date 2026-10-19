#!/usr/bin/env bash
# build-plugin.sh borra el destino entero antes de copiar: nunca si el
# repositorio es el destino o uno está dentro del otro.
#   bash tests/build-plugin.test.sh
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fallos=0
ok() { echo "  ok   $1"; }
falla() { echo "  FALLA $1"; fallos=$((fallos+1)); }
arbol() { mkdir -p "$1/scripts"; echo '{"version":"2.19.5"}' > "$1/package.json"; }
# Un repositorio de mentira con el script de verdad, en <repo>/config/.
repo_en() { mkdir -p "$1/config"; cp "$RAIZ/config/build-plugin.sh" "$1/config/"; echo testigo > "$1/TESTIGO"; }

# 1. El repositorio ES el destino: <árbol>/plugins/ensfacil.
arbol "$T/a"; repo_en "$T/a/plugins/ensfacil"
r="$(bash "$T/a/plugins/ensfacil/config/build-plugin.sh" "$T/a" 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "not building there" && ok "repositorio = destino: se para con su motivo" || falla "repositorio = destino (rc $rc: $r)"
[ -f "$T/a/plugins/ensfacil/TESTIGO" ] && ok "y el repositorio sigue entero" || falla "el repositorio se ha borrado"

# 2. El mismo caso por un enlace: el árbol se pasa por otra ruta.
ln -s "$T/a" "$T/enlace"
r="$(bash "$T/a/plugins/ensfacil/config/build-plugin.sh" "$T/enlace" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [ -f "$T/a/plugins/ensfacil/TESTIGO" ] && ok "por un enlace, igual" || falla "por un enlace (rc $rc: $r)"

# 3. El árbol (y con él el destino) dentro del repositorio.
repo_en "$T/b"; arbol "$T/b/osd"
r="$(bash "$T/b/config/build-plugin.sh" "$T/b/osd" 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "not building there" && ok "destino dentro del repositorio: se para" || falla "destino dentro del repositorio (rc $rc: $r)"
[ -f "$T/b/TESTIGO" ] && ok "y el repositorio sigue entero" || falla "el repositorio se ha borrado"

# 4. El repositorio inside the destination.
arbol "$T/c"; repo_en "$T/c/plugins/ensfacil/fuente"
r="$(bash "$T/c/plugins/ensfacil/fuente/config/build-plugin.sh" "$T/c" 2>&1)"; rc=$?
[ $rc -ne 0 ] && echo "$r" | grep -q "inside the destination" && ok "repositorio dentro del destino: se para" || falla "repositorio dentro del destino (rc $rc: $r)"
[ -f "$T/c/plugins/ensfacil/fuente/TESTIGO" ] && ok "y el repositorio sigue entero" || falla "el repositorio se ha borrado"

# 5. Un nombre que solo empieza igual no es «dentro»: /x/ensfacil-repo no está
#    dentro de /x/ensfacil. Llega hasta la comprobación de versión (rc 3), no
#    se para en la de rutas (rc 4).
mkdir -p "$T/d"; echo '{"version":"2.19.0"}' > "$T/d/package.json"; mkdir -p "$T/d/scripts"
repo_en "$T/d/plugins/ensfacil-repo"
r="$(bash "$T/d/plugins/ensfacil-repo/config/build-plugin.sh" "$T/d" 2>&1)"; rc=$?
[ $rc -eq 3 ] && ok "un prefijo de nombre no cuenta como dentro" || falla "prefijo de nombre (rc $rc: $r)"

[ $fallos -eq 0 ] && echo "TODO OK" || { echo "$fallos FALLOS"; exit 1; }
