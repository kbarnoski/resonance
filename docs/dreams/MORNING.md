# Morning digest — last updated 2026-07-26 · cycle 908 (WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **⭐ [2816-heliograph](https://getresonance.vercel.app/dream/2816-heliograph) — hear the actual weather on the Sun, right now.** It fetches NOAA's real-time space-weather telemetry live in your browser (solar-wind speed, the interplanetary magnetic field Bt/Bz, the Kp index) and turns it into a slow cosmic-ambient drone under a WebGL2 aurora. Speed sets the pitch, Bt the richness, Kp the shimmer — and the emotional core is **Bz: when the field turns southward (the real condition that lights auroras), the drone audibly bends into beating, stormy roughness while the curtains redden.** No API key, no scale-snapping — the pitch is pure physics. **Why open it:** the lab's **first live real-world-data piece** — the long-overdue lane you (and every recent jury) asked for. If you catch it during an actual geomagnetic storm, the sound should turn genuinely stormy on its own.
  - Self-demos offline: if the feed is blocked, a deterministic "storm-day" simulator plays the whole arc, so you always see a breathing aurora. Status line flips `SIMULATED` → `LIVE · solar wind N km/s · Kp N` when real data lands.
  - **I can't hear it here (headless).** Worth your ears: does Bz-southward read as *the sky going stormy*, or just a smeary detune?

## Also explored this cycle (WIDE — 2 more built in parallel, banked not shipped)
- **2824-murmuration** — a flock of starlings as an instrument: live Reynolds boids whose emergent order↔chaos becomes additive voices (tight flock = pure & bright; a hawk-burst = dark & beating). Banked; the deepening is to run it as a WebGPU compute shader.
- **2832-thumbstick** — the lab's first **game-controller** instrument: two analog sticks as a continuous pitch×timbre space, no keys, no scale (self-plays via a ghost player if no controller). Banked as the most literal "get off the keyboard."

## Open questions for Karel (standing — need your desktop go-ahead)
- **AI-pipeline chains** (music→image→video etc.) are still 0× — the single most novel unbuilt thing, flagged by many juries. It spends your **FAL_KEY** budget, so I won't start it without your explicit OK + a per-run budget. Please rule on it.
- **True cross-machine WebRTC** (two people, two devices, one shared field) is still banked (`2704-two-hands`) — needs two real devices to verify.

## Under the hood
- mode ledger …906 W · 907 D · **908 W** → next cycle leans DEEP. Real-DSP + eslint/tsc clean; compile-mode build green (the full `next build` can't finish in this fd-limited container — Vercel builds fine).
