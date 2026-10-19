#!/usr/bin/env bash
###############################################################################
# create-admin-role.sh · creates the ensfacil_admin role and, if asked, assigns it
#
#   sudo bash config/create-admin-role.sh [--dry-run] [--mapear <user>]...
#
# Whoever has the ensfacil_admin role (or all_access) can save the ENS configuration and see its
# history; the others see it but get a 403 on save. The role grants no permission: it is a mark the
# plugin looks for among the user's roles.
#
# Talks to the indexer with its administration certificate, no password, and verifies the indexer
# certificate against its CA (never `-k`: this script writes to cluster security, and without
# verifying who it talks to anyone in the middle would receive the administration certificate):
#   OS_CERT   default /etc/wazuh-indexer/certs/admin.pem
#   OS_KEY    default /etc/wazuh-indexer/certs/admin-key.pem
#   OS_CA     default /etc/wazuh-indexer/certs/root-ca.pem
#   OS_URL    default https://127.0.0.1:9200 (ENS_OS_URL also works)
# The URL must carry the name the indexer certificate was made for: a default Wazuh install's is for
# 127.0.0.1, not localhost (with localhost curl refuses: «no alternative certificate subject name matches»).
#
# Repeatable: the role is rewritten the same and the mapping only ADDS missing users; it never removes
# anyone. --dry-run shows the requests that would change something and does not send them (it does read
# the mapping, to know what is missing).
###############################################################################
set -euo pipefail

ROLE=ensfacil_admin
ROLE_BODY='{"description":"ENSFácil: puede cambiar la configuración ENS y ver su historial","cluster_permissions":[],"index_permissions":[],"tenant_permissions":[]}'
ROLE_PATH="_plugins/_security/api/roles/$ROLE"
MAPPING_PATH="_plugins/_security/api/rolesmapping/$ROLE"

CURL="${CURL:-curl}"
OS_CERT="${OS_CERT:-/etc/wazuh-indexer/certs/admin.pem}"
OS_KEY="${OS_KEY:-/etc/wazuh-indexer/certs/admin-key.pem}"
OS_CA="${OS_CA:-/etc/wazuh-indexer/certs/root-ca.pem}"
OS_URL="${OS_URL:-${ENS_OS_URL:-https://127.0.0.1:9200}}"
OS_URL="${OS_URL%/}"

usage() {
  echo "usage: sudo bash create-admin-role.sh [--dry-run] [--mapear <user>]..." >&2
}

DRY_RUN=0
USERS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --mapear)
      if [ -z "${2:-}" ] || [ "${2#-}" != "$2" ]; then
        echo "--mapear needs a user name" >&2
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

# The certificate is needed for any request, also to read the mapping in dry-run mode. Without --mapear,
# dry-run does not talk to the indexer.
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

# request METHOD PATH [BODY]: leaves the response body in RESPONSE and the HTTP code in CODE.
# Never user or password: only the certificate.
RESPONSE=
CODE=
request_to_indexer() {
  local method="$1" path="$2" body="${3:-}" output
  local args=(-sS --cacert "$OS_CA" --cert "$OS_CERT" --key "$OS_KEY" -X "$method" -w '\n%{http_code}')
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

# change METHOD PATH BODY: prints it and, except in dry-run mode, sends it.
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

  # What is missing: the requested users not already there, without repeats. If the mapping does not exist
  # it is created with them (nobody to remove); if it exists, they are added with PATCH `add` at the end of
  # `users`, which does not touch those already there.
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

# How it ends up.
request_to_indexer GET "$MAPPING_PATH"
if [ "$CODE" = 200 ]; then
  CURRENT_USERS="$(RESPONSE="$RESPONSE" python3 -c '
import json, os, sys
data = json.loads(os.environ.get("RESPONSE") or "{}")
print(", ".join((data.get(sys.argv[1]) or {}).get("users") or []))
' "$ROLE")"
  echo "users with the role $ROLE: ${CURRENT_USERS:-none}"
else
  echo "the role $ROLE is not assigned to anyone yet (assign it with --mapear <user>)"
fi
echo "Users with $ROLE or all_access can save the ENS configuration."
