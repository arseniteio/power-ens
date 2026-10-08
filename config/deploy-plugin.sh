#!/usr/bin/env bash
###############################################################################
# deploy-plugin.sh · instala ENSFácil Y hace que el navegador lo vea
#
#   sudo bash deploy-plugin.sh /ruta/al/ensfacil-2.19.5.zip
#
# Solo instala el plugin `ensfacil`, y solo retira ese: un zip de cualquier
# otro plugin (también el de Wazuh, `wazuh`) se rechaza sin tocar nada.
# `bash deploy-plugin.sh --solo-id <zip>` imprime el id del zip y sale sin
# tocar nada. Exactamente un zip: con más o con menos, no hace nada.
#
# Antes de retirar el plugin anterior lo guarda junto al zip
# (plugins-<id>-antes-<fecha>.tgz). Si la instalación falla, dice cómo volver a
# como estaba y sale con error; y sale con error también si al final el
# dashboard no queda activo.
#
# POR QUÉ EXISTE, Y POR QUÉ EL ÚLTIMO PASO NO ES OPCIONAL.
#
# Instalar el plugin NO basta para que nadie vea el cambio. OpenSearch
# Dashboards sirve los bundles en
#
#     /{buildHash}/bundles/plugin/ensfacil/ensfacil.chunk.N.js
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

uso() {
  echo "uso: sudo bash deploy-plugin.sh /ruta/al/plugin.zip" >&2
  echo "     bash deploy-plugin.sh --solo-id /ruta/al/plugin.zip" >&2
  exit 1
}

SOLO_ID=0
if [ "${1:-}" = "--solo-id" ]; then
  SOLO_ID=1
  shift
fi

# Un solo zip, y que sea un fichero: un segundo argumento (un comodín que
# casa con dos zips, una opción mal escrita) no se ignora en silencio.
[ $# -eq 1 ] || uso
case "$1" in -*) uso ;; esac
[ -f "$1" ] || { echo "no existe el zip: $1" >&2; uso; }

# Ruta absoluta: `file://` con una ruta relativa no es la que se cree, y el
# instalador corre como otro usuario.
ZIP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OSD="${OSD:-/usr/share/wazuh-dashboard}"

# El plugin que se retira es el que trae el zip, y solo puede ser `ensfacil`.
# Nunca un comodín, y nunca el de Wazuh: ese lo instala su paquete oficial.
# awk lee el listado entero (sin `exit`): si cortara la tubería, unzip moriría
# por SIGPIPE en un zip con node_modules y, con pipefail, el script saldría con
# 141 sin decir nada.
PLUGIN_ID="$(unzip -Z1 "$ZIP" 2>/dev/null | awk -F/ '$1=="opensearch-dashboards" && $2!="" && id=="" {id=$2} END {print id}')"
case "$PLUGIN_ID" in
  ensfacil) ;;
  wazuh)
    echo "el zip es del plugin de Wazuh (id: 'wazuh'): deploy-plugin.sh solo instala ENSFácil (id: 'ensfacil')." >&2
    echo "El plugin de Wazuh se instala con el paquete oficial wazuh-dashboard; para ENSFácil, usar ensfacil-2.19.5.zip." >&2
    exit 2
    ;;
  *)
    echo "el zip no es de ENSFácil (id: '${PLUGIN_ID:-ninguno}'): deploy-plugin.sh solo instala el plugin 'ensfacil'." >&2
    exit 2
    ;;
esac

if [ "$SOLO_ID" = 1 ]; then
  echo "$PLUGIN_ID"
  exit 0
fi

echo "== 1/5 · parando el dashboard"
systemctl stop wazuh-dashboard

echo "== 2/5 · retirando el plugin anterior ($PLUGIN_ID)"
RESPALDO=""
if [ -d "$OSD/plugins/$PLUGIN_ID" ]; then
  RESPALDO="$(dirname "$ZIP")/plugins-$PLUGIN_ID-antes-$(date +%Y%m%d_%H%M%S).tgz"
  tar -czf "$RESPALDO" -C "$OSD" "plugins/$PLUGIN_ID"
  echo "   guardado en $RESPALDO"
fi
# RUTAS EXACTAS. Nunca un comodín `wazuh*`: se llevaría por delante `wazuhCore`
# y `wazuhCheckUpdates`, y el dashboard no vuelve a arrancar.
sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" remove "$PLUGIN_ID" 2>/dev/null || true
rm -rf "$OSD/plugins/$PLUGIN_ID"
rm -rf "$OSD/plugins/.plugin.installing"

echo "== 3/5 · instalando"
if ! sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" install "file://$ZIP"; then
  {
    echo
    echo "LA INSTALACIÓN HA FALLADO: el dashboard está parado y sin el plugin $PLUGIN_ID."
    echo "Para volver a como estaba:"
    if [ -n "$RESPALDO" ]; then
      echo "  sudo rm -rf $OSD/plugins/$PLUGIN_ID $OSD/plugins/.plugin.installing"
      echo "  sudo tar -xzf $RESPALDO -C $OSD"
    else
      echo "  (no había un $PLUGIN_ID anterior: arranca sin él)"
      echo "  sudo rm -rf $OSD/plugins/.plugin.installing"
    fi
    echo "  sudo systemctl start wazuh-dashboard"
  } >&2
  exit 5
fi

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

ESTADO="$(systemctl is-active wazuh-dashboard || true)"
echo
echo "dashboard: $ESTADO"
echo "plugins:   $(ls -1 "$OSD/plugins" | tr '\n' ' ')"
echo
if [ "$ESTADO" != "active" ]; then
  echo "EL DASHBOARD NO ESTÁ ACTIVO ($ESTADO): mira 'journalctl -u wazuh-dashboard'." >&2
  [ -n "$RESPALDO" ] && echo "El plugin anterior está en $RESPALDO." >&2
  exit 6
fi
echo "La URL de los bundles ha cambiado: el navegador los pedirá de nuevo solo."
