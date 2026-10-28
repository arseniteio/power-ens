#!/usr/bin/env bash
###############################################################################
# generate-mp-info-6-zimbra-pass.sh · regenerates mp-info-6-zimbra-pass.ndjson
#
#   bash tests/fixtures/generate-mp-info-6-zimbra-pass.sh [<runbook repo>]
#
# A normal pass of the REAL mp.info.6 collector for Zimbra (ens_mpinfo6zimbra_collect.sh) followed by its restore test (ens_mpinfo6zimbra_restore_test.sh), both in --prueba mode inside a disposable ubuntu:22.04 container (the same base image as the runbook's own tests: the collector needs GNU date/stat/find).
#
# The simulated node has BOTH roles (zimbra-store and zimbra-ldap "installed" as fake packages), the Network edition and the eight correct zmbackup sessions of the runbook's tests/fixtures/zmbackupquery-normal.txt, each with its LDAP dump. Zimbra binaries are the fakes of the runbook's tests/fakes/zimbra-bin/; the rest (the zimbra user, `su`, `dpkg`, `slapd`) is real. A remote off-machine copy is declared too (MPINFO6ZIMBRA_COPIA_REMOTA_*), the one that accredits EV-06 at ALTO. The runbook is mounted read-only.
#
# The output is the NDJSON exactly as the collector writes it; mp-info-6-judgment.test.ts judges it with the plugin policy.
###############################################################################
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# Without an argument, the runbook is the plugin sibling folder whose `origin` ends in zimbra/zimbra-mta/mp.info.6; failing that, the former folder name.
runbook_by_origin() {
  local d url
  for d in "$HERE"/../../../*/; do
    url="$(git -C "$d" remote get-url origin 2>/dev/null || true)"
    case "$url" in
      */"$1"|*/"$1".git|*:"$1"|*:"$1".git) echo "${d%/}"; return 0 ;;
    esac
  done
  echo "$HERE/../../../$2"
}
RUNBOOK="${1:-$(runbook_by_origin zimbra/zimbra-mta/mp.info.6 mp.info.6-zimbra)}"
RUNBOOK="$(cd "$RUNBOOK" && pwd)"
OUTPUT="$HERE/mp-info-6-zimbra-pass.ndjson"

# The runbook's zmbackupquery sessions carry fixed dates: they are shifted by whole days so the most recent session is yesterday's (UTC), keeping the pass coherent whenever it is regenerated.
SHIFTED="$(mktemp -d)"
trap 'rm -rf "$SHIFTED"' EXIT
python3 - "$RUNBOOK/tests/fixtures/zmbackupquery-normal.txt" "$SHIFTED/zmbackupquery.out" <<'PY'
import re, sys
from datetime import datetime, timedelta, timezone
text = open(sys.argv[1], encoding='utf-8').read()
labels = [datetime.strptime(d, '%Y%m%d') for d in re.findall(r'^Label:\s+\w+-(\d{8})\.', text, re.M)]
yesterday = datetime.now(timezone.utc).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
days = timedelta(days=(yesterday - max(labels)).days)
def relabel(m):
    return m.group(1) + (datetime.strptime(m.group(2), '%Y%m%d') + days).strftime('%Y%m%d') + m.group(3)
def redate(m):
    d = datetime.strptime(m.group(2), '%Y/%m/%d') + days
    return d.strftime('%a, ') + d.strftime('%Y/%m/%d')
text = re.sub(r'(\w+-)(\d{8})(\.)', relabel, text)
text = re.sub(r'(\b[A-Z][a-z]{2}), (\d{4}/\d{2}/\d{2})', redate, text)
open(sys.argv[2], 'w', encoding='utf-8').write(text)
PY

