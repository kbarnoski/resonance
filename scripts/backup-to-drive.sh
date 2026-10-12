#!/bin/bash
# Back up everything git does NOT hold to Google Drive (Drive for desktop folder).
# Code lives in GitHub; this covers the irreplaceable rest: the show pack
# (stills, clips, depth, audio), ~/Documents/Resonance (locked takes, backups),
# the Suno source songs and the gitignored decks/docs/LoRA set.
#
# A plain folder MIRROR, not a zip: the media is already compressed (a zip saves
# ~nothing), a single 9 GB file restarts from zero on any network hiccup, and a
# mirror means the next run only sends what changed (rsync), and restoring is
# just copying the folder back.
#
# NOT backed up here, on purpose:
#   .env.local (secrets) → keep it in a password manager, never in Drive
#   node_modules, .next, src-tauri/target → rebuilt from code
#   ~/resonance-pack-backups → older pack snapshots (superseded by this mirror)
#
# Never run while the kiosk is being watched or tested (disk + upload load).
# usage: scripts/backup-to-drive.sh [--dry-run]
set -euo pipefail
DRIVE="$HOME/Library/CloudStorage/GoogleDrive-kbarnoski@gmail.com/My Drive"
[ -d "$DRIVE" ] || { echo "Google Drive folder not found: $DRIVE" >&2; exit 1; }
DEST="$DRIVE/Resonance Backup"
APP="$HOME/my-app"
DRY=(); [ "${1:-}" = "--dry-run" ] && DRY=(--dry-run)
mkdir -p "$DEST/my-app-ignored"
R=(nice -n 19 rsync -a --delete --human-readable --stats ${DRY[@]+"${DRY[@]}"} --exclude .DS_Store)

"${R[@]}" "$APP/public/tramokyo-pack/" "$DEST/tramokyo-pack/"
"${R[@]}" "$HOME/Documents/Resonance/" "$DEST/Documents-Resonance/"
"${R[@]}" "$HOME/Desktop/Suno Songs/" "$DEST/Suno Songs/"
for f in Resonance-Pitch-Deck.pptx docs/Karel-Barnoski-Bio.docx docs/Resonance-Deck.pptx \
         docs/Resonance-Installation-Deck.pptx docs/Resonance-Vision-Deck.pptx \
         journey-feedback.jsonl scripts/_ghost-lora-training.zip; do
  [ -e "$APP/$f" ] && "${R[@]}" --relative "$APP/./$f" "$DEST/my-app-ignored/"
done
{
  echo "Resonance backup — $(date)"
  echo "code: $(cd "$APP" && git rev-parse --short HEAD) (github: $(cd "$APP" && git remote get-url origin))"
  echo "restore: copy tramokyo-pack back to ~/my-app/public/tramokyo-pack; Documents-Resonance to ~/Documents/Resonance"
  echo "secrets (.env.local) are NOT here — restore them from the password manager"
} > "$DEST/README.txt"
echo "backup done → $DEST"
