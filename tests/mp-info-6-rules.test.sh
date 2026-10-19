#!/usr/bin/env bash
# Checks that agent/rules/ensfacil_mp_info_6_json_rules.xml matches the mp.info.6 fact contract (each `event` with its rule ID), that the degradation fires only on NO_EVALUABLE and that the anchored base is not confused with another control.
#
#     tests/mp-info-6-rules.test.sh
#
# The wazuh-logtest part needs a manager with the XML loaded: by default a `wazuh/wazuh-manager:4.14.x` container (Docker, `--platform linux/amd64` if emulation is needed). Without Docker, or if the manager does not start, that part is skipped with a warning and only the static checks run.
#
# The `event`/`estado` fields carry `type="pcre2"` besides the `^...$` anchor: Wazuh's default matcher is case-INsensitive even when anchored, so `^backup_run$` without `pcre2` still matches `Backup_Run`.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
X="$HERE/../agent/rules/ensfacil_mp_info_6_json_rules.xml"
IMAGE="${WAZUH_MANAGER_IMAGE:-wazuh/wazuh-manager:4.14.0}"
CONTAINER="ens-mp-info-6-rules-test"

failures=0

echo "=== Static ==="

if python3 -c 'import xml.dom.minidom,sys; xml.dom.minidom.parseString("<root>"+open(sys.argv[1]).read()+"</root>")' "$X"; then
  echo "OK    well-formed XML"
else
  echo "FAIL malformed XML"
  failures=1
fi

if grep -qF '<field name="ensfacil">^mp.info.6$</field>' "$X"; then
  echo "OK    anchored base (^mp.info.6\$)"
else
  echo "FAIL the base rule anchor is missing"
  failures=1
fi

if grep -qiE "CUMPLE|claude|asistente" "$X"; then
  echo "FAIL the file mentions CUMPLE/claude/asistente"
  failures=1
else
  echo "OK    no CUMPLE/claude/asistente"
fi

echo
echo "=== wazuh-logtest (real manager) ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "WARN Docker not available: wazuh-logtest skipped (it will run against a real manager later)"
  exit "$failures"
fi

if ! docker run --rm --platform linux/amd64 -d --name "$CONTAINER" "$IMAGE" >/tmp/mp-info-6-rules-test.cid 2>/tmp/mp-info-6-rules-test.err; then
  echo "WARN could not start $IMAGE: wazuh-logtest skipped (it will run against a real manager later)"
  cat /tmp/mp-info-6-rules-test.err
  exit "$failures"
fi

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1; }
trap cleanup EXIT

# Wait for wazuh-logtest to answer, up to 60s.
ready=0
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" bash -c 'echo "{}" | /var/ossec/bin/wazuh-logtest' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "WARN the manager did not start in time: wazuh-logtest skipped (it will run against a real manager later)"
  exit "$failures"
fi

docker cp "$X" "$CONTAINER:/var/ossec/etc/rules/ensfacil_mp_info_6_json_rules.xml" >/dev/null
docker exec "$CONTAINER" /var/ossec/bin/wazuh-control restart >/dev/null 2>&1

id_of() {
  docker exec "$CONTAINER" bash -c "echo '$1' | /var/ossec/bin/wazuh-logtest 2>&1" \
    | grep -oE "id: '[0-9]+'" | head -1 | grep -oE '[0-9]+'
}

# "event id" pairs, one per line: bash 3.2 has no associative arrays, so `declare -A` is avoided on purpose.
EXPECTED="
backup_run 106601
backup_schedule 106602
backup_retention 106603
backup_access 106604
backup_storage 106605
restore_test 106606
collector_run 106797
collector_warning 106798
collector_missing 106799
"

while read -r ev expected; do
  [ -z "$ev" ] && continue
  line="{\"ensfacil\":\"mp.info.6\",\"event\":\"$ev\",\"ts\":\"2026-09-30T00:00:00Z\"}"
  id=$(id_of "$line")
  if [ "$id" = "$expected" ]; then
    echo "OK    $ev -> $id"
  else
    echo "FAIL $ev -> $id (expected $expected)"
    failures=1
  fi
done <<EOF
$EXPECTED
EOF

# evidence_state matches only with NO_EVALUABLE (106650).
id=$(id_of '{"ensfacil":"mp.info.6","event":"evidence_state","estado":"NO_EVALUABLE"}')
if [ "$id" = "106650" ]; then
  echo "OK    evidence_state/NO_EVALUABLE -> $id"
else
  echo "FAIL evidence_state/NO_EVALUABLE -> $id (expected 106650)"
  failures=1
fi

# The collector emits no verdicts: evidence_state with another state cannot match the degradation rule.
output=$(docker exec "$CONTAINER" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"evidence_state\",\"estado\":\"CUMPLE\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$output" | grep -q "id: '106650'"; then
  echo "FAIL evidence_state/CUMPLE must not match the degradation rule"
  failures=1
else
  echo "OK    evidence_state/CUMPLE does not match 106650"
fi

# Anchor negatives: an `event` that only CONTAINS the expected name (a superstring, a prefix or a case variant) cannot match the rule.
output=$(docker exec "$CONTAINER" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"backup_run_extra\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$output" | grep -q "id: '106601'"; then
  echo "FAIL backup_run_extra must not match 106601 (superstring)"
  failures=1
else
  echo "OK    backup_run_extra does not match 106601"
fi

output=$(docker exec "$CONTAINER" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"x_backup_run\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$output" | grep -q "id: '106601'"; then
  echo "FAIL x_backup_run must not match 106601 (prefix)"
  failures=1
else
  echo "OK    x_backup_run does not match 106601"
fi

output=$(docker exec "$CONTAINER" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"Backup_Run\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$output" | grep -q "id: '106601'"; then
  echo "FAIL Backup_Run must not match 106601 (case: without pcre2 the anchor is case-insensitive)"
  failures=1
else
  echo "OK    Backup_Run does not match 106601"
fi

output=$(docker exec "$CONTAINER" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"evidence_state\",\"estado\":\"NO_EVALUABLE_X\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$output" | grep -q "id: '106650'"; then
  echo "FAIL evidence_state with estado=NO_EVALUABLE_X must not match 106650 (superstring)"
  failures=1
else
  echo "OK    evidence_state/NO_EVALUABLE_X does not match 106650"
fi

# op.exp.1/op.exp.10 are not confused with mp.info.6: a line of another control cannot match any rule of this band.
output=$(docker exec "$CONTAINER" bash -c "echo '{\"ensfacil\":\"op.exp.1\",\"event\":\"backup_run\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$output" | grep -qE "id: '1066[0-9][0-9]'"; then
  echo "FAIL op.exp.1 with event=backup_run must not match an mp.info.6 rule"
  failures=1
else
  echo "OK    op.exp.1 is not confused with mp.info.6"
fi

if [ "$failures" -eq 0 ]; then
  echo
  echo "OK"
fi

exit "$failures"
