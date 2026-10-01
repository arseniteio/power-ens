#!/usr/bin/env bash
###############################################################################
# generate-mp-info-6-zimbra-pass.sh · regenera mp-info-6-zimbra-pass.ndjson
#
#   bash tests/fixtures/generate-mp-info-6-zimbra-pass.sh [<repo del runbook>]
#
# Una pasada normal del recolector REAL de mp.info.6 para Zimbra
# (ens_mpinfo6zimbra_collect.sh) seguida de su prueba de restauración
# (ens_mpinfo6zimbra_restore_test.sh), las dos en modo --prueba dentro de un
# contenedor ubuntu:22.04 desechable -misma imagen base que usan las pruebas
# del propio runbook, porque el recolector necesita el date/stat/find de GNU-.
#
# El nodo simulado tiene los DOS papeles (zimbra-store y zimbra-ldap
# «instalados» como paquetes de mentira, para que el recolector los detecte
# solo con eso, sin declarar MPINFO6ZIMBRA_ROL), edición Network
# (tests/fixtures/zmcontrol-v-ne.txt) y las ocho sesiones de zmbackup
# correctas de tests/fixtures/zmbackupquery-normal.txt, cada una con su
# volcado LDAP dentro (tests/fixtures/ldap-volcado.ldif). Los binarios de
# Zimbra son los falsos de tests/fakes/zimbra-bin/ del propio runbook; lo
# demás -el usuario zimbra, `su`, `dpkg`, `slapd`- es real, igual que en la
# sala limpia del runbook (tests/clean-room-agent.sh, que sigue esta misma
# receta para el mismo escenario). La cuenta testigo
# (testigo@ejemplo.invalido) es la del propio ldap-volcado.ldif: el mismo
# correo sirve para la prueba de buzones (zmrestore) y la del directorio
# (se busca por `mail=`). Se declara además una copia fuera de la máquina
# activa (MPINFO6ZIMBRA_COPIA_REMOTA_*), la que acredita EV-06 en ALTO.
#
# El runbook se monta de solo lectura: no se toca.
#
# Lo que sale es el NDJSON tal cual lo escribe el recolector; el test
# `mp-info-6-judgment.test.ts` lo juzga con la policy del plugin.
###############################################################################
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
# Sin argumento, el runbook es la carpeta hermana del plugin cuyo remoto
# `origin` termina en zimbra/zimbra-mta/mp.info.6 (los repos se llaman como el control desde el
# 01/10/2026, así que la carpeta no lo identifica); si no hay ninguna, la de
# antes del renombrado, mp.info.6-zimbra.
runbook_por_origen() {
  local d url
  for d in "$AQUI"/../../../*/; do
    url="$(git -C "$d" remote get-url origin 2>/dev/null || true)"
    case "$url" in
      */"$1"|*/"$1".git|*:"$1"|*:"$1".git) echo "${d%/}"; return 0 ;;
    esac
  done
  echo "$AQUI/../../../$2"
}
RUNBOOK="${1:-$(runbook_por_origen zimbra/zimbra-mta/mp.info.6 mp.info.6-zimbra)}"
RUNBOOK="$(cd "$RUNBOOK" && pwd)"
SALIDA="$AQUI/mp-info-6-zimbra-pass.ndjson"

# Las sesiones de la salida de zmbackupquery del runbook llevan fechas fijas.
# Se desplazan días enteros para que la sesión más reciente sea de ayer (UTC):
# así la pasada es coherente el día que se regenere, como la del PBS.
DESPLAZADO="$(mktemp -d)"
trap 'rm -rf "$DESPLAZADO"' EXIT
python3 - "$RUNBOOK/tests/fixtures/zmbackupquery-normal.txt" "$DESPLAZADO/zmbackupquery.out" <<'PY'
import re, sys
from datetime import datetime, timedelta, timezone
texto = open(sys.argv[1], encoding='utf-8').read()
etiquetas = [datetime.strptime(d, '%Y%m%d') for d in re.findall(r'^Label:\s+\w+-(\d{8})\.', texto, re.M)]
ayer = datetime.now(timezone.utc).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
dias = timedelta(days=(ayer - max(etiquetas)).days)
def etiqueta(m):
    return m.group(1) + (datetime.strptime(m.group(2), '%Y%m%d') + dias).strftime('%Y%m%d') + m.group(3)
def fecha(m):
    d = datetime.strptime(m.group(2), '%Y/%m/%d') + dias
    return d.strftime('%a, ') + d.strftime('%Y/%m/%d')
texto = re.sub(r'(\w+-)(\d{8})(\.)', etiqueta, texto)
texto = re.sub(r'(\b[A-Z][a-z]{2}), (\d{4}/\d{2}/\d{2})', fecha, texto)
open(sys.argv[2], 'w', encoding='utf-8').write(texto)
PY

