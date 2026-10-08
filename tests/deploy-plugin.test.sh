#!/usr/bin/env bash
# deploy-plugin.sh decide QUÉ plugin retira mirando el zip, y nunca otro.
#   bash tests/deploy-plugin.test.sh
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fallos=0
zip_de() { mkdir -p "$T/$1/opensearch-dashboards/$2"; echo x > "$T/$1/opensearch-dashboards/$2/package.json"; (cd "$T/$1" && zip -qr "$T/$1.zip" opensearch-dashboards); }
espera() { local r; r="$(bash "$RAIZ/config/deploy-plugin.sh" --solo-id "$2" 2>&1)"; local rc=$?
  if [ "$1" = ERROR ]; then [ $rc -ne 0 ] && echo "  ok   $3" || { echo "  FALLA $3 (rc 0, salió: $r)"; fallos=$((fallos+1)); }
  else [ "$r" = "$1" ] && echo "  ok   $3" || { echo "  FALLA $3 (salió: $r)"; fallos=$((fallos+1)); }; fi; }
zip_de a ensfacil; zip_de b wazuh; zip_de c otro
espera ensfacil "$T/a.zip" "zip de ENSFácil -> ensfacil"
espera wazuh "$T/b.zip" "zip del integrado -> wazuh"
espera ERROR "$T/c.zip" "un plugin que no es ninguno de los dos se rechaza"
espera ERROR "$T/no-existe.zip" "sin zip, error"
# Un zip de verdad (con node_modules) lista miles de entradas: si awk corta la
# tubería antes de que unzip acabe, SIGPIPE + pipefail = rc 141 sin mensaje.
mkdir -p "$T/d/opensearch-dashboards/ensfacil/node_modules/paquete"
for i in $(seq 1 3000); do : > "$T/d/opensearch-dashboards/ensfacil/node_modules/paquete/fichero-con-un-nombre-largo-$i.js"; done
(cd "$T/d" && zip -qr "$T/d.zip" opensearch-dashboards)
espera ensfacil "$T/d.zip" "zip grande (miles de entradas) -> ensfacil"

# Los argumentos: exactamente un zip (o `--solo-id <zip>`). Todos estos casos
# salen con el error de uso ANTES de tocar nada. `systemctl` y `sudo` van
# sustituidos por unos que fallan con 99: si el script llegara a ellos, la
# prueba lo vería y no se pararía ningún dashboard de verdad.
mkdir -p "$T/bin"
for c in systemctl sudo; do printf '#!/bin/sh\necho "TOCADO: %s $*" >&2\nexit 99\n' "$c" > "$T/bin/$c"; chmod +x "$T/bin/$c"; done
rechaza() { local d="$1"; shift; local r; r="$(PATH="$T/bin:$PATH" OSD="$T/osd" bash "$RAIZ/config/deploy-plugin.sh" "$@" 2>&1)"; local rc=$?
  [ $rc -eq 1 ] && echo "$r" | grep -q "uso:" && echo "  ok   $d" || { echo "  FALLA $d (rc $rc: $r)"; fallos=$((fallos+1)); }; }
rechaza "sin argumentos" 
rechaza "dos zips" "$T/a.zip" "$T/b.zip"
rechaza "--solo-id sin zip" --solo-id
rechaza "--solo-id con dos zips" --solo-id "$T/a.zip" "$T/b.zip"
rechaza "una opción desconocida" --forzar "$T/a.zip"
rechaza "una opción en lugar del zip" -x
rechaza "un zip que no existe" "$T/no-existe.zip"
# Ruta relativa: se resuelve contra el directorio desde el que se llama.
r="$(cd "$T" && bash "$RAIZ/config/deploy-plugin.sh" --solo-id a.zip 2>&1)"
[ "$r" = ensfacil ] && echo "  ok   zip con ruta relativa" || { echo "  FALLA zip con ruta relativa (salió: $r)"; fallos=$((fallos+1)); }
# Lo que no se puede ejecutar aquí (systemctl, el instalador), al menos que
# esté escrito: la ruta absoluta en `file://`, la vuelta atrás si la
# instalación falla y el error si el dashboard no queda activo.
S="$RAIZ/config/deploy-plugin.sh"
grep -q 'ZIP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"' "$S" && grep -q 'install "file://$ZIP"' "$S" && echo "  ok   file:// con la ruta absoluta" || { echo "  FALLA file:// con la ruta absoluta"; fallos=$((fallos+1)); }
grep -q 'if ! sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" install' "$S" && grep -q 'sudo tar -xzf $RESPALDO -C $OSD' "$S" && grep -q 'sudo systemctl start wazuh-dashboard' "$S" && echo "  ok   si la instalación falla, cómo volver" || { echo "  FALLA si la instalación falla, cómo volver"; fallos=$((fallos+1)); }
grep -q 'if \[ "$ESTADO" != "active" \]; then' "$S" && echo "  ok   dashboard no activo al final: error" || { echo "  FALLA dashboard no activo al final"; fallos=$((fallos+1)); }

[ $fallos -eq 0 ] && echo "TODO OK" || { echo "$fallos FALLOS"; exit 1; }
