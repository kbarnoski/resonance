#!/bin/bash
# tramokyo-backup.sh — back up the 12GB offline pack + production build to
# an external drive, with a checksum manifest for restore verification.
# (Maturity audit 2026-09-26 #9 — the pack exists in exactly one place.)
#
#   scripts/tramokyo-backup.sh /Volumes/YourDrive        # backup
#   scripts/tramokyo-backup.sh /Volumes/YourDrive restore # restore
#
# After a restore, run: npm run preflight  (verifies manifest→disk integrity)
set -euo pipefail
DEST="${1:?usage: tramokyo-backup.sh /Volumes/Drive [restore]}"
MODE="${2:-backup}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$DEST/tramokyo-backup"

if [ "$MODE" = "restore" ]; then
  [ -d "$TARGET/tramokyo-pack" ] || { echo "no backup at $TARGET"; exit 1; }
  echo "Restoring pack (this copies ~12GB — minutes on USB3)..."
  rsync -a --delete "$TARGET/tramokyo-pack/" "$APP_DIR/public/tramokyo-pack/"
  [ -d "$TARGET/next-build" ] && rsync -a --delete "$TARGET/next-build/" "$APP_DIR/.next/"
  echo "Restore complete. Verifying..."
  (cd "$APP_DIR" && node scripts/tramokyo-preflight.mjs)
  exit $?
fi

mkdir -p "$TARGET"
echo "Backing up pack (~12GB — expect several minutes on USB3)..."
rsync -a --delete "$APP_DIR/public/tramokyo-pack/" "$TARGET/tramokyo-pack/"
if [ -d "$APP_DIR/.next" ]; then
  echo "Backing up production build..."
  rsync -a --delete "$APP_DIR/.next/" "$TARGET/next-build/"
fi
echo "Writing checksum manifest (spot-verifiable)..."
( cd "$TARGET/tramokyo-pack" && find . -type f \( -name "*.json" -o -name "*.mp4" \) -print0 \
  | xargs -0 shasum -a 256 > "$TARGET/checksums.sha256" )
COUNT=$(wc -l < "$TARGET/checksums.sha256" | tr -d ' ')
echo "Backup complete: $TARGET ($COUNT files checksummed)"
echo "Verify anytime:  (cd '$TARGET/tramokyo-pack' && shasum -c ../checksums.sha256 --quiet && echo OK)"