docker build -q -t ensfacil-mpinfo6zimbra-fixture:ubuntu22 - >/dev/null <<'DOCKERFILE'
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq \
 && apt-get install -y -qq jq slapd ldap-utils procps util-linux acl coreutils cron >/dev/null 2>&1 \
 && rm -rf /var/lib/apt/lists/*
DOCKERFILE

docker run --rm -i --hostname zimbra-01 \
  -v "$RUNBOOK:/runbook:ro" -v "$DESPLAZADO:/desplazado:ro" ensfacil-mpinfo6zimbra-fixture:ubuntu22 bash -s > "$SALIDA" <<'DENTRO'
set -eu
pkill slapd 2>/dev/null || true

# --- el Zimbra simulado: usuario, binarios falsos, sesiones, LDAP, cron -----
useradd -r -m -d /opt/zimbra -s /bin/bash zimbra
ZH=/opt/zimbra
mkdir -p "$ZH/bin" "$ZH/backup/sessions" "$ZH/lib/ext/backup" "$ZH/data/ldap" \
  "$ZH/common/sbin" "$ZH/common/libexec" "$ZH/common/bin" "$ZH/.escenario/cuentas"
cp /runbook/tests/fakes/zimbra-bin/* "$ZH/bin/"
chmod 755 "$ZH"/bin/*
E="$ZH/.escenario"
# El zmmailbox falso, sin marca de "encontrado ninguno", cae a
# $ESC/fixtures/zmmailbox-search-encontrado.txt por defecto.
cp -r /runbook/tests/fixtures "$E/fixtures"
cp /desplazado/zmbackupquery.out "$E/zmbackupquery.out"
cp /runbook/tests/fixtures/zmschedulebackup-default.txt "$E/zmschedulebackup.out"
cp /runbook/tests/fixtures/zmcontrol-v-ne.txt "$E/zmcontrol-v.out"

for l in $(awk '/^Label:/ {print $2}' "$E/zmbackupquery.out" | sort -u); do
  mkdir -p "$ZH/backup/sessions/$l/accounts" "$ZH/backup/sessions/$l/LDAP"
  printf '<session label="%s"/>\n' "$l" > "$ZH/backup/sessions/$l/session.xml"
  head -c 8192 /dev/zero > "$ZH/backup/sessions/$l/accounts/datos.bin"
  cp /runbook/tests/fixtures/ldap-volcado.ldif "$ZH/backup/sessions/$l/LDAP/ldap.bak"
done

# El directorio real de slapd: sus esquemas y módulos son los que carga el
# slapd TEMPORAL de la prueba de restauración del directorio.
ln -s /usr/sbin/slapadd "$ZH/common/sbin/slapadd"
ln -s /usr/sbin/slapd "$ZH/common/libexec/slapd"
ln -s /usr/bin/ldapsearch "$ZH/common/bin/ldapsearch"
cp -a /etc/ldap/slapd.d "$ZH/data/ldap/config"

chown -R zimbra:zimbra "$ZH"
chmod 750 "$ZH/backup"
crontab -u zimbra /runbook/tests/fixtures/crontab-zimbra-default.txt

# zimbra-store (buzones) y zimbra-ldap (directorio): paquetes de mentira para
# que el recolector detecte los DOS papeles sin declarar MPINFO6ZIMBRA_ROL.
for p in zimbra-store zimbra-ldap; do
  mkdir -p "/tmp/pkg/$p/DEBIAN"
  printf 'Package: %s\nVersion: 10.1.0\nArchitecture: all\nMaintainer: ensfacil <ensfacil@ejemplo.invalido>\nDescription: paquete simulado para la fixture\n' "$p" \
    > "/tmp/pkg/$p/DEBIAN/control"
  dpkg-deb -b "/tmp/pkg/$p" "/tmp/$p.deb" >/dev/null
  dpkg -i "/tmp/$p.deb" >/dev/null
done

# La cuenta testigo: el zmprov falso solo marca su existencia en el
# escenario, así que basta con crearla tal cual la usaría un administrador.
su - zimbra -c "$ZH/bin/zmprov ca testigo@ejemplo.invalido x displayName testigo" >/dev/null

# Una copia fuera de la máquina, activa: la que acredita EV-06 en ALTO.
touch /var/log/copia-remota-zimbra.log

cat > /work.env <<ENV
MPINFO6ZIMBRA_TESTIGO="testigo@ejemplo.invalido"
MPINFO6ZIMBRA_TESTIGO_MESSAGE_ID="<testigo@ejemplo.invalido>"
MPINFO6ZIMBRA_COPIA_REMOTA_DESTINO="rsync://copias.ejemplo.invalido/zimbra"
MPINFO6ZIMBRA_COPIA_REMOTA_TESTIGO="/var/log/copia-remota-zimbra.log"
ENV

mkdir -p /work/pasada
bash /runbook/scripts/ens_mpinfo6zimbra_collect.sh --prueba /work/pasada --env /work.env >&2
bash /runbook/scripts/ens_mpinfo6zimbra_restore_test.sh --prueba /work/pasada --env /work.env >&2
cat /work/pasada/log/mp_info_6.json
DENTRO

echo "$(wc -l < "$SALIDA") líneas en $SALIDA" >&2
