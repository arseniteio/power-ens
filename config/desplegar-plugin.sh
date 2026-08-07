#!/usr/bin/env bash
###############################################################################
# desplegar-plugin.sh · instala el plugin Y hace que el navegador lo vea
#
#   sudo bash desplegar-plugin.sh /ruta/al/wazuh-2.19.5.zip
#
# POR QUÉ EXISTE, Y POR QUÉ EL ÚLTIMO PASO NO ES OPCIONAL.
#
# Instalar el plugin NO basta para que nadie vea el cambio. OpenSearch
# Dashboards sirve los bundles en
#
#     /{buildHash}/bundles/plugin/wazuh/wazuh.chunk.N.js
#
# y ese `buildHash` sale del `build.number` del package.json DEL DASHBOARD, no
# del plugin (`src/optimize/optimize_mixin.js`: `buildHash:
# env.packageInfo.buildNum.toString()`). Reinstalar el plugin cambia el fichero
# en disco y NO cambia la URL. Como esos bundles se sirven pensados para ser
# inmutables por buildHash, el navegador tiene el viejo cacheado y no lo vuelve
# a pedir: ni con Ctrl+Shift+R, porque para el navegador esa URL ya está
# resuelta y no ha caducado.
#
# El 05, el 06 y el 07 de agosto de 2026 se dio por desplegado tres veces algo
# que el usuario no estaba viendo. Se le dijo «recarga forzando» y no era
# suficiente: el problema no era la recarga, era la URL.
#
# Subir el `build.number` cambia la URL de TODOS los bundles y obliga al
# navegador a pedirlos de nuevo. Cuesta una primera carga más lenta, una vez.
###############################################################################
set -euo pipefail

ZIP="${1:-}"
OSD="${OSD:-/usr/share/wazuh-dashboard}"

if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "uso: sudo bash desplegar-plugin.sh /ruta/al/wazuh-2.19.5.zip" >&2
  exit 1
fi

echo "== 1/5 · parando el dashboard"
systemctl stop wazuh-dashboard

echo "== 2/5 · retirando el plugin anterior"
# RUTAS EXACTAS. Nunca un comodín `wazuh*`: se llevaría por delante `wazuhCore`
# y `wazuhCheckUpdates`, y el dashboard no vuelve a arrancar.
sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" remove wazuh 2>/dev/null || true
rm -rf "$OSD/plugins/wazuh"
rm -rf "$OSD/plugins/.plugin.installing"

echo "== 3/5 · instalando"
sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" install "file://$ZIP"

echo "== 4/5 · invalidando la caché del navegador (subir build.number)"
cp "$OSD/package.json" "$OSD/package.json.antes-$(date +%Y%m%d_%H%M%S)"
python3 - "$OSD/package.json" <<'PY'
import io, json, sys

ruta = sys.argv[1]

with io.open(ruta, encoding='utf-8') as f:
    paquete = json.load(f)

antes = paquete['build']['number']
paquete['build']['number'] = str(int(antes) + 1)

with io.open(ruta, 'w', encoding='utf-8') as f:
    json.dump(paquete, f, indent=2, ensure_ascii=False)
    f.write('\n')

print("   build.number: %s -> %s" % (antes, paquete['build']['number']))
PY

echo "== 5/5 · arrancando"
systemctl start wazuh-dashboard

for _ in $(seq 1 24); do
  if curl -sk -o /dev/null https://localhost:443/api/status 2>/dev/null; then
    break
  fi
  sleep 5
done

echo
echo "dashboard: $(systemctl is-active wazuh-dashboard)"
echo "plugins:   $(ls -1 "$OSD/plugins" | tr '\n' ' ')"
echo
echo "La URL de los bundles ha cambiado: el navegador los pedirá de nuevo solo."
