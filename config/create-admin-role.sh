#!/usr/bin/env bash
set -euo pipefail

ROLE=power_ens_admin
ROLE_BODY='{"description":"Power ENS: puede cambiar la configuración ENS y ver su historial","cluster_permissions":[],"index_permissions":[],"tenant_permissions":[]}'
ROLE_PATH="_plugins/_security/api/roles/$ROLE"
MAPPING_PATH="_plugins/_security/api/rolesmapping/$ROLE"

CURL="${CURL:-curl}"
OS_CERT="${OS_CERT:-/etc/wazuh-indexer/certs/admin.pem}"
OS_KEY="${OS_KEY:-/etc/wazuh-indexer/certs/admin-key.pem}"
OS_CA="${OS_CA:-/etc/wazuh-indexer/certs/root-ca.pem}"
OS_URL="${OS_URL:-${ENS_OS_URL:-https://127.0.0.1:9200}}"
OS_URL="${OS_URL%/}"
OS_RESOLVE="${OS_RESOLVE:-}"

usage() {
  echo "usage: sudo bash create-admin-role.sh [--dry-run] [--map <user>]..." >&2
}

DRY_RUN=0
USERS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --map)
      if [ -z "${2:-}" ] || [ "${2#-}" != "$2" ]; then
        echo "--map needs a user name" >&2
        usage
        exit 1
      fi
      USERS+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ "$DRY_RUN" = 0 ] || [ "${#USERS[@]}" -gt 0 ]; then
  if [ ! -r "$OS_CERT" ] || [ ! -r "$OS_KEY" ]; then
    echo "cannot read the administration certificate ($OS_CERT, $OS_KEY)." >&2
    echo "Run with sudo, or set OS_CERT and OS_KEY." >&2
    exit 2
  fi
  if [ ! -r "$OS_CA" ]; then
    echo "cannot read the indexer CA ($OS_CA): without it, who is being talked to is not verified." >&2
    echo "Run with sudo, or set OS_CA." >&2
    exit 2
  fi
fi

RESPONSE=
CODE=
request_to_indexer() {
  local method="$1" path="$2" body="${3:-}" output
  local args=(-sS --cacert "$OS_CA" --cert "$OS_CERT" --key "$OS_KEY" -X "$method" -w '\n%{http_code}')
  [ -z "$OS_RESOLVE" ] || args+=(--resolve "$OS_RESOLVE")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$body")
  fi
  if ! output="$("$CURL" "${args[@]}" "$OS_URL/$path")"; then
    echo "could not talk to the indexer at $OS_URL" >&2
    exit 1
  fi
  CODE="${output##*$'\n'}"
  RESPONSE="${output%$'\n'*}"
}

change_request() {
  echo "$1 $2 $3"
  if [ "$DRY_RUN" = 1 ]; then
    return 0
  fi
  request_to_indexer "$1" "$2" "$3"
  case "$CODE" in
    2??) echo "   -> $CODE" ;;
    *)
      echo "   -> $CODE $RESPONSE" >&2
      echo "the indexer rejected the request; stopping." >&2
      exit 1
      ;;
  esac
}

if [ "$DRY_RUN" = 1 ]; then
  echo "== dry-run mode: no change is sent"
fi

echo "== role $ROLE"
change_request PUT "$ROLE_PATH" "$ROLE_BODY"

if [ "${#USERS[@]}" -gt 0 ]; then
  echo "== assignment of $ROLE"
  request_to_indexer GET "$MAPPING_PATH"
  case "$CODE" in
    200) EXISTS=1 ;;
    404) EXISTS=0 ;;
    *)
      echo "could not read the mapping of $ROLE: $CODE $RESPONSE" >&2
      exit 1
      ;;
  esac

  PLAN="$(RESPONSE="$RESPONSE" python3 -c '
import json, os, sys

role, exists, requested = sys.argv[1], sys.argv[2] == "1", sys.argv[3:]
current = []
if exists:
    data = json.loads(os.environ.get("RESPONSE") or "{}")
    current = list((data.get(role) or {}).get("users") or [])

new, already = [], []
for user in requested:
    if user in current:
        if user not in already:
            already.append(user)
    elif user not in new:
        new.append(user)

compact = dict(ensure_ascii=False, separators=(",", ":"))
if not new:
    print("NOTHING")
    print("")
elif exists:
    print("PATCH")
    print(json.dumps([{"op": "add", "path": "/users/-", "value": u} for u in new], **compact))
else:
    print("PUT")
    print(json.dumps({"users": new}, **compact))
print(", ".join(already))
' "$ROLE" "$EXISTS" "${USERS[@]}")"

  METHOD="$(printf '%s\n' "$PLAN" | sed -n 1p)"
  BODY="$(printf '%s\n' "$PLAN" | sed -n 2p)"
  ALREADY="$(printf '%s\n' "$PLAN" | sed -n 3p)"

  if [ -n "$ALREADY" ]; then
    echo "already have the role: $ALREADY"
  fi
  if [ "$METHOD" != NOTHING ]; then
    change_request "$METHOD" "$MAPPING_PATH" "$BODY"
  fi
fi

if [ "$DRY_RUN" = 1 ]; then
  exit 0
fi

request_to_indexer GET "$MAPPING_PATH"
if [ "$CODE" = 200 ]; then
  CURRENT_USERS="$(RESPONSE="$RESPONSE" python3 -c '
import json, os, sys
data = json.loads(os.environ.get("RESPONSE") or "{}")
print(", ".join((data.get(sys.argv[1]) or {}).get("users") or []))
' "$ROLE")"
  echo "users with the role $ROLE: ${CURRENT_USERS:-none}"
else
  echo "the role $ROLE is not assigned to anyone yet (assign it with --map <user>)"
fi
echo "Users with $ROLE or all_access can save the ENS configuration."
