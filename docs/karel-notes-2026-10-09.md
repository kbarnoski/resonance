# Overnight kiosk perfection report — 2026-10-09

Kiosk: build **8448b80c** (pushed, server = HEAD), relaunched 13:21 UTC, playing.
All fixes verified on the real kiosk Chrome (not headless) before deploy; typecheck,
lint, 372 tests and the mastered lock (Snowflake / Realized / Ghost untouched) pass.

## What changed overnight

| # | Problem (measured on the kiosk) | Fix |
|---|---|---|
| 1 | Flight recorder went silent ~50 min into every session (ring-buffer index bug) | Monotonic counters + regression test |
| 2 | Every dual/tertiary shader change created + destroyed a WebGL context (55-100 ms) | Persistent shader slots |
| 3 | Shader compile status polled every frame: 4-8 slow frames per switch | One GPU sync per program, 400 ms after link |
| 4 | Every arriving still: particle sampling read pixels back on the main thread, 20-337 ms (235 times/hour) | Decode, scale, sample and brightness all in a background worker; main thread only receives numbers |
| 5 | Set start (Ghost → Chemiluminescence 1): first non-mastered journey created 3 contexts + 2x surfaces → ~280-330 ms GPU stall, which froze the "Resonance" text mid-fade | Slots pre-warmed behind the opening card; the statement text now holds still 700 ms after the next journey spins up, then fades |

## Results (frame gaps ≥ 60 ms, first hour of the loop)

| Build | Visible gaps (>80 ms) | Small (60-80 ms) | Notes |
|---|---|---|---|
| 49910398 (yesterday) | 10 | many | before the night |
| 13c94171 | 1 | 7 | all small ones = still sampling |
| 7f4d2bd8 (33 min) | 1 | 2 | zero sampling stalls, all image forms working |
| 8448b80c | — | — | the remaining gap now lands on a still black card (verified frame-by-frame) |

The one remaining measured stall is the ~290 ms set-start GPU work. It is now
invisible (the screen is a static logo on black during it). Startup also has one
~70 ms frame 7 s into the cold open, on the statement card.

## Still waiting on you
- Main-loop reorder decision; Kinetic Lab placement; Rise Above approval
- CI npm-audit gate (prod web deploys have been held ~3.5 days by it; the kiosk is unaffected)

Repro rig for any future hand-off glitch: `scripts/journey-review/boundary-rig.mjs`
(attaches to the real kiosk Chrome, seeks to a journey's end, logs gaps / GPU trace /
screenshots across the boundary).
