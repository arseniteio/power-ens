#!/usr/bin/env bash
###############################################################################
# deploy-plugin.sh · installs Power ENS AND makes the browser see it
#
#   sudo bash deploy-plugin.sh /path/to/power-ens-X.Y.Z-osd-2.19.5.zip
#
# The zip is the release one (power-ens-X.Y.Z-osd-2.19.5.zip) or the one build-plugin.sh leaves
# (power-ens-2.19.5.zip): same content. It only installs the `powerEns` plugin and only removes that one:
# a zip of any other plugin (the Wazuh one, `wazuh`, included) is rejected without touching anything.
# `bash deploy-plugin.sh --solo-id <zip>` prints the zip id and exits without touching anything. Exactly
# one zip: with more or fewer, it does nothing.
#
# Before stopping the dashboard it saves the plugin it will replace in
# ${POWER_ENS_BACKUP_DIR:-/var/backups}/power-ens, as plugins-<id>-<date>.tgz. That subfolder is OURS: it is
# created (root, 0700) if missing, and permissions of a folder it did not create are never changed
# (POWER_ENS_BACKUP_DIR may be /tmp or a folder others read). Not next to the zip: the next build deletes
# that folder. Only when the deployment ends well are the last 3 copies kept, so a deployment failing
# repeatedly does not push out the last good copy.
#
# If something fails with the dashboard already stopped, it says how to go back (restore that copy and
# start) and exits with error. Exit codes:
#   1 wrong usage · 2 the zip is not Power ENS's · 3 the copy could not be saved (nothing touched) ·
#   4 the dashboard user cannot read the zip (nothing touched) · 5 installation failed · 6 the dashboard
#   was not active at the end · 7 another step failed with the dashboard stopped.
#
# The installer runs as the wazuh-dashboard user. The zip is first copied to a temporary folder that user
# can read, and checked BEFORE stopping anything: a zip in a personal folder (0700) would make the
# installation fail with the dashboard already stopped.
#
# WHY THE LAST STEP IS NOT OPTIONAL. Installing the plugin does not make anyone see the change.
# OpenSearch Dashboards serves bundles at /{buildHash}/bundles/plugin/powerEns/powerEns.chunk.N.js and the
# `buildHash` comes from the `build.number` of the DASHBOARD's package.json, not the plugin's
# (`src/optimize/optimize_mixin.js`). Reinstalling changes the file on disk and NOT the URL; bundles are
# served as immutable per buildHash, so the browser keeps the old one cached, even with Ctrl+Shift+R.
# Raising `build.number` changes the URL of ALL bundles and forces a fresh request (one slower first load).
###############################################################################
set -euo pipefail

usage() {
  echo "usage: sudo bash deploy-plugin.sh /path/to/plugin.zip" >&2
  echo "       bash deploy-plugin.sh --solo-id /path/to/plugin.zip" >&2
  exit 1
}

ID_ONLY=0
if [ "${1:-}" = "--solo-id" ]; then
  ID_ONLY=1
  shift
fi

# A single zip, and a file: a second argument (a wildcard matching two zips, a mistyped option) is not silently
# ignored.
[ $# -eq 1 ] || usage
case "$1" in -*) usage ;; esac
[ -f "$1" ] || { echo "the zip does not exist: $1" >&2; usage; }

# Absolute path: `file://` with a relative path is not what it seems, and the installer runs as another user.
ZIP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OSD="${OSD:-/usr/share/wazuh-dashboard}"

# The plugin removed is the one in the zip, and can only be `powerEns`. Never a wildcard, never the Wazuh one
# (its official package installs it). awk reads the whole listing (no `exit`): cutting the pipe would kill
# unzip by SIGPIPE on a zip with node_modules and, with pipefail, the script would exit 141 silently.
PLUGIN_ID="$(unzip -Z1 "$ZIP" 2>/dev/null | awk -F/ '$1=="opensearch-dashboards" && $2!="" && id=="" {id=$2} END {print id}')"
case "$PLUGIN_ID" in
  powerEns) ;;
  wazuh)
    echo "the zip is the Wazuh plugin (id: 'wazuh'): deploy-plugin.sh only installs Power ENS (id: 'powerEns')." >&2
    echo "The Wazuh plugin is installed with the official wazuh-dashboard package; for Power ENS, use the release zip, power-ens-X.Y.Z-osd-2.19.5.zip." >&2
    exit 2
    ;;
  *)
    echo "the zip is not Power ENS's (id: '${PLUGIN_ID:-none}'): deploy-plugin.sh only installs the 'powerEns' plugin." >&2
    exit 2
    ;;
esac

if [ "$ID_ONLY" = 1 ]; then
  echo "$PLUGIN_ID"
  exit 0
fi

BACKUPS="${POWER_ENS_BACKUP_DIR:-/var/backups}/power-ens"
BACKUP=""
PACKAGE_BEFORE=""
STATE=""
STEP=""
STOPPED=0

