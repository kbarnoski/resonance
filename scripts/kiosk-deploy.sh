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
npm run build > /tmp/kiosk-deploy-build.log 2>&1 || { echo "BUILD FAILED — see /tmp/kiosk-deploy-build.log"; tail -5 /tmp/kiosk-deploy-build.log; exit 1; }
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.resonance.tramokyo.plist" 2>/dev/null \
  || launchctl kickstart -k "gui/$(id -u)/com.resonance.tramokyo"
# server up + on the new commit
for i in $(seq 1 30); do
  C=$(curl -s -m 3 localhost:3000/api/version | python3 -c "import json,sys;print(json.load(sys.stdin).get('commit',''))" 2>/dev/null)
  [ "$C" = "$HEAD" ] && break
  sleep 2
done
[ "${C:-}" = "$HEAD" ] || { echo "SERVER NOT ON $HEAD (got '${C:-none}')"; exit 1; }
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