docker build -q -t power-ens-mpinfo6zimbra-fixture:ubuntu22 - >/dev/null <<'DOCKERFILE'
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq \
 && apt-get install -y -qq jq slapd ldap-utils procps util-linux acl coreutils cron >/dev/null 2>&1 \
 && rm -rf /var/lib/apt/lists/*
DOCKERFILE

docker run --rm -i --hostname zimbra-01 \
  -v "$RUNBOOK:/runbook:ro" -v "$SHIFTED:/shifted:ro" power-ens-mpinfo6zimbra-fixture:ubuntu22 bash -s > "$OUTPUT" <<'INSIDE'
set -eu
pkill slapd 2>/dev/null || true

# --- the simulated Zimbra: user, fake binaries, sessions, LDAP, cron -----
useradd -r -m -d /opt/zimbra -s /bin/bash zimbra
ZH=/opt/zimbra
mkdir -p "$ZH/bin" "$ZH/backup/sessions" "$ZH/lib/ext/backup" "$ZH/data/ldap" \
  "$ZH/common/sbin" "$ZH/common/libexec" "$ZH/common/bin" "$ZH/.escenario/cuentas"
cp /runbook/tests/fakes/zimbra-bin/* "$ZH/bin/"
chmod 755 "$ZH"/bin/*
E="$ZH/.escenario"
# The fake zmmailbox, without a "found none" mark, falls back to $ESC/fixtures/zmmailbox-search-encontrado.txt.
cp -r /runbook/tests/fixtures "$E/fixtures"
cp /shifted/zmbackupquery.out "$E/zmbackupquery.out"
cp /runbook/tests/fixtures/zmschedulebackup-default.txt "$E/zmschedulebackup.out"
cp /runbook/tests/fixtures/zmcontrol-v-ne.txt "$E/zmcontrol-v.out"

for l in $(awk '/^Label:/ {print $2}' "$E/zmbackupquery.out" | sort -u); do
  mkdir -p "$ZH/backup/sessions/$l/accounts" "$ZH/backup/sessions/$l/LDAP"
  printf '<session label="%s"/>\n' "$l" > "$ZH/backup/sessions/$l/session.xml"
  head -c 8192 /dev/zero > "$ZH/backup/sessions/$l/accounts/datos.bin"
  cp /runbook/tests/fixtures/ldap-volcado.ldif "$ZH/backup/sessions/$l/LDAP/ldap.bak"
done

# slapd's real directory: its schemas and modules are the ones the TEMPORARY slapd of the directory restore test loads.
ln -s /usr/sbin/slapadd "$ZH/common/sbin/slapadd"
ln -s /usr/sbin/slapd "$ZH/common/libexec/slapd"
ln -s /usr/bin/ldapsearch "$ZH/common/bin/ldapsearch"
cp -a /etc/ldap/slapd.d "$ZH/data/ldap/config"

chown -R zimbra:zimbra "$ZH"
chmod 750 "$ZH/backup"
crontab -u zimbra /runbook/tests/fixtures/crontab-zimbra-default.txt

# zimbra-store (mailboxes) and zimbra-ldap (directory): fake packages so the collector detects BOTH roles without declaring MPINFO6ZIMBRA_ROL.
for p in zimbra-store zimbra-ldap; do
  mkdir -p "/tmp/pkg/$p/DEBIAN"
  printf 'Package: %s\nVersion: 10.1.0\nArchitecture: all\nMaintainer: power_ens <power_ens@ejemplo.invalido>\nDescription: simulated package for the fixture\n' "$p" \
    > "/tmp/pkg/$p/DEBIAN/control"
  dpkg-deb -b "/tmp/pkg/$p" "/tmp/$p.deb" >/dev/null
  dpkg -i "/tmp/$p.deb" >/dev/null
done

# The witness account: the fake zmprov only marks its existence in the scenario, so creating it as an administrator would is enough.
su - zimbra -c "$ZH/bin/zmprov ca testigo@ejemplo.invalido x displayName testigo" >/dev/null

# An active off-machine copy: the one that accredits EV-06 at ALTO.
touch /var/log/copia-remota-zimbra.log

cat > /work.env <<ENV
MPINFO6ZIMBRA_TESTIGO="testigo@ejemplo.invalido"
MPINFO6ZIMBRA_TESTIGO_MESSAGE_ID="<testigo@ejemplo.invalido>"
MPINFO6ZIMBRA_COPIA_REMOTA_DESTINO="rsync://copias.ejemplo.invalido/zimbra"
MPINFO6ZIMBRA_COPIA_REMOTA_TESTIGO="/var/log/copia-remota-zimbra.log"
ENV

mkdir -p /work/pass
bash /runbook/scripts/ens_mpinfo6zimbra_collect.sh --prueba /work/pass --env /work.env >&2
bash /runbook/scripts/ens_mpinfo6zimbra_restore_test.sh --prueba /work/pass --env /work.env >&2
cat /work/pass/log/mp_info_6.json
INSIDE

echo "$(wc -l < "$OUTPUT") lines in $OUTPUT" >&2
