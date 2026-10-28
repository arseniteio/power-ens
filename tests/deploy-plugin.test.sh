#!/usr/bin/env bash
# deploy-plugin.sh decides WHICH plugin to remove by looking at the zip, and never another.
#   bash tests/deploy-plugin.test.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
failures=0
zip_of() { mkdir -p "$T/$1/opensearch-dashboards/$2"; echo x > "$T/$1/opensearch-dashboards/$2/package.json"; (cd "$T/$1" && zip -qr "$T/$1.zip" opensearch-dashboards); }
expect() { local r; r="$(bash "$ROOT/config/deploy-plugin.sh" --solo-id "$2" 2>&1)"; local rc=$?
  if [ "$1" = ERROR ]; then [ $rc -ne 0 ] && echo "  ok   $3" || { echo "  FAIL $3 (rc 0, output: $r)"; failures=$((failures+1)); }
  else [ "$r" = "$1" ] && echo "  ok   $3" || { echo "  FAIL $3 (output: $r)"; failures=$((failures+1)); }; fi; }
zip_of a powerEns; zip_of b wazuh; zip_of c other
expect powerEns "$T/a.zip" "Power ENS zip -> powerEns"
expect ERROR "$T/b.zip" "the Wazuh plugin zip (wazuh) is rejected"
expect ERROR "$T/c.zip" "a plugin that is not Power ENS is rejected"
# The rejection says why, and in both cases touches nothing (code 2).
r="$(bash "$ROOT/config/deploy-plugin.sh" --solo-id "$T/b.zip" 2>&1)"; rc=$?
[ $rc -eq 2 ] && echo "$r" | grep -q "only installs Power ENS" && echo "$r" | grep -q "official wazuh-dashboard package" && echo "  ok   the Wazuh zip: clear message" || { echo "  FAIL the Wazuh zip: clear message (rc $rc: $r)"; failures=$((failures+1)); }
r="$(bash "$ROOT/config/deploy-plugin.sh" --solo-id "$T/c.zip" 2>&1)"; rc=$?
[ $rc -eq 2 ] && echo "$r" | grep -q "is not Power ENS's (id: 'other')" && echo "  ok   another zip: clear message" || { echo "  FAIL another zip: clear message (rc $rc: $r)"; failures=$((failures+1)); }
expect ERROR "$T/missing.zip" "no zip, error"
# A real zip (with node_modules) lists thousands of entries: if awk cuts the pipe before unzip finishes, SIGPIPE + pipefail = rc 141 without a message.
mkdir -p "$T/d/opensearch-dashboards/powerEns/node_modules/package"
for i in $(seq 1 3000); do : > "$T/d/opensearch-dashboards/powerEns/node_modules/package/file-with-a-long-name-$i.js"; done
(cd "$T/d" && zip -qr "$T/d.zip" opensearch-dashboards)
expect powerEns "$T/d.zip" "large zip (thousands of entries) -> powerEns"

# Arguments: exactly one zip (or `--solo-id <zip>`). All these cases exit with the usage error BEFORE touching anything; `systemctl` and `sudo` are replaced by stubs that fail with 99.
mkdir -p "$T/bin"
for c in systemctl sudo; do printf '#!/bin/sh\necho "TOUCHED: %s $*" >&2\nexit 99\n' "$c" > "$T/bin/$c"; chmod +x "$T/bin/$c"; done
reject() { local d="$1"; shift; local r; r="$(PATH="$T/bin:$PATH" OSD="$T/osd" bash "$ROOT/config/deploy-plugin.sh" "$@" 2>&1)"; local rc=$?
  [ $rc -eq 1 ] && echo "$r" | grep -q "usage:" && echo "  ok   $d" || { echo "  FAIL $d (rc $rc: $r)"; failures=$((failures+1)); }; }
