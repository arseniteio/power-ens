#!/usr/bin/env bash
# An ACTIVE control without rules makes tests/check-consistency.py fail unless declared with a reason in tests/controls-without-rules.json.
#   bash tests/control-without-rules.test.sh
#
# Runs the REAL check on a plugin copy with an invented ACTIVE control without a runbook (op.zzz.9, a copy of op.exp.10's catalog); only check 14 is looked at.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
failures=0

ok()   { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; failures=$((failures + 1)); }

PLUGIN="$TMP/plugin"
mkdir -p "$PLUGIN"
cp -R "$ROOT/tests" "$ROOT/public" "$ROOT/common" "$ROOT/config" "$ROOT/agent" "$PLUGIN/"
sed -e "s/^  id: 'op.exp.10',\$/  id: 'op.zzz.9',/" \
  "$ROOT/common/ens/catalog/op-exp-10.ts" > "$PLUGIN/common/ens/catalog/op-zzz-9.ts"

grep -q "^  id: 'op.zzz.9',\$" "$PLUGIN/common/ens/catalog/op-zzz-9.ts" \
  && grep -q "^  status: 'ACTIVE',\$" "$PLUGIN/common/ens/catalog/op-zzz-9.ts" \
  || { echo "  FAIL broken fixture: op.zzz.9 is not ACTIVE in the copied catalog"; exit 1; }

# Declares (or not) op.zzz.9 in the list, with the reason passed in.
declare_control() {
  python3 - "$PLUGIN/tests/controls-without-rules.json" "$@" <<'PY'
import json, sys
path = sys.argv[1]
declared = json.load(open(path, encoding="utf-8"))
declared.pop("op.zzz.9", None)
if len(sys.argv) > 2:
    declared["op.zzz.9"] = sys.argv[2]
json.dump(declared, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
}

run_check() { python3 "$PLUGIN/tests/check-consistency.py" 2>&1 | sed -n '/=== 14\./,$p'; }

echo "1. ACTIVE, without rules and undeclared: fails"
declare_control
output="$(run_check)"
if printf '%s\n' "$output" | grep -q '^FAIL   op.zzz.9: ACTIVE without rules and undeclared$'; then
  ok "check 14 flags it"
else
  fail "check 14 does not flag it"; printf '%s\n' "$output" | sed 's/^/       | /'
fi

echo "2. Reversal: declared with its reason, does not fail"
declare_control "test documentary control: everything is declared on screen"
output="$(run_check)"
if printf '%s\n' "$output" | grep -q '^FAIL   op.zzz.9'; then
  fail "declared, it still fails"; printf '%s\n' "$output" | sed 's/^/       | /'
else
  ok "declared, check 14 admits it"
fi
if printf '%s\n' "$output" | grep -qE 'without rules: (.*, )?op\.zzz\.9(,|$)'; then
  ok "and names it among those judged without a runbook"
else
  fail "does not name it among those judged without a runbook"; printf '%s\n' "$output" | sed 's/^/       | /'
fi

echo "3. Declared without a reason: fails"
declare_control "   "
output="$(run_check)"
if printf '%s\n' "$output" | grep -q '^FAIL   op.zzz.9: declared without rules but without a reason$'; then
  ok "an empty reason is not valid"
else
  fail "an empty reason passes"; printf '%s\n' "$output" | sed 's/^/       | /'
fi

echo "4. A catalog file without \`status\`: fails, is not skipped"
declare_control
sed -i.bak "/^  status: 'ACTIVE',\$/d" "$PLUGIN/common/ens/catalog/op-zzz-9.ts" && rm -f "$PLUGIN/common/ens/catalog/op-zzz-9.ts.bak"
output="$(run_check)"
if printf '%s\n' "$output" | grep -q '^FAIL   unreadable catalog: op-zzz-9.ts: without `status` of the control$'; then
  ok "a catalog without status is flagged"
else
  fail "a catalog without status passes silently"; printf '%s\n' "$output" | sed 's/^/       | /'
fi

echo
[ "$failures" -eq 0 ] && echo "ALL OK" || { echo "$failures check(s) FAIL"; exit 1; }
