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
[ $fallos -eq 0 ] && echo "TODO OK" || { echo "$fallos FALLOS"; exit 1; }
