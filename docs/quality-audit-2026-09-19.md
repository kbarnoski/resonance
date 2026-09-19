# Quality audit — 2026-09-19

Five parallel deep reviews (Tramokyo runtime, 24h change delta, audio core,
API security surface, long-run performance) over the installation stack and
the whole Resonance app. Every finding below was verified against the code
before being fixed or logged. Fixes shipped in this commit; deferred items
listed at the end with reasoning.

## Fixed — security (prod)

- **fal master-key mint bypass (P1)** — the ai-image token proxy allowed any
  `*.fal.ai` host, including `rest.alpha.fal.ai` (fal's token-mint REST API),
  with no app-path check: one request could mint a long-lived JWT scoped to
  ANY model, escaping every rate limit. Hosts are now exact-match compute
  hosts (app-path-scoped) + fal.media assets only.
- **Eleven unmetered LLM routes (P1)** — with self-signup open, chat/story/
  poetry/journeys-draft/create/auto-generate/backfill/analysis-summarize/
  insights-summarize had no rate limit and unbounded input. All now gate
  through `src/lib/api/llm-guard.ts`: per-user token bucket (burst 10,
  ~180/hr) + 64KB body cap + safe JSON parse (400s instead of 500s).
- **Audio released-set drift (P2)** — `/api/audio/[id]`'s anon resolver used
  a raw `share_token OR is_featured` filter while the analysis route used
  `recording_is_released()`; a quarantined track with a leftover share token
  was fetchable by UUID. Both now agree on the SECURITY DEFINER fn.
- **Arbitrary LoRA/reference URLs (P2)** — `/api/ai-image/generate` forwarded
  `characterLora` / `referenceImageUrl` unvalidated (arbitrary remote
  .safetensors on our fal account). Now https + fal.media-family hosts only.
- **Error-text leaks (P2)** — featured/draft/backfill no longer echo raw
  Supabase/provider error text.

## Fixed — the overnight-wedge root cause

- **WebGL context churn (P1)** — dual/tertiary shader layers created ~250
  fresh GL contexts/hour and never released them; Chrome's ~16-context cap
  force-loses the OLDEST (the persistent primary A/B layers). Contexts are
  now explicitly released via `WEBGL_lose_context` at unmount (unmount-only —
  shader switches reuse the canvas).
- **Dead recovery (P0)** — when a context loss never fired `restored`, the
  8s fallback re-ran GL setup on the SAME canvas → same lost context → layer
  black until the 18-min wedge reload. The canvas is now keyed on the
  recovery epoch, so recovery mounts a FRESH canvas/context (Visualizer3D's
  existing pattern).
- **Compositor load (P1)** — the AI-image 2D compositing loop ran at display
  refresh (120fps) forever, even with zero layers. Now capped at 45fps and
  skipped entirely when empty.

## Fixed — show correctness (Tramokyo)

- **Wrong track after sleep/wake (P1)** — the recovery interval captured the
  mount-time program's sequence; after a set transition it re-loaded a track
  from the WRONG program. Now reads the live sequence via ref, and its
  `canplay` once-listener gained an 8s removal timeout + phase guard (a stale
  one could seek the NEXT journey's track).
- **Watchdogs resuming the outgoing track (P1)** — operator skip's 2s
  fade-to-silence left `isPlaying: true`, so the 250ms play watchdogs ramped
  the outgoing track back up mid-breath. The breath now pauses the store
  (statement-phase pattern), and the deferred pause is phase-guarded.
- **Audio bleed on program jumps (P1)** — "Start from" jumps paused only the
  element; the watchdog resumed the old track under the statement card for
  ~10s. Jumps now pause the store; journey jumps also unfreeze the journey
  engine (jumping out of credits used to leave shader rotation frozen for a
  whole set).
- **Truncated-file freeze class (P1)** — a file that ends far short of its
  metadata (the-tempest incident) used to strand the show in silence until
  the 8-min cap. A rejected `ended` on an element that stays ended+paused
  for 10s now flight-records `skip-auto … (truncated file?)` and advances.
- **DJ launches of unpaired journeys (P1)** — deterministic 404s stranded
  silent journeys: the phone listed ALL journeys and `journey:random` drew
  from all of them. Both now offer paired journeys only; failures
  flight-record `dj-launch-failed`. The break→journey command race (both
  drained in one poll, journey dropped in loop context) is sequenced with a
  3.5s delay.
- **Skip dead at boundaries (P2)** — Next now works during the set-boundary
  intro (cuts the ~26s choreography) and the credits hold.
- **Journey imagery lingering across journeys (P1)** — the pack-cadence refs
  (`lastPackIndexRef` etc.) never reset on journey change; with the
  no-purge installation rule, journey A's imagery could hold over journey B.
  Reset on journey start; curated `localImageUrls` journeys are exempt from
  phase mapping (they have no phase encoding).
- **Phase-map guard (P2)** — DB journeys whose phase JSON lacks start/end now
  fall back to sequential cycling instead of collapsing to slice 0.
- **Pack probe retry (P2)** — one failed `/api/pack/local-images` probe at
  page load no longer disables the phone remote + pack imagery for the whole
  session.
- **All-program audio pre-warm (P2)** + **hidden preload element teardown**.

## Fixed — audio core

- **Volume never applied (P1)** — the engine played at gain 1.0 while the
  store said 0.8 until the first slider touch. Store volume now applies the
  moment the engine initializes.
- **`ended`-flag landmine (P1)** — `startJourney`'s unconditional
  `currentTime = 0` cleared `el.ended` on the PREVIOUS track, re-arming
  watchdogs against it on every cycle wrap. Now guarded: never scrub an
  ended element.
- **Cache-buster integrity (P2)** — the pack mtime was itself cached
  module-level, defeating in-place file repair; now stat-per-request. Pack
  URLs also never route through `?transcode=1` (offline it returns JSON,
  which the audio element can't play).
- **iOS `interrupted` state (P2)** — `ensureResumed` now recovers the
  AudioContext after calls/Siri on the /demo path.
- **Frame-callback release, empty-queue semantics** (`setQueue([],0)` no
  longer claims `isPlaying: true`), **dream proto 475's dead real-audio
  branch** repaired.

## Verified solid (by the reviews)

Pack routes fully inert in prod; anon RLS surfaces consistent; the pack
allocation math byte-identical to what generated the current (aligned,
weighted) pack; set chaining/boundaries exactly cover the 21-entry setlist;
loop phase-machine timers all paired add/remove; heartbeat, dream-lab guard,
admin gating, range parser, LRU bounds all clean. Full test suite: 143
passed. 

## Deferred (logged, not fixed tonight)

- `?transcode=1` egress amplification: serve the persisted AAC + global
  bucket (P2; online only, moderate refactor).
- Wedge watchdog outside React (survives error-boundary unmounts) (P2).
- Harvest treatment stamp in `local-images.json` so playback can verify the
  weights the pack was built with (P2; current pack verified aligned).
- Command-bus TTL (stale phone commands replay on reconnect ≤20) (P2).
- csp-report rate limit; statement-phase heartbeat label; prev-at-0 restart
  seek; `CYCLE_INTRO_TIMINGS` doc drift (P2/P3 cosmetics).
- Spoofable `/installation` referer keeps full-quality gen access (bounded
  ~$150-330/day worst case by the global bucket) — owner-accepted risk to
  revisit; a much smaller non-admin sub-cap is the candidate fix.
