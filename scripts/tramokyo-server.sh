#!/bin/bash
# Tramokyo offline-pack server — the ONE place `next start` is launched.
#
# Run three ways:
#   - launchd (com.resonance.tramokyo LaunchAgent): foreground; KeepAlive
#     restarts it if node crashes mid-show. Installed at the venue with
#     scripts/tramokyo-install-supervision.sh.
#   - tramokyo-kiosk.sh: backgrounded with a PID file when no launchd
#     supervision is installed.
#   - manually: scripts/tramokyo-server.sh
#
# `caffeinate -disu` wraps the server, holding display + idle + system +
# user-activity assertions for as long as the server runs — the machine
# cannot sleep during the show, and the assertions release automatically
# when the server exits.
set -u

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Resolve node dynamically — no hardcoded nvm version path. launchd and
# Automator/osascript shells start with a bare PATH, so probe in order:
# Homebrew, whatever is already on PATH, then the newest nvm install.
#
# NOTE for REBUILDS: `next build` must run under Node 20 (`nvm use 20`)
# — it dies with `spawn EBADF` during static generation under Node 22
# on macOS. `next start` (this script) runs fine on any recent Node, so
# picking the newest install here is safe.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  NVM_LATEST="$(ls -d "$HOME/.nvm/versions/node"/*/bin 2>/dev/null | sort -V | tail -1)"
  if [ -n "${NVM_LATEST:-}" ]; then
    export PATH="$NVM_LATEST:$PATH"
  fi
fi
if ! command -v node >/dev/null 2>&1; then
  echo "tramokyo-server: node not found (Homebrew, PATH, and ~/.nvm all empty)" >&2
  exit 1
fi

cd "$APP_DIR"

if [ ! -d .next ]; then
  echo "tramokyo-server: no production build in .next — run: nvm use 20 && npm run build" >&2
  exit 1
fi

export OFFLINE_PACK=1
exec caffeinate -disu npm run start
