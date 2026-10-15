#!/bin/bash
# Tramokyo KIOSK PAGE watchdog (2026-10-15, show day). launchd supervises the
# SERVER; nothing watched the PAGE: after the lid closed the kiosk Chrome came
# back from sleep with no page (no events for an hour, the phone showed a stale
# status). Every 30 s: if the page hasn't reported to /api/pack/remote for
# STALE_S while the server is up, relaunch the kiosk (no dialog).
#
# Lives with the kiosk session: started (PID-filed) by tramokyo-kiosk.sh,
# killed by tramokyo-stop.sh. Exits by itself when the session caffeinate is
# gone (the show was stopped). Never acts during a deploy. NEVER edit this
# file while it runs (bash reads scripts incrementally) — stop + relaunch.
set -u
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CAFFEINATE_PID_FILE=/tmp/tramokyo-caffeinate.pid
STALE_S=${TRAMOKYO_WATCHDOG_STALE_S:-180}
LOG="$HOME/Library/Logs/Tramokyo/kiosk-watchdog.log"
mkdir -p "$(dirname "$LOG")"
last_relaunch=0
while true; do
  sleep 30
  # the session ended (Tramokyo Stop): bow out
  if [ ! -f "$CAFFEINATE_PID_FILE" ] || ! kill -0 "$(cat "$CAFFEINATE_PID_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "$(date '+%F %T') session over — watchdog exits" >> "$LOG"; exit 0
  fi
  # a deploy owns the kiosk while it runs
  pgrep -f "kiosk-deploy.sh" >/dev/null && continue
  age_ms=$(curl -s -m 4 http://localhost:3000/api/pack/remote | /usr/bin/python3 -c 'import json,sys;print(int(json.load(sys.stdin).get("statusAgeMs") or 0))' 2>/dev/null || echo -1)
  # server down: launchd's job, not ours
  [ "$age_ms" = "-1" ] && continue
  now=$(date +%s)
  if [ "$age_ms" -gt $((STALE_S * 1000)) ] && [ $((now - last_relaunch)) -gt 300 ]; then
    echo "$(date '+%F %T') kiosk page silent ${age_ms} ms — relaunching" >> "$LOG"
    last_relaunch=$now
    TRAMOKYO_NO_DIALOG=1 TRAMOKYO_FROM_WATCHDOG=1 "$APP_DIR/scripts/tramokyo-kiosk.sh" >> "$LOG" 2>&1
  fi
done
