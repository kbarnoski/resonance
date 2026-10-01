#!/bin/bash
# kiosk-deploy.sh — THE deploy path for the Tramokyo kiosk (2026-09-30).
# Guarantees: server rebuilt from HEAD, service restarted, PAGE reloaded,
# and both verified against the git commit before reporting success.
# Usage: scripts/kiosk-deploy.sh [jump:<journey-id>]
set -u
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd "$(dirname "$0")/.."
HEAD=$(git rev-parse --short=8 HEAD)
echo "deploying $HEAD"
launchctl bootout "gui/$(id -u)/com.resonance.tramokyo" 2>/dev/null
# Holding page on :3000 during the build — a kiosk page that reloads
# mid-deploy gets an auto-retrying "updating" screen instead of dying
# on a browser error page (2026-09-30: every deploy killed the page).
python3 - <<'PYEOF' > /tmp/kiosk-hold.log 2>&1 &
from http.server import BaseHTTPRequestHandler, HTTPServer
PAGE = b"""<!doctype html><html><head><meta http-equiv=refresh content=4><title>Resonance</title></head><body style='background:#000;color:rgba(255,255,255,0.5);font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>updatingâ¦</body></html>"""
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type","text/html"); self.end_headers(); self.wfile.write(PAGE)
    do_POST = do_GET
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 3000), H).serve_forever()
PYEOF
HOLD_PID=$!
npm run build > /tmp/kiosk-deploy-build.log 2>&1 || { kill $HOLD_PID 2>/dev/null; echo "BUILD FAILED — see /tmp/kiosk-deploy-build.log"; tail -5 /tmp/kiosk-deploy-build.log; exit 1; }
kill $HOLD_PID 2>/dev/null; sleep 1
# Restart with RETRIES (2026-10-01: bootstrap silently failed twice,
# leaving the venue dark mid-session — never trust one attempt).
C=""
for attempt in 1 2 3; do
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.resonance.tramokyo.plist" 2>/dev/null \
    || launchctl kickstart -k "gui/$(id -u)/com.resonance.tramokyo" 2>/dev/null
  for i in $(seq 1 20); do
    C=$(curl -s -m 3 localhost:3000/api/version | python3 -c "import json,sys;print(json.load(sys.stdin).get('commit',''))" 2>/dev/null)
    [ "$C" = "$HEAD" ] && break
    sleep 2
  done
  [ "$C" = "$HEAD" ] && break
  echo "restart attempt $attempt failed — booting out and retrying"
  launchctl bootout "gui/$(id -u)/com.resonance.tramokyo" 2>/dev/null
  sleep 3
done
[ "${C:-}" = "$HEAD" ] || { echo "SERVER NOT ON $HEAD (got '${C:-none}') AFTER 3 ATTEMPTS"; exit 1; }
echo "server OK ($C)"
# reload the page and wait until ITS reported build matches
curl -s -X POST localhost:3000/api/pack/remote -H "Content-Type: application/json" -d '{"command":"reload"}' -o /dev/null
PAGE=""
for i in $(seq 1 45); do
  sleep 2
  PAGE=$(curl -s -m 3 localhost:3000/api/pack/remote | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('status') or {}).get('build',''))" 2>/dev/null)
  [ "$PAGE" = "$HEAD" ] && break
done
if [ "$PAGE" = "$HEAD" ]; then
  echo "page OK ($PAGE) — kiosk fully on $HEAD"
else
  echo "WARNING: page build not confirmed (last seen '${PAGE:-none}') — send another reload or check the kiosk window"
  exit 2
fi
if [ $# -ge 1 ]; then
  curl -s -X POST localhost:3000/api/pack/remote -H "Content-Type: application/json" -d "{\"command\":\"$1\"}" -o /dev/null -w "sent $1\n"
fi
