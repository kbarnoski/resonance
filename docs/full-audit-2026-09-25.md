# Full audit — 2026-09-25 (overnight, 3-agent + fix wave)

Third formal audit (prior: 2026-08-14, 2026-08-25). Scope: security across
all 68 API routes, performance/endurance of the new render stack, and
correctness of everything shipped in the world-class pilot week. Every
finding below marked FIXED was fixed, type-checked, tested (143 pass),
and built the same night.

## Headline finding

**The Wave-2 living-video feature had never actually run.** Two independent
kill-switches: phase detection compared seconds against normalized 0-1
fractions (never matched), and the clip manifest fetch was gated on a
probe flag that is synchronously false at mount. Karel's "can't even tell
what is video" was literal. Both FIXED — and because the feature was dead,
the four CRITICAL video-decoder leaks the perf audit found had never fired
in production. All four FIXED before the feature's first real night.

## Security (all FIXED unless noted)

- **H-1 IDOR chain**: attacker-supplied `recording_id` on journey
  create/PATCH/share-builtin + service-role shared-audio resolver = read
  any user's master. Gated at all three writes via RLS-visibility check
  (`validate-recording-access.ts`).
- **H-2 spoofable rate limits**: first X-Forwarded-For hop is
  client-supplied; every per-IP limit was rotatable. Now last-hop /
  x-real-ip in `rate-limit.ts` + dream `api-guard.ts` (test updated).
  *Still open: connect Upstash KV in prod env so global caps survive cold
  starts (item carried from 08-25).*
- **M-2** flight-recorder log: 10MB rotation + per-IP throttle.
- **M-4/M-7** uncapped JSON bodies (`readJsonBody` 64KB, journey-feedback
  256KB, csp-report 16KB + throttle).
- **M-1** dead `isAuthed` removed. **L-1** committed anon JWT scrubbed
  from archive scripts (rotation still recommended).
- **Accepted by design** (unchanged): public yc-plan/deck pages (Karel
  publishes these); OFFLINE_PACK hotspot-open kiosk (M-3 — consider
  interface binding before the venue); CSP Report-Only promotion (M-5 —
  promote after report window); Kling heartbeat 16-hex tokens (L-2).

## Performance / endurance (FIXED)

- **C1-C4 video lifecycle**: releaseMedia on every eviction path +
  unmount; pushImage returns accepted/rejected; error listeners; journey
  epoch guards; honest videoBusy via pending ref; installation journey
  changes now fade out old VIDEO layers (stills still held — no-void rule).
- **H1 texture leaks** in parallax (allSettled + delete-on-drop) and the
  depth-manifest one-way latch (now two-way).
- **H3 DPR bump** gated on total device pixels — native-4K projector
  never pays the 2.25× fill on top of its 8.3Mpx.
- **H4 root CSS filter removed** — colorTemperature now a canvas tint in
  PostProcessingLayer (no whole-composite Skia pass, no stacking-context
  churn).
- **H5** parallax canvas removed from trails feed (WebGL readback blank).
- **M2** ResizeObserver size caches; **M3/M4** parallax loop armed only
  with textures + cached manifest; **L3/L4** one shared FFT read/frame,
  frame-rate-independent smoothing; **M5** heartbeat now reports dpr, JS
  heap, context-loss count; soft fps band (<40 sustained) logs.
- **H2 (dual/tertiary paused)**: VERIFIED OVERSTATED — retired dual
  layers are nulled/unmounted after fade; steady-state waste ≈ crossfade
  windows only. No change made; documented.

## Correctness (FIXED)

- **#1/#2** the two video kill-switches (above).
- **#3/M1** parallax slot aliasing — every crossfade after the first
  faded from BLACK. Rebuilt swap; first still seeds both slots.
- **#6** parallax displacement was ~100× sub-pixel (static image).
  Now a real base pan + depth differential inside an 8% overscan.
- **#7** parallax was OPAQUE at z-2, occluding the entire shader stack
  on exactly the pilot journeys. Now screen-blend at the imagery budget
  (1 − shaderOpacity), sharing the collage's mix contract.
- **#5** colorTemperature had two conventions (signed 0-neutral legacy vs
  0.5-neutral pilots) — legacy journeys were getting a permanent wrong-way
  hue rotate. Standardized SIGNED everywhere; pilot values migrated.
- **#8/#9/#10** dead `-2` sentinel (double decode per boundary), missing
  error handler (phase permanently skipped on one bad clip + phantom-hevc
  manifest honesty on the harvest side), video srcs spawning invisible
  clones that squatted clone slots.
- **#11** audio "breathing" normalized to the real music range (was a
  fixed 4-7% dim that never breathed); Ken Burns micro-push likewise.
- **#12** parallax GL re-init on a lost context — canvas now keyed per
  journey; manifest cached so covered→covered journeys never blank.
- **#16** singleton guard rebuilt claimless (Date.now() goes backward on
  NTP sync; newest-wins inverted the good-tab policy). Fullscreen
  incumbent now outranks a windowed newcomer.
- **#4** kiosk bootstrap probed /favicon.ico, which doesn't exist — probe
  now hits /icon.
- **#19-#22** run-build: heap flag appended not replaced, retries gated
  to the EBADF/EMFILE class; morph harvester: known-good Kling variant
  first, raw files cleaned in finally, ffmpeg stderr surfaced; bundle
  scratch files in tmpdir + gitignored.

## Still open (deliberate, for Karel)

1. Upstash KV env vars in Vercel prod (global rate caps).
2. CSP Report-Only → enforced (after report review).
3. OFFLINE_PACK interface binding or shared secret before the venue.
4. Supabase anon key rotation (was committed in archive scripts).
5. Pilot scale-out decision: ~$280-350 + ~25GB to take video/depth to all
   43 journeys.