reject "no arguments"
reject "two zips" "$T/a.zip" "$T/b.zip"
reject "--solo-id without a zip" --solo-id
reject "--solo-id with two zips" --solo-id "$T/a.zip" "$T/b.zip"
reject "an unknown option" --force "$T/a.zip"
reject "an option instead of the zip" -x
reject "a zip that does not exist" "$T/missing.zip"
# Relative path: resolved against the calling directory.
r="$(cd "$T" && bash "$ROOT/config/deploy-plugin.sh" --solo-id a.zip 2>&1)"
[ "$r" = powerEns ] && echo "  ok   zip with a relative path" || { echo "  FAIL zip with a relative path (output: $r)"; failures=$((failures+1)); }
# The whole deployment against a fake dashboard: `systemctl`, `sudo` and `curl` replaced, and a fake installer inside a temporary $OSD.
#   setup_env <dir> [no-plugin|cp-fails|unreadable]  · prepares $OSD and the stubs
#   deploy <dir>                                     · deploys; leaves the output and the code
setup_env() {
  local E="$1"
  mkdir -p "$E/bin" "$E/osd/bin" "$E/osd/plugins/wazuh"
  [ "${2:-}" = no-plugin ] || { mkdir -p "$E/osd/plugins/powerEns"; echo old > "$E/osd/plugins/powerEns/old.txt"; }
  echo '{"name": "dashboard", "build": {"number": "100"}}' > "$E/osd/package.json"
  echo active > "$E/state"
  cat > "$E/bin/systemctl" <<'STUB'
#!/bin/sh
echo "systemctl $* backups=$(ls "$POWER_ENS_BACKUP_DIR/power-ens" 2>/dev/null | grep -c .)" >> "$FAKE/log"
case "$1" in
  start) [ ! -f "$FAKE/fail-start" ] ;;
  is-active) cat "$FAKE/state"; [ "$(cat "$FAKE/state")" = active ] ;;
  *) exit 0 ;;
esac
STUB
  if [ "${2:-}" = unreadable ]; then
    printf '#!/bin/sh\n[ "$1" = -u ] && shift 2\n[ "$1" = test ] && exit 1\nexec "$@"\n' > "$E/bin/sudo"
  else
    printf '#!/bin/sh\n[ "$1" = -u ] && shift 2\nexec "$@"\n' > "$E/bin/sudo"
  fi
  printf '#!/bin/sh\nexit 0\n' > "$E/bin/curl"
  [ "${2:-}" = cp-fails ] && printf '#!/bin/sh\ncase "$1" in */package.json) exit 1 ;; esac\nexec /bin/cp "$@"\n' > "$E/bin/cp"
  cat > "$E/osd/bin/opensearch-dashboards-plugin" <<'STUB'
#!/bin/sh
OSD="$(cd "$(dirname "$0")/.." && pwd)"
echo "plugin $*" >> "$FAKE/log"
case "$1" in
  remove) rm -rf "$OSD/plugins/$2" ;;
  install)
    [ -f "$FAKE/fail-install" ] && exit 1
    rm -rf "$FAKE/zip" && mkdir -p "$FAKE/zip" && unzip -q "${2#file://}" -d "$FAKE/zip" \
      && mv "$FAKE/zip/opensearch-dashboards/powerEns" "$OSD/plugins/powerEns" ;;
esac
STUB
  chmod +x "$E/bin/"* "$E/osd/bin/opensearch-dashboards-plugin"
}
deploy() {
  local E="$1"
  mkdir -p "$E/tmp"
  (cd "$E" && PATH="$E/bin:$PATH" OSD="$E/osd" POWER_ENS_BACKUP_DIR="${BACKUPS:-$E/backups}" FAKE="$E" TMPDIR="$E/tmp" \
     bash "$ROOT/config/deploy-plugin.sh" "$T/a.zip" > "$E/output" 2>&1)
  echo $? > "$E/rc"
}
check_case() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; sed 's/^/        | /' "$E/output"; failures=$((failures+1)); fi; }
# Backups go to <POWER_ENS_BACKUP_DIR>/power-ens, a subfolder of their own.
backups_of() { find "$E/backups/power-ens" -maxdepth 1 -name "plugins-$1-*.tgz" 2>/dev/null | sort; }
new_backup() { backups_of powerEns | grep -v "20200101_" | tail -1; }
old_backups() { mkdir -p "$E/backups/power-ens"; for n in 1 2 3 4; do : > "$E/backups/power-ens/plugins-powerEns-20200101_00000$n.tgz"; done; }
mode_of() { ls -ld "$1" | cut -c1-10; }

