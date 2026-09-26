#!/bin/bash
# The ONE way `next build` runs (wired as package.json "build").
#
# Permanently absorbs the macOS `spawn EBADF` flake in Next's static-
# generation workers: it is triggered by pathological default fd limits
# (huge/unlimited) and by fd pressure under load. Fix = always run with
# a sane explicit limit + the heap the 1,200-page build needs + retry,
# so no human ever has to remember the incantation again.
#
# Safe everywhere: on Vercel/CI the ulimit call is a no-op if the hard
# limit forbids it, and a clean first attempt exits immediately.
set -uo pipefail

# macOS ONLY: its pathological default fd limits break Next's static
# workers (spawn EBADF) and an explicit sane limit fixes it. On Linux/
# Vercel the defaults are correct and clamping them causes the opposite
# failure (EMFILE during static generation — broke prod deploys
# 2026-09-25, run "dream: cycle 1259"). Never apply it off-Darwin.
if [ "$(uname)" = "Darwin" ]; then
  ulimit -n 10240 2>/dev/null || true
fi
# APPEND the heap bump (audit #20: ":-" silently dropped it whenever
# NODE_OPTIONS was already set, e.g. on CI).
case "${NODE_OPTIONS:-}" in
  *max-old-space-size*) : ;;
  "") export NODE_OPTIONS="--max-old-space-size=4096" ;;
  *) export NODE_OPTIONS="$NODE_OPTIONS --max-old-space-size=4096" ;;
esac

ERRLOG="${TMPDIR:-/tmp}/run-build-$$.err"
: > "$ERRLOG"
for attempt in 1 2 3; do
  : > "$ERRLOG"
  next build > >(tee -a "$ERRLOG") 2> >(tee -a "$ERRLOG" >&2)
  code=$?
  [ $code -eq 0 ] && { rm -f "$ERRLOG"; exit 0; }
  echo "run-build: attempt ${attempt} failed (exit ${code})" >&2
  # Retry ONLY the transient fd classes (audit #20) — a genuine type error
  # would otherwise cost 3× a 1,200-page build.
  if ! grep -q "spawn EBADF\|EMFILE" "$ERRLOG" 2>/dev/null; then
    echo "run-build: not the EBADF/EMFILE class — not retrying" >&2
    rm -f "$ERRLOG"
    exit $code
  fi
done
rm -f "$ERRLOG"
echo "run-build: giving up after 3 attempts" >&2
exit $code
