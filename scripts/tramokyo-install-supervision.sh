#!/bin/bash
# Install (or remove) launchd supervision for the Tramokyo offline server.
#
#   scripts/tramokyo-install-supervision.sh              # install + load
#   scripts/tramokyo-install-supervision.sh --uninstall  # stop + remove
#
# Installs com.resonance.tramokyo as a per-user LaunchAgent: the
# OFFLINE_PACK server (scripts/tramokyo-server.sh) runs at login and is
# restarted automatically if it crashes. Pair with macOS auto-login so
# a power cut recovers to a live server with zero human intervention.
#
# VENUE-ONLY: run this on the installation laptop at setup time, NOT on
# a dev machine — the agent holds :3000 and a caffeinate assertion for
# as long as it is loaded.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.resonance.tramokyo"
PLIST_SRC="$APP_DIR/scripts/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
SERVER_PID_FILE=/tmp/tramokyo-server.pid

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "Supervision removed: $LABEL unloaded, plist deleted."
  echo "The supervised server (if it was running) has been stopped."
  exit 0
fi

if [ ! -f "$PLIST_SRC" ]; then
  echo "Missing template: $PLIST_SRC" >&2
  exit 1
fi
if [ ! -d "$APP_DIR/.next" ]; then
  echo "WARNING: no production build in .next — the supervised server will" >&2
  echo "crash-loop until you build (nvm use 20 && npm run build)." >&2
fi

# If an unsupervised server (started by tramokyo-kiosk.sh) is running,
# stop its process group first so the launchd instance can bind :3000.
if [ -f "$SERVER_PID_FILE" ]; then
  PID="$(cat "$SERVER_PID_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "Stopping unsupervised server (pid $PID) so launchd can take over…"
    kill -TERM -- "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
    sleep 2
  fi
  rm -f "$SERVER_PID_FILE"
fi

mkdir -p "$HOME/Library/LaunchAgents"
# Substitute the repo path into the template.
sed "s|__APP_DIR__|$APP_DIR|g" "$PLIST_SRC" > "$PLIST_DST"

# Reload cleanly if a previous version is already loaded.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST_DST"
launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || true

echo "Supervision installed: $LABEL"
echo "  plist:  $PLIST_DST"
echo "  logs:   /tmp/tramokyo-server.log"
echo "  status: launchctl print $DOMAIN/$LABEL"
echo
echo "The server now starts at login and restarts on crash."
echo "Tramokyo Stop.app (tramokyo-stop.sh) unloads it for the night;"
echo "Tramokyo.app (tramokyo-kiosk.sh) re-loads it on the next launch."
