#!/usr/bin/env bash
# create-admin-role.sh creates the ensfacil_admin role and assigns it without removing anyone.
#   bash tests/create-admin-role.test.sh
#
# The indexer is a fake curl: it logs each request (method, path and body) and answers the mapping with FAKE_MAPPING / FAKE_MAPPING_CODE.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
failures=0

ROLE_PUT='PUT _plugins/_security/api/roles/ensfacil_admin {"description":"ENSFácil: puede cambiar la configuración ENS y ver su historial","cluster_permissions":[],"index_permissions":[],"tenant_permissions":[]}'
MAPPING='_plugins/_security/api/rolesmapping/ensfacil_admin'

cat > "$T/curl" <<'FAKE'
#!/usr/bin/env bash
method=GET; url=; data=
printf '%s\n' "$*" >> "$REQLOG.args"
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift 2 ;;
    --data-binary|--data|-d) data="$2"; shift 2 ;;
    https://*|http://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
path="${url#*://}"; path="${path#*/}"
printf '%s %s %s\n' "$method" "$path" "$data" >> "$REQLOG"
case "$method $path" in
  "GET _plugins/_security/api/rolesmapping/ensfacil_admin") printf '%s\n%s' "$FAKE_MAPPING" "$FAKE_MAPPING_CODE" ;;
  "PUT _plugins/_security/api/roles/ensfacil_admin") printf '{"status":"OK"}\n%s' "${FAKE_ROLE_CODE:-200}" ;;
  *) printf '{"status":"OK"}\n200' ;;
esac
FAKE
chmod +x "$T/curl"
: > "$T/admin.pem"; : > "$T/admin-key.pem"; : > "$T/root-ca.pem"

WITH_ANA='{"ensfacil_admin":{"hosts":[],"users":["ana"],"reserved":false,"hidden":false,"backend_roles":[],"and_backend_roles":[]}}'
WITH_RSIS='{"ensfacil_admin":{"hosts":[],"users":["ana","rsis"],"reserved":false,"hidden":false,"backend_roles":[],"and_backend_roles":[]}}'
NOT_FOUND='{"status":"NOT_FOUND","message":"Resource '"'"'ensfacil_admin'"'"' not found."}'

# run MAPPING CODE args... -> leaves the output in $T/output, the code in $rc and what reached the indexer in $T/log
run() {
  local mapping="$1" code="$2"; shift 2
  : > "$T/log"; : > "$T/log.args"
  REQLOG="$T/log" FAKE_MAPPING="$mapping" FAKE_MAPPING_CODE="$code" \
    CURL="$T/curl" OS_CERT="$T/admin.pem" OS_KEY="$T/admin-key.pem" OS_CA="$T/root-ca.pem" \
    bash "$ROOT/config/create-admin-role.sh" "$@" > "$T/output" 2>&1
  rc=$?
}
# the requests that change something, as the script prints them
printed() { grep -E '^(PUT|PATCH|POST|DELETE) ' "$T/output"; }
# those that reached the indexer and change something
sent() { grep -E '^(PUT|PATCH|POST|DELETE) ' "$T/log"; }
compare() {  # description, expected, obtained
  if [ "$2" = "$3" ]; then echo "  ok   $1"
  else echo "  FAIL $1"; echo "        expected: $2"; echo "        obtained: $3"; failures=$((failures+1)); fi
}

echo "· --dry-run --mapear rsis, the mapping exists with ana"
run "$WITH_ANA" 200 --dry-run --mapear rsis
compare "exits well" 0 "$rc"
compare "prints the role PUT and the PATCH that adds rsis" \
  "$ROLE_PUT"$'\n'"PATCH $MAPPING [{\"op\":\"add\",\"path\":\"/users/-\",\"value\":\"rsis\"}]" "$(printed)"
compare "sends no change" "" "$(sent)"

echo "· --dry-run without --mapear"
run "$WITH_ANA" 200 --dry-run
compare "exits well" 0 "$rc"
compare "prints only the role PUT" "$ROLE_PUT" "$(printed)"
compare "does not talk to the indexer" "" "$(cat "$T/log")"

