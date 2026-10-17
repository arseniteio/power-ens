#!/usr/bin/env bash
###############################################################################
# deploy-plugin.sh · instala ENSFácil Y hace que el navegador lo vea
#
#   sudo bash deploy-plugin.sh /ruta/al/ensfacil-X.Y.Z-osd-2.19.5.zip
#
# El zip es el de la release (ensfacil-X.Y.Z-osd-2.19.5.zip) o el que deja
# build-plugin.sh al compilar (ensfacil-2.19.5.zip): el contenido es el mismo.
#
# Solo instala el plugin `ensfacil`, y solo retira ese: un zip de cualquier
# otro plugin (también el de Wazuh, `wazuh`) se rechaza sin tocar nada.
# `bash deploy-plugin.sh --solo-id <zip>` imprime el id del zip y sale sin
# tocar nada. Exactamente un zip: con más o con menos, no hace nada.
#
# Antes de parar el dashboard guarda el plugin que va a sustituir en
# ${ENSFACIL_BACKUP_DIR:-/var/backups}/ensfacil, como plugins-<id>-<fecha>.tgz.
# Esa subcarpeta es SUYA: la crea (de root, 0700) si no existe, y nunca cambia
# los permisos de una carpeta que no ha creado (ENSFACIL_BACKUP_DIR puede ser
# /tmp o una carpeta que otros leen). No junto al zip: la compilación
# siguiente borra esa carpeta entera. Solo cuando el despliegue termina bien
# se quedan las 3 últimas copias: un despliegue que falla una y otra vez no
# empuja fuera la última copia buena.
#
# Si algo falla con el dashboard ya parado, dice cómo volver a como estaba
# (restaurar esa copia y arrancar) y sale con error. Códigos de salida:
#   1 uso incorrecto · 2 el zip no es de ENSFácil · 3 no se pudo guardar la
#   copia (no se ha tocado nada) · 5 falló la instalación · 6 el dashboard no
#   quedó activo al final · 7 falló otro paso con el dashboard parado.
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
# Por eso una recarga forzada del navegador no basta para ver la versión
# nueva: lo que hay que cambiar no es la página cargada, sino la URL de los
# bundles.
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
    echo "El plugin de Wazuh se instala con el paquete oficial wazuh-dashboard; para ENSFácil, usar el zip de la release, ensfacil-X.Y.Z-osd-2.19.5.zip." >&2
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

RESPALDOS="${ENSFACIL_BACKUP_DIR:-/var/backups}/ensfacil"
RESPALDO=""
PAQUETE_ANTES=""
ESTADO=""
PASO=""
PARADO=0

# Con el dashboard parado, cualquier salida con error (también un paso que
# falla por `set -e`, o un Ctrl+C) dice cómo volver a como estaba.
vuelta_atras() {
  echo "Para volver a como estaba:"
  if [ -n "$RESPALDO" ]; then
    echo "  sudo rm -rf $OSD/plugins/$PLUGIN_ID $OSD/plugins/.plugin.installing"
    echo "  sudo tar -xzf $RESPALDO -C $OSD"
  else
    echo "  (no había un $PLUGIN_ID anterior: arranca sin él)"
    echo "  sudo rm -rf $OSD/plugins/$PLUGIN_ID $OSD/plugins/.plugin.installing"
  fi
  if [ -n "$PAQUETE_ANTES" ]; then
    echo "  sudo cp -a $PAQUETE_ANTES $OSD/package.json"
  fi
  echo "  sudo systemctl start wazuh-dashboard"
}
al_salir() {
  local rc=$?
  trap - EXIT
  if [ "$PARADO" = 1 ] && [ "$rc" -ne 0 ]; then
    {
      echo
      case "$rc" in
        5) echo "LA INSTALACIÓN HA FALLADO: el dashboard está parado y sin el plugin $PLUGIN_ID." ;;
        6) echo "EL DASHBOARD NO ESTÁ ACTIVO (${ESTADO:-?}): mira 'journalctl -u wazuh-dashboard'." ;;
        *) echo "HA FALLADO EL PASO «${PASO}» (código $rc): el dashboard puede haberse quedado parado o a medias."
           rc=7 ;;
      esac
      vuelta_atras
    } >&2
  fi
  exit "$rc"
}
trap al_salir EXIT
trap 'exit 130' INT TERM

# La carpeta de copias, solo si no existe: entonces es nuestra y nace de root
# y 0700. Si ya existe, se usa como está; nunca un chmod/chown de lo ajeno.
carpeta_de_copias() {
  [ -d "$RESPALDOS" ] && return 0
  mkdir -p "$(dirname "$RESPALDOS")" || return 1
  (umask 077 && mkdir "$RESPALDOS") || return 1
  if [ "$(id -u)" -eq 0 ]; then
    chown root:root "$RESPALDOS" || return 1
  fi
}

PASO="1/6 · guardando el plugin anterior ($PLUGIN_ID)"
echo "== $PASO"
if [ -d "$OSD/plugins/$PLUGIN_ID" ]; then
  RESPALDO="$RESPALDOS/plugins-$PLUGIN_ID-$(date +%Y%m%d_%H%M%S).tgz"
  if ! { carpeta_de_copias && tar -czf "$RESPALDO" -C "$OSD" "plugins/$PLUGIN_ID"; }; then
    echo "no se pudo guardar el plugin anterior en $RESPALDOS: no se ha tocado nada." >&2
    rm -f "$RESPALDO" 2>/dev/null || true
    exit 3
  fi
  echo "   guardado en $RESPALDO"
else
  echo "   no hay un $PLUGIN_ID instalado: nada que guardar"
fi

PASO="2/6 · parando el dashboard"
echo "== $PASO"
PARADO=1
systemctl stop wazuh-dashboard

PASO="3/6 · retirando el plugin anterior ($PLUGIN_ID)"
echo "== $PASO"
# RUTAS EXACTAS. Nunca un comodín `wazuh*`: se llevaría por delante `wazuhCore`
# y `wazuhCheckUpdates`, y el dashboard no vuelve a arrancar.
sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" remove "$PLUGIN_ID" 2>/dev/null || true
rm -rf "$OSD/plugins/$PLUGIN_ID"
rm -rf "$OSD/plugins/.plugin.installing"

PASO="4/6 · instalando"
echo "== $PASO"
if ! sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" install "file://$ZIP"; then
  exit 5
fi

PASO="5/6 · invalidando la caché del navegador (subir build.number)"
echo "== $PASO"
# La vuelta atrás solo nombra la copia de package.json si esa copia existe.
COPIA_PAQUETE="$OSD/package.json.antes-$(date +%Y%m%d_%H%M%S)"
cp "$OSD/package.json" "$COPIA_PAQUETE"
PAQUETE_ANTES="$COPIA_PAQUETE"
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

PASO="6/6 · arrancando"
echo "== $PASO"
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
  exit 6
fi

# Desplegado y activo: ahora sí, solo las 3 últimas copias de este plugin. El
# nombre lleva la fecha, así que el orden alfabético es el cronológico.
if [ -n "$RESPALDO" ]; then
  find "$RESPALDOS" -maxdepth 1 -name "plugins-$PLUGIN_ID-*.tgz" -print \
    | sort -r | tail -n +4 | while IFS= read -r viejo; do rm -f "$viejo"; done
fi
echo "La URL de los bundles ha cambiado: el navegador los pedirá de nuevo solo."
