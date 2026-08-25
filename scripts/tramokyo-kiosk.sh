#!/bin/bash
# Tramokyo offline kiosk launcher — wrapped by ~/Desktop/Tramokyo.app.
# Starts the offline-pack server (if not already up) and opens Chrome
# in kiosk mode on the attract loop.
set -u

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG=/tmp/tramokyo-server.log

cd "$APP_DIR"

if [ ! -d .next ]; then
  osascript -e 'display alert "Tramokyo" message "No production build found. Run: npm run build (or ask Claude) first." as critical' >/dev/null 2>&1
  exit 1
fi

if ! curl -s -o /dev/null --max-time 2 http://localhost:3000; then
  OFFLINE_PACK=1 nohup npm run start > "$LOG" 2>&1 &
fi

ok=""
for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000; then ok=1; break; fi
  sleep 1
done

if [ -z "$ok" ]; then
  osascript -e 'display alert "Tramokyo" message "Server did not start — check /tmp/tramokyo-server.log" as critical' >/dev/null 2>&1
  exit 1
fi

open -na "Google Chrome" --args \
  --user-data-dir="$HOME/.tramokyo-chrome" \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  "http://localhost:3000/room/installation?loop=1"