# With the dashboard stopped, any exit with error (also a step failing through `set -e`, or Ctrl+C)
# says how to go back.
roll_back() {
  echo "To go back to how it was:"
  if [ -n "$BACKUP" ]; then
    echo "  sudo rm -rf $OSD/plugins/$PLUGIN_ID $OSD/plugins/.plugin.installing"
    echo "  sudo tar -xzf $BACKUP -C $OSD"
  else
    echo "  (there was no previous $PLUGIN_ID: start without it)"
    echo "  sudo rm -rf $OSD/plugins/$PLUGIN_ID $OSD/plugins/.plugin.installing"
  fi
  if [ -n "$PACKAGE_BEFORE" ]; then
    echo "  sudo cp -a $PACKAGE_BEFORE $OSD/package.json"
  fi
  echo "  sudo systemctl start wazuh-dashboard"
}
on_exit() {
  local rc=$?
  trap - EXIT
  if [ -n "${TEMP_ZIP_DIR:-}" ]; then rm -rf "$TEMP_ZIP_DIR"; fi
  if [ "$STOPPED" = 1 ] && [ "$rc" -ne 0 ]; then
    {
      echo
      case "$rc" in
        5) echo "THE INSTALLATION FAILED: the dashboard is stopped and without the $PLUGIN_ID plugin." ;;
        6) echo "THE DASHBOARD IS NOT ACTIVE (${STATE:-?}): check 'journalctl -u wazuh-dashboard'." ;;
        *) echo "STEP «${STEP}» FAILED (code $rc): the dashboard may have been left stopped or half-done."
           rc=7 ;;
      esac
      roll_back
    } >&2
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT TERM

# The backup folder, only if missing: then it is ours and born root, 0700. If it exists it is used as is;
# never a chmod/chown of something else's.
backup_folder() {
  [ -d "$BACKUPS" ] && return 0
  mkdir -p "$(dirname "$BACKUPS")" || return 1
  (umask 077 && mkdir "$BACKUPS") || return 1
  if [ "$(id -u)" -eq 0 ]; then
    chown root:root "$BACKUPS" || return 1
  fi
}

# The zip the dashboard user installs: a copy readable by it.
TEMP_ZIP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/power-ens-deploy.XXXXXX")"
ZIP_TO_INSTALL="$TEMP_ZIP_DIR/$PLUGIN_ID.zip"
chmod 755 "$TEMP_ZIP_DIR"
if ! { cp "$ZIP" "$ZIP_TO_INSTALL" && chmod 644 "$ZIP_TO_INSTALL" && sudo -u wazuh-dashboard test -r "$ZIP_TO_INSTALL"; }; then
  echo "the wazuh-dashboard user cannot read the zip copy in $TEMP_ZIP_DIR: nothing was touched." >&2
  echo "Check the permissions of ${TMPDIR:-/tmp} or give another temporary folder with TMPDIR=<folder>." >&2
  exit 4
fi

STEP="1/6 · saving the previous plugin ($PLUGIN_ID)"
echo "== $STEP"
if [ -d "$OSD/plugins/$PLUGIN_ID" ]; then
  BACKUP="$BACKUPS/plugins-$PLUGIN_ID-$(date +%Y%m%d_%H%M%S).tgz"
  if ! { backup_folder && tar -czf "$BACKUP" -C "$OSD" "plugins/$PLUGIN_ID"; }; then
    echo "could not save the previous plugin in $BACKUPS: nothing was touched." >&2
    rm -f "$BACKUP" 2>/dev/null || true
    exit 3
  fi
  echo "   saved in $BACKUP"
else
  echo "   no $PLUGIN_ID installed: nothing to save"
fi

STEP="2/6 · stopping the dashboard"
echo "== $STEP"
STOPPED=1
systemctl stop wazuh-dashboard

STEP="3/6 · removing the previous plugin ($PLUGIN_ID)"
echo "== $STEP"
# EXACT PATHS. Never a `wazuh*` wildcard: it would take `wazuhCore` and `wazuhCheckUpdates` with it and the
# dashboard would not start again.
sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" remove "$PLUGIN_ID" 2>/dev/null || true
rm -rf "$OSD/plugins/$PLUGIN_ID"
rm -rf "$OSD/plugins/.plugin.installing"

STEP="4/6 · installing"
echo "== $STEP"
if ! sudo -u wazuh-dashboard "$OSD/bin/opensearch-dashboards-plugin" install "file://$ZIP_TO_INSTALL"; then
  exit 5
fi

STEP="5/6 · invalidating the browser cache (raising build.number)"
echo "== $STEP"
# The rollback only names the package.json copy if that copy exists.
PACKAGE_COPY="$OSD/package.json.antes-$(date +%Y%m%d_%H%M%S)"
cp "$OSD/package.json" "$PACKAGE_COPY"
PACKAGE_BEFORE="$PACKAGE_COPY"
python3 - "$OSD/package.json" <<'PY'
import io, json, sys

path = sys.argv[1]

with io.open(path, encoding='utf-8') as f:
    package = json.load(f)

before = package['build']['number']
package['build']['number'] = str(int(before) + 1)

with io.open(path, 'w', encoding='utf-8') as f:
    json.dump(package, f, indent=2, ensure_ascii=False)
    f.write('\n')

print("   build.number: %s -> %s" % (before, package['build']['number']))
PY

STEP="6/6 · starting"
echo "== $STEP"
systemctl start wazuh-dashboard

for _ in $(seq 1 24); do
  if curl -sk -o /dev/null https://localhost:443/api/status 2>/dev/null; then
    break
  fi
  sleep 5
done

STATE="$(systemctl is-active wazuh-dashboard || true)"
echo
echo "dashboard: $STATE"
echo "plugins:   $(ls -1 "$OSD/plugins" | tr '\n' ' ')"
echo
if [ "$STATE" != "active" ]; then
  exit 6
fi

# Deployed and active: only now keep the last 3 copies of this plugin. The name carries the date, so
# alphabetical order is chronological.
if [ -n "$BACKUP" ]; then
  find "$BACKUPS" -maxdepth 1 -name "plugins-$PLUGIN_ID-*.tgz" -print \
    | sort -r | tail -n +4 | while IFS= read -r old; do rm -f "$old"; done
fi
echo "The bundle URL has changed: the browser will request them again by itself."