# Success: the backup is made BEFORE stopping, goes to its subfolder (created 0700) and holds the previous plugin; the new one is installed and build.number goes up.
E="$T/success"; setup_env "$E"; deploy "$E"
check_case "full deployment: code 0" '[ "$(cat "$E/rc")" = 0 ]'
check_case "the backup exists before the dashboard is stopped" 'grep -q "^systemctl stop wazuh-dashboard backups=1$" "$E/log"'
check_case "the backup goes to POWER_ENS_BACKUP_DIR/power-ens, not next to the zip" '[ "$(backups_of powerEns | wc -l | tr -d " ")" = 1 ] && [ -z "$(ls "$T" | grep "^plugins-")" ]'
check_case "the backups subfolder, which it creates, is 0700" '[ "$(mode_of "$E/backups/power-ens")" = drwx------ ]'
check_case "the backup holds the previous plugin" 'tar -tzf "$(backups_of powerEns)" | grep -q "^plugins/powerEns/old.txt$"'
check_case "the new plugin is installed, the old one is not" '[ -f "$E/osd/plugins/powerEns/package.json" ] && [ ! -e "$E/osd/plugins/powerEns/old.txt" ]'
check_case "the installer receives file:// with the readable copy, not the original zip" 'grep -q "^plugin install file://$E/tmp/power-ens-deploy\.[A-Za-z0-9]*/powerEns\.zip$" "$E/log"'
check_case "the temporary copy of the zip is deleted at the end" '[ -z "$(ls "$E/tmp")" ]'
check_case "build.number goes up" 'python3 -c "import json,sys; sys.exit(json.load(open(\"$E/osd/package.json\"))[\"build\"][\"number\"] != \"101\")"'
check_case "the Wazuh plugin is not touched" '[ -d "$E/osd/plugins/wazuh" ] && ! grep -q "remove wazuh" "$E/log"'

# Rotation, after a deployment that ends well: only the last 3 of each plugin, without touching another id's. The subfolder already existed (0750): used as is, permissions unchanged.
E="$T/rotation"; setup_env "$E"; old_backups; chmod 0750 "$E/backups/power-ens"
: > "$E/backups/power-ens/plugins-other-20200101_000001.tgz"
deploy "$E"
check_case "rotation: 3 powerEns backups remain" '[ "$(backups_of powerEns | wc -l | tr -d " ")" = 3 ]'
check_case "rotation: they are the new one and the two most recent" '[ -f "$E/backups/power-ens/plugins-powerEns-20200101_000004.tgz" ] && [ -f "$E/backups/power-ens/plugins-powerEns-20200101_000003.tgz" ] && [ ! -e "$E/backups/power-ens/plugins-powerEns-20200101_000002.tgz" ] && [ -n "$(new_backup)" ]'
check_case "rotation: the backups of another plugin are not touched" '[ -f "$E/backups/power-ens/plugins-other-20200101_000001.tgz" ]'
check_case "a backups subfolder that already existed keeps its permissions" '[ "$(mode_of "$E/backups/power-ens")" = drwxr-x--- ]'

# POWER_ENS_BACKUP_DIR in a shared folder (1777, like /tmp): nothing is changed on it; backups go to their own subfolder, which is born 0700.
E="$T/shared"; setup_env "$E"; mkdir -p "$E/common"; chmod 1777 "$E/common"
BACKUPS="$E/common" deploy "$E"
check_case "shared folder (1777): full deployment" '[ "$(cat "$E/rc")" = 0 ]'
check_case "shared folder (1777): keeps its mode" '[ "$(mode_of "$E/common")" = drwxrwxrwt ]'
check_case "shared folder (1777): the backup goes to its 0700 subfolder" '[ "$(mode_of "$E/common/power-ens")" = drwx------ ] && [ -n "$(find "$E/common/power-ens" -name "plugins-powerEns-*.tgz")" ]'

# Failed installation: code 5 and the rollback, which works. And without rotating: a failed deployment does not push out the good earlier backups.
E="$T/install"; setup_env "$E"; old_backups; : > "$E/fail-install"; deploy "$E"
check_case "failed installation: code 5" '[ "$(cat "$E/rc")" = 5 ]'
check_case "failed installation: says how to roll back" 'grep -q "THE INSTALLATION FAILED" "$E/output" && grep -q "sudo tar -xzf $E/backups/power-ens/plugins-powerEns-.*\.tgz -C $E/osd" "$E/output" && grep -q "sudo systemctl start wazuh-dashboard" "$E/output"'
check_case "failed installation: the backup returns the previous plugin" 'tar -xzf "$(new_backup)" -C "$E/osd" && [ -f "$E/osd/plugins/powerEns/old.txt" ]'
check_case "failed installation: no rotation (the 4 old ones and the new one)" '[ "$(backups_of powerEns | wc -l | tr -d " ")" = 5 ]'

