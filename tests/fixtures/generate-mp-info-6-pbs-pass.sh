#!/usr/bin/env bash
###############################################################################
# generate-mp-info-6-pbs-pass.sh · regenerates mp-info-6-pbs-pass.ndjson
#
#   bash tests/fixtures/generate-mp-info-6-pbs-pass.sh [<runbook repo>]
#
# A normal pass of the REAL mp.info.6 collector for Proxmox Backup Server (ens_mpinfo6_collect.sh) followed by its restore test (ens_mpinfo6_restore_test.sh), both in --prueba mode inside a disposable debian:12 container. The PBS is fake: a stub proxmox-backup-client and openssl that return two backup-ids with copies from 10 and 12 h ago, the oldest from 40 and 35 days ago, and restore the witness intact. The runbook is mounted read-only.
#
# The output is the NDJSON exactly as the collector writes it; mp-info-6-judgment.test.ts judges it with the plugin policy.
###############################################################################
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# Without an argument, the runbook is the plugin sibling folder whose `origin` ends in linux/mp.info.6; failing that, the former folder name.
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
RUNBOOK="${1:-$(runbook_by_origin linux/mp.info.6 mp.info.6-proxmox-backup-runbook)}"
RUNBOOK="$(cd "$RUNBOOK" && pwd)"
OUTPUT="$HERE/mp-info-6-pbs-pass.ndjson"

docker build -q -t ensfacil-mpinfo6-fixture:debian12 - >/dev/null <<'DOCKERFILE'
FROM debian:12
RUN apt-get update && apt-get install -y --no-install-recommends jq acl procps \
 && rm -rf /var/lib/apt/lists/*
DOCKERFILE

docker run --rm -i --hostname srv-pbs01 --add-host pbs.ejemplo.invalido:192.0.2.10 \
  -v "$RUNBOOK:/runbook:ro" ensfacil-mpinfo6-fixture:debian12 bash -s > "$OUTPUT" <<'INSIDE'
set -eu
B=/work/bin; P=/work/pass; mkdir -p "$B" "$P"
NOW="$(date -u +%s)"
FP="ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89"
TESTIGO="$(printf 'testigo de mp.info.6\n')"

cat > "$B/proxmox-backup-client" <<'FAKE'
#!/usr/bin/env bash
case "${1:-}" in
  snapshot) cat /work/snapshots.json ;;
  restore)
    shift; dest="$3"; shift 3; pattern=""
    while [ $# -gt 0 ]; do case "$1" in --pattern) pattern="$2"; shift ;; esac; shift; done
    rel="${pattern#/}"; mkdir -p "$dest/$(dirname "$rel")"
    printf '%s' "$(printf 'testigo de mp.info.6\n')" > "$dest/$rel" ;;
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
INSIDE

echo "$(wc -l < "$OUTPUT") lines in $OUTPUT" >&2
