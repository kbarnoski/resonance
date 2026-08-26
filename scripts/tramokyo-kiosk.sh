#!/bin/bash
# Tramokyo offline kiosk launcher — wrapped by ~/Desktop/Tramokyo.app.
#
# Starts the offline-pack server (unless it's already up, or launchd
# supervision owns it) and opens Chrome in kiosk mode on the LOCAL
# bootstrap page (scripts/tramokyo-bootstrap.html), which polls :3000
# and redirects to the attract loop once the server answers — so a
# launch or reload into a dead/restarting server self-heals instead of
# stranding Chrome on an error page.
#
# `caffeinate -disu` runs for the whole session (PID-filed) so the
# machine cannot sleep; tramokyo-stop.sh kills exactly what this script
# started — nothing else.
set -u

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/tmp/tramokyo-server.log
SERVER_PID_FILE=/tmp/tramokyo-server.pid
CAFFEINATE_PID_FILE=/tmp/tramokyo-caffeinate.pid
LABEL="com.resonance.tramokyo"
DOMAIN="gui/$(id -u)"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

cd "$APP_DIR"

if [ ! -d .next ]; then
  osascript -e 'display alert "Tramokyo" message "No production build found. Run: nvm use 20 && npm run build (or ask Claude) first." as critical' >/dev/null 2>&1
  exit 1
fi

# Keep the machine awake for the whole run: display, idle, system, and
# user-activity assertions. PID-filed so tramokyo-stop.sh kills exactly
# this one. tramokyo-server.sh wraps its own caffeinate too — this
# standalone one also covers the "server was already running" path and
# keeps the display awake between server restarts.
if [ ! -f "$CAFFEINATE_PID_FILE" ] || ! kill -0 "$(cat "$CAFFEINATE_PID_FILE" 2>/dev/null)" 2>/dev/null; then
  caffeinate -disu &
  echo $! > "$CAFFEINATE_PID_FILE"
fi

# If supervision is installed (plist present) but not loaded — e.g.
# Tramokyo Stop.app booted it out last night — re-load it so launchd
# owns the server again.
if [ -f "$PLIST_DST" ] && ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  launchctl bootstrap "$DOMAIN" "$PLIST_DST" 2>/dev/null || true
fi

# Start the server only if nothing answers on :3000. When launchd
# supervision is loaded the server is ITS job — kickstart it rather
# than racing it with a second process.
if ! curl -s -o /dev/null --max-time 2 http://localhost:3000; then
  if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || true
  else
    # `set -m` gives the background job its own process group, so the
    # stop script can take down the whole tree (server script →
    # caffeinate → npm → node) with one negative-PID kill.
    set -m
    nohup "$APP_DIR/scripts/tramokyo-server.sh" > "$LOG" 2>&1 &
    echo $! > "$SERVER_PID_FILE"
    set +m
  fi
fi

# Brief wait so the common case lands directly on a live server. NOT
# fatal on timeout — the bootstrap page keeps retrying forever, which
# is what an unattended venue needs; the notification is only so a
# human standing at the laptop notices a broken build sooner.
ok=""
for _ in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000; then ok=1; break; fi
  sleep 1
done
if [ -z "$ok" ]; then
  osascript -e 'display notification "Server not up yet — Chrome will keep retrying. Check /tmp/tramokyo-server.log if this persists." with title "Tramokyo"' >/dev/null 2>&1
fi

open -na "Google Chrome" --args \
  --user-data-dir="$HOME/.tramokyo-chrome" \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  "file://$APP_DIR/scripts/tramokyo-bootstrap.html"