# Any other step with the dashboard stopped: code 7 and the rollback.
E="$T/python"; setup_env "$E"; echo '{"name": "dashboard"}' > "$E/osd/package.json"; deploy "$E"
check_case "impossible build.number (python3 fails): code 7" '[ "$(cat "$E/rc")" = 7 ]'
check_case "python3 fails: says the step and how to roll back, package.json included" 'grep -q "STEP «5/6" "$E/output" && grep -q "sudo cp -a $E/osd/package.json.antes-.* $E/osd/package.json" "$E/output" && grep -q "sudo tar -xzf" "$E/output" && grep -q "sudo systemctl start wazuh-dashboard" "$E/output"'
# If the package.json copy is never made, the rollback does not name it.
E="$T/cp"; setup_env "$E" cp-fails; deploy "$E"
check_case "the package.json copy fails: code 7" '[ "$(cat "$E/rc")" = 7 ] && grep -q "STEP «5/6" "$E/output"'
check_case "the package.json copy fails: the rollback does not name a copy that does not exist" '! grep -q "package.json.antes" "$E/output" && grep -q "sudo tar -xzf" "$E/output" && grep -q "sudo systemctl start wazuh-dashboard" "$E/output"'
E="$T/start"; setup_env "$E"; : > "$E/fail-start"; deploy "$E"
check_case "systemctl start fails: code 7" '[ "$(cat "$E/rc")" = 7 ]'
check_case "systemctl start fails: says the step and how to roll back" 'grep -q "STEP «6/6" "$E/output" && grep -q "sudo tar -xzf" "$E/output" && grep -q "sudo systemctl start wazuh-dashboard" "$E/output"'

# The dashboard is not active at the end: code 6, the rollback and no rotation.
E="$T/inactive"; setup_env "$E"; old_backups; echo failed > "$E/state"; deploy "$E"
check_case "dashboard not active at the end: code 6" '[ "$(cat "$E/rc")" = 6 ]'
check_case "dashboard not active: says how to roll back" 'grep -q "THE DASHBOARD IS NOT ACTIVE (failed)" "$E/output" && grep -q "sudo tar -xzf" "$E/output"'
check_case "dashboard not active: no rotation" '[ "$(backups_of powerEns | wc -l | tr -d " ")" = 5 ]'

# Unable to save the backup, nothing is stopped: code 3 and everything as it was.
E="$T/nobackup"; setup_env "$E"; : > "$E/file"; BACKUPS="$E/file/backups" deploy "$E"
check_case "impossible backup: code 3" '[ "$(cat "$E/rc")" = 3 ]'
check_case "impossible backup: the dashboard is not stopped and the plugin stays" '! grep -q "systemctl stop" "$E/log" 2>/dev/null && [ -f "$E/osd/plugins/powerEns/old.txt" ] && grep -q "nothing was touched" "$E/output"'

# Without a previous powerEns there is nothing to save, and it installs all the same.
E="$T/fresh"; setup_env "$E" no-plugin; deploy "$E"
check_case "no previous plugin: code 0 and no backup" '[ "$(cat "$E/rc")" = 0 ] && [ -z "$(backups_of powerEns)" ] && grep -q "nothing to save" "$E/output"'

# A zip the dashboard user cannot read: detected BEFORE stopping the dashboard (code 4) and nothing is touched.
E="$T/unreadable"; setup_env "$E" unreadable; deploy "$E"
check_case "zip unreadable by the dashboard: code 4 and nothing stopped" '[ "$(cat "$E/rc")" = 4 ] && ! grep -q "^systemctl" "$E/log" 2>/dev/null && grep -q "nothing was touched" "$E/output" && [ -f "$E/osd/plugins/powerEns/old.txt" ]'
check_case "unreadable zip: the temporary copy is deleted" '[ -z "$(ls "$E/tmp")" ]'

[ $failures -eq 0 ] && echo "ALL OK" || { echo "$failures FAILURES"; exit 1; }
