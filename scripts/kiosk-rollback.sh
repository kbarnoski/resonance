#!/bin/bash
# ROLL THE KIOSK BACK TO A RELEASE (Karel 2026-10-12: "mark this as a formal
# release and can get back to it if shit goes crazy off rails").
#
#   scripts/kiosk-rollback.sh                 → the latest tramokyo-release-* tag
#   scripts/kiosk-rollback.sh <tag>           → a specific release / baseline tag
#
# Deploys EXACTLY the tagged code to the kiosk (kiosk-deploy.sh builds the
# working tree), then puts the repo back on main. Your uncommitted work is
# stashed first and restored after. The show pack (media) is not in git — the
# Google Drive mirror (scripts/backup-to-drive.sh) holds the pack as of the
# release; restore it only if the pack itself was changed.
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-$(git tag -l 'tramokyo-release-*' --sort=-creatordate | head -1)}"
[ -n "$TAG" ] || { echo "no tramokyo-release-* tag found" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { git fetch -q --tags; git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "unknown tag: $TAG" >&2; exit 1; }; }
echo "rolling the kiosk back to $TAG ($(git rev-list -n1 --abbrev-commit "$TAG"))"
STASHED=0
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then git stash push -q -m "kiosk-rollback $(date +%F-%H%M)"; STASHED=1; fi
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git checkout -q --detach "$TAG"
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
ulimit -n 65536
NODE_OPTIONS=--max-old-space-size=8192 nice -n 5 scripts/kiosk-deploy.sh || { echo "deploy FAILED — the kiosk keeps what it had"; }
git checkout -q "$BRANCH"
[ $STASHED -eq 1 ] && git stash pop -q || true
echo "kiosk on $TAG; repo back on $BRANCH"
