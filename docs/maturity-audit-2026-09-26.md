# Maturity audit — 2026-09-26 (post scale-out, same-night fix wave)

Fourth formal audit. Focus: everything AROUND the code — ops, docs,
tests, dependencies, failure UX. All agent-fixable items below were
fixed the same night; the short Karel-only list is at the bottom.

## Fixed tonight

**Dependencies / supply chain**
- next 15.5.15 → **15.5.26** (2 critical + 22 high advisories cleared)
- Production `npm audit`: **0 high/critical** (overrides for the two
  transitive pins: jsondiffpatch, postcss; 177 tests + full build green)
- Dependabot enabled (weekly npm, monthly actions); `npm audit
  --audit-level=high` now gates every deploy in CI
- ffmpeg-static kept in `dependencies` (runtime dep of the ALAC
  transcode route — the devDependencies move would have broken it)
- @types/node ^24 to match engines/CI; build heap 4G → 6G (15.5.26
  needs it at 1,250 pages)

**Operational readiness**
- `npm run preflight` — one-command show-readiness (manifests,
  manifest→disk integrity, random clip decode, audio, disk, server);
  fails cleanly on a missing/half-copied pack
- `scripts/tramokyo-backup.sh <drive> [restore]` — 12GB pack + build to
  external drive with checksum manifest; restore auto-runs preflight
- **Dead-man's switch**: `/api/installation/watchdog` + Vercel cron
  (every 5 min) alerts a webhook when heartbeats go silent >6 min or
  fps sits under 40. Dormant until `WATCHDOG_WEBHOOK_URL` is set.
- Logs off /tmp (wiped on reboot) → `~/Library/Logs/Tramokyo/`

**Failure UX**
- **Imagery error boundary in the kiosk** — a throw anywhere in the
  September imagery stack (video/parallax/collage/trails) now degrades
  to shaders-only and logs to the flight recorder instead of ending a
  65-minute unattended show; auto-retries next journey
- Route error/loading boundaries added: (room) + (studio) group level,
  journey/[token], share/[token], path/[token], remote,
  installation/status — the public share links no longer fall to the
  generic root screen

**Tests**
- Suite 147 → **177**: pack-image-allocation contract tests (the
  "Ghost played backwards" family — monotonic progress mapping,
  largest-remainder totals, harvest/playback parity),
  recording-access IDOR gate, and 8 dream test files that vitest's
  `include` had silently orphaned (all passed on first inclusion)

**Docs**
- `installation-venue-setup.md`: living-media pack section (dual-codec
  law, manifests, rebuild procedure), full harvest pipeline, 2026-09
  Node/build policy, preflight/backup/log locations, new
  troubleshooting rows, printable mid-show escalation ladder
- `tramokyo-plan.md`: SBL/March Light marked SHIPPED; Phase 5 added
- `README.md`: deploy section corrected (CI gate, not auto-deploy);
  Node 20 note in local dev

**Kiosk security (audit M-3 mitigation)**
- `TRAMOKYO_REMOTE_KEY` — optional shared key on the remote command
  bus; set it at the venue and /remote requires `?key=`

## Deferred with reasons

- **CSP enforcement**: promoting blind risks breaking prod visuals.
  Safe path: read a week of csp-report output first (reports currently
  land in Vercel logs), then promote the nonce policy.
- **Lint debt (250 warnings)**: the 47 `react-hooks/exhaustive-deps`
  warnings in `src/components/audio/**` are the class that hides real
  bugs, but dependency-array edits change behavior — not a safe bulk
  fix the night before show-readiness. Recommend one focused session.
- **ai@4→5, zod 3→4, vitest 2→3 majors**: migration debt, not risk.

## Karel-only list

1. `WATCHDOG_WEBHOOK_URL` (a Slack/Discord incoming webhook URL) +
   `CRON_SECRET` in Vercel env → the dead-man's switch goes live
2. Upstash KV env vars in Vercel (global rate caps across lambdas)
3. Supabase anon-key rotation (an old key was committed in archive
   scripts — scrubbed, but rotation closes it)
4. At the venue: set `TRAMOKYO_REMOTE_KEY` in the kiosk env
5. Verify one ALAC upload transcodes on the next prod deploy (ffmpeg
   trace is load-bearing after the next bump)
