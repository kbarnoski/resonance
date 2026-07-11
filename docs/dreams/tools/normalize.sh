#!/usr/bin/env bash
# On-brand normalizer for dream prototype pages.
#
# Run this in the Validate step BEFORE `npm run build`, on every prototype
# file you created or edited this cycle. It rewrites off-brand Tailwind
# utilities to Resonance semantic tokens IN PLACE and is idempotent, so
# re-running it on an already-clean file is a no-op.
#
#   - chrome pass: text/bg/border/ring/fill/stroke -white  -> semantic tokens
#   - hue pass:    off-brand named hues (amber/emerald/rose/...) -> violet ramp
#                  (shade preserved, so gradients + luminance intent survive)
#
# Leaves alone: violet (brand), red (semantic error), neutrals (slate/gray/...),
# and any hex/hsl/named colors inside canvas/WebGL/shader art strings.
#
# Usage:
#   docs/dreams/tools/normalize.sh src/app/dream/<n>-<slug>/page.tsx [more files...]
#   docs/dreams/tools/normalize.sh            # no args: normalize every
#                                             #   dream page changed vs HEAD
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chrome="$here/normalize_chrome.pl"
named="$here/normalize_named.pl"

files=("$@")
if [ ${#files[@]} -eq 0 ]; then
  # default: every tracked/untracked dream page that differs from HEAD
  mapfile -t files < <(git diff --name-only HEAD -- 'src/app/dream/**/*.tsx'; git ls-files --others --exclude-standard -- 'src/app/dream/**/*.tsx')
fi

changed=0
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  before="$(cat "$f")"
  perl "$chrome" < "$f" | perl "$named" > "$f.norm"
  if ! cmp -s "$f" "$f.norm"; then
    mv "$f.norm" "$f"
    echo "normalized: $f"
    changed=$((changed+1))
  else
    rm -f "$f.norm"
  fi
done
echo "normalize.sh: $changed file(s) rewritten"
