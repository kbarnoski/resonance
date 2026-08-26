#!/bin/bash
# Tramokyo kiosk shutdown — wrapped by ~/Desktop/Tramokyo Stop.app.
#
# Only touches what the launcher started: the dedicated kiosk Chrome
# profile, the PID-filed server + caffeinate, and the launchd job (if
# supervision is installed). Never kills arbitrary processes on :3000 —
# a dev server someone else started stays untouched.
SERVER_PID_FILE=/tmp/tramokyo-server.pid
CAFFEINATE_PID_FILE=/tmp/tramokyo-caffeinate.pid
LABEL="com.resonance.tramokyo"
DOMAIN="gui/$(id -u)"

# Kiosk Chrome — uniquely identified by its dedicated profile dir.
pkill -f "tramokyo-chrome" 2>/dev/null

# Supervised server: bootout stops it AND prevents KeepAlive respawn
# until the next login (or the next Tramokyo.app launch, which re-loads
# the agent). The installed plist stays in ~/Library/LaunchAgents.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null

# Unsupervised server: kill the process group tramokyo-kiosk.sh started
# (server script → caffeinate → npm → node).
if [ -f "$SERVER_PID_FILE" ]; then
  PID="$(cat "$SERVER_PID_FILE" 2>/dev/null)"
  if [ -n "$PID" ]; then
    kill -TERM -- "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null
  fi
  rm -f "$SERVER_PID_FILE"
fi

# Session caffeinate — release the sleep assertions.
if [ -f "$CAFFEINATE_PID_FILE" ]; then
  PID="$(cat "$CAFFEINATE_PID_FILE" 2>/dev/null)"
  [ -n "$PID" ] && kill "$PID" 2>/dev/null
  rm -f "$CAFFEINATE_PID_FILE"
fi

exit 0