echo "· --dry-run --mapear rsis, the mapping does not exist"
run "$NOT_FOUND" 404 --dry-run --mapear rsis
compare "exits well" 0 "$rc"
compare "creates the mapping with rsis" \
  "$ROLE_PUT"$'\n'"PUT $MAPPING {\"users\":[\"rsis\"]}" "$(printed)"

echo "· --dry-run --mapear rsis, rsis already has the role"
run "$WITH_RSIS" 200 --dry-run --mapear rsis
compare "does not add it again" "$ROLE_PUT" "$(printed)"
compare "says so" 1 "$(grep -c 'rsis' "$T/output")"

echo "· for real, --mapear rsis --mapear ana --mapear rsis, the mapping exists with ana"
run "$WITH_ANA" 200 --mapear rsis --mapear ana --mapear rsis
compare "exits well" 0 "$rc"
compare "sends the role PUT and a PATCH that only adds rsis, once" \
  "$ROLE_PUT"$'\n'"PATCH $MAPPING [{\"op\":\"add\",\"path\":\"/users/-\",\"value\":\"rsis\"}]" "$(sent)"
compare "never removes or replaces users" 0 "$(grep -cE '"op":"(remove|replace)"' "$T/log")"
compare "with the certificate" 4 "$(grep -c -- "--cert $T/admin.pem --key $T/admin-key.pem" "$T/log.args")"
compare "without user or password on the command line" 0 "$(grep -cE -- '(^| )(-u|--user) ' "$T/log.args")"
compare "verifies the indexer certificate with its CA" 4 "$(grep -c -- "--cacert $T/root-ca.pem" "$T/log.args")"
compare "never without verifying it (-k / --insecure)" 0 "$(grep -cE -- '(^| )(-k|--insecure)( |$)' "$T/log.args")"

echo "· for real, without --mapear"
run "$WITH_ANA" 200
compare "exits well" 0 "$rc"
compare "sends only the role PUT" "$ROLE_PUT" "$(sent)"
compare "says who has the role" 1 "$(grep -c 'ana' "$T/output")"

echo "· the indexer rejects the role"
FAKE_ROLE_CODE=403; export FAKE_ROLE_CODE
run "$WITH_ANA" 200 --mapear rsis
unset FAKE_ROLE_CODE
compare "exits with an error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compare "does not touch the mapping" "$ROLE_PUT" "$(sent)"

echo "· usage errors"
run "$WITH_ANA" 200 --mapear
compare "--mapear without a user is an error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compare "and sends nothing" "" "$(cat "$T/log")"
run "$WITH_ANA" 200 --other
compare "an unknown option is an error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
: > "$T/log"
REQLOG="$T/log" CURL="$T/curl" OS_CERT="$T/missing.pem" OS_KEY="$T/admin-key.pem" \
  bash "$ROOT/config/create-admin-role.sh" > "$T/output" 2>&1; rc=$?
compare "without a readable certificate is an error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compare "and sends nothing" "" "$(cat "$T/log")"
: > "$T/log"
REQLOG="$T/log" CURL="$T/curl" OS_CERT="$T/admin.pem" OS_KEY="$T/admin-key.pem" OS_CA="$T/missing-ca.pem" \
  bash "$ROOT/config/create-admin-role.sh" > "$T/output" 2>&1; rc=$?
compare "without a readable CA is an error" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
compare "that says so" 1 "$(grep -c 'indexer CA' "$T/output")"
compare "and sends nothing" "" "$(cat "$T/log")"
echo "· defaults"
compare "the Wazuh indexer CA" 1 "$(grep -c 'OS_CA="${OS_CA:-/etc/wazuh-indexer/certs/root-ca.pem}"' "$ROOT/config/create-admin-role.sh")"
compare "and 127.0.0.1, its certificate name" 1 "$(grep -c 'ENS_OS_URL:-https://127.0.0.1:9200' "$ROOT/config/create-admin-role.sh")"

[ $failures -eq 0 ] && echo "ALL OK" || { echo "$failures FAILURES"; exit 1; }
