#!/usr/bin/env bash
###############################################################################
# generate-mp-info-6-pbs-pass.sh · regenera mp-info-6-pbs-pass.ndjson
#
#   bash tests/fixtures/generate-mp-info-6-pbs-pass.sh [<repo del runbook>]
#
# Una pasada normal del recolector REAL de mp.info.6 para Proxmox Backup Server
# (ens_mpinfo6_collect.sh) seguida de su prueba de restauración
# (ens_mpinfo6_restore_test.sh), las dos en modo --prueba dentro de un
# contenedor debian:12 desechable. El PBS es falso: un proxmox-backup-client y
# un openssl de mentira que devuelven dos backup-id con copias de hace 10 y
# 12 h, la más antigua de hace 40 y 35 días, y restauran el testigo intacto.
# El runbook se monta de solo lectura: no se toca.
#
# Lo que sale es el NDJSON tal cual lo escribe el recolector; el test
# `mp-info-6-judgment.test.ts` lo juzga con la policy del plugin.
###############################################################################
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
# Sin argumento, el runbook es la carpeta hermana del plugin cuyo remoto
# `origin` termina en linux/mp.info.6 (los repos se llaman como el control desde el
# 01/10/2026, así que la carpeta no lo identifica); si no hay ninguna, la de
# antes del renombrado, mp.info.6-proxmox-backup-runbook.
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
RUNBOOK="${1:-$(runbook_por_origen linux/mp.info.6 mp.info.6-proxmox-backup-runbook)}"
RUNBOOK="$(cd "$RUNBOOK" && pwd)"
SALIDA="$AQUI/mp-info-6-pbs-pass.ndjson"

docker build -q -t ensfacil-mpinfo6-fixture:debian12 - >/dev/null <<'DOCKERFILE'
FROM debian:12
RUN apt-get update && apt-get install -y --no-install-recommends jq acl procps \
 && rm -rf /var/lib/apt/lists/*
DOCKERFILE

docker run --rm -i --hostname srv-pbs01 --add-host pbs.ejemplo.invalido:192.0.2.10 \
  -v "$RUNBOOK:/runbook:ro" ensfacil-mpinfo6-fixture:debian12 bash -s > "$SALIDA" <<'DENTRO'
set -eu
B=/work/bin; P=/work/pasada; mkdir -p "$B" "$P"
NOW="$(date -u +%s)"
FP="ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89"
TESTIGO="$(printf 'testigo de mp.info.6\n')"

cat > "$B/proxmox-backup-client" <<'FAKE'
#!/usr/bin/env bash
case "${1:-}" in
  snapshot) cat /work/snapshots.json ;;
  restore)
    shift; destino="$3"; shift 3; patron=""
    while [ $# -gt 0 ]; do case "$1" in --pattern) patron="$2"; shift ;; esac; shift; done
    rel="${patron#/}"; mkdir -p "$destino/$(dirname "$rel")"
    printf '%s' "$(printf 'testigo de mp.info.6\n')" > "$destino/$rel" ;;
  *) exit 2 ;;
esac
FAKE
cat > "$B/openssl" <<FAKE
#!/usr/bin/env bash
case "\${1:-}" in
  s_client) printf -- '-----BEGIN CERTIFICATE-----\nfalso\n-----END CERTIFICATE-----\n' ;;
  x509) cat >/dev/null; echo "sha256 Fingerprint=${FP^^}" ;;
  *) exit 1 ;;
esac
FAKE
chmod 755 "$B"/*

jq -n --argjson h10 $((NOW - 36000)) --argjson h12 $((NOW - 43200)) \
      --argjson d40 $((NOW - 40 * 86400)) --argjson d35 $((NOW - 35 * 86400)) '[
  {"backup-type":"host","backup-id":"srv01_root","backup-time":$d40,"size":900,
   "fingerprint":"11:22:33:44:55:66:77:88","files":[{"filename":"root.pxar.didx","size":900}]},
  {"backup-type":"host","backup-id":"srv01_root","backup-time":$h10,"size":1048576,
   "fingerprint":"11:22:33:44:55:66:77:88","verification":{"state":"ok","upid":"x"},
   "files":[{"filename":"root.pxar.didx","crypt-mode":"encrypt","size":1048576}]},
  {"backup-type":"host","backup-id":"srv01_opt-zimbra","backup-time":$d35,"size":300,
   "files":[{"filename":"zimbra.pxar.didx","size":300}]},
  {"backup-type":"host","backup-id":"srv01_opt-zimbra","backup-time":$h12,"size":4096,
   "files":[{"filename":"zimbra.pxar.didx","size":4096}]}
]' > /work/snapshots.json

mkdir -p /etc/ensfacil /etc/cron.d /srv/copias
printf 'clave' > /etc/ensfacil/mpinfo6.key; chmod 600 /etc/ensfacil/mpinfo6.key
printf '%s' "$TESTIGO" > /etc/ensfacil/mpinfo6-witness.txt
chown root:backup /srv/copias; chmod 750 /srv/copias
cat > /etc/ensfacil/mpinfo6.env <<ENV
PBS_REPOSITORY="ensfacil@pbs!copias@pbs.ejemplo.invalido:datastore1"
PBS_PASSWORD="secreto-de-prueba"
PBS_BACKUPS="
srv01_root        root.pxar:/ --exclude /proc --exclude /sys
srv01_opt-zimbra  zimbra.pxar:/opt/zimbra
"
PBS_KEYFILE="/etc/ensfacil/mpinfo6.key"
RESTORE_WITNESS_PATH="/etc/ensfacil/mpinfo6-witness.txt"
RESTORE_WITNESS_SHA256="$(printf '%s' "$TESTIGO" | sha256sum | cut -d' ' -f1)"
RESTORE_EVERY_DAYS="7"
MPINFO6_LOCAL_BACKUP_DIRS="/srv/copias"
ENV
chmod 640 /etc/ensfacil/mpinfo6.env
cat > /etc/cron.d/ensfacil-mpinfo6 <<'CRON'
17 2 * * * root /usr/local/bin/pxbackup.sh >/dev/null 2>&1
53 * * * * root /usr/local/bin/ens_mpinfo6_collect.sh >/dev/null 2>&1
CRON
printf '%s\n' "$FP" > /etc/ensfacil/mpinfo6.pbs-fingerprint

export PATH="$B:$PATH" MPINFO6_SCHEDULE_FILES=/etc/cron.d/ensfacil-mpinfo6
bash /runbook/scripts/ens_mpinfo6_restore_test.sh --prueba "$P" >&2
bash /runbook/scripts/ens_mpinfo6_collect.sh --prueba "$P" >&2
cat "$P/log/mp_info_6.json"
DENTRO

echo "$(wc -l < "$SALIDA") líneas en $SALIDA" >&2
