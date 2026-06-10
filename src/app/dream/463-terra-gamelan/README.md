# 463 · Terra Gamelan

A live planetary seismic observatory. Every real earthquake on Earth, as it is
reported, rings a bell tuned to a Javanese gamelan scale on a slowly turning
globe of light.

## The one question

> What if Resonance let you *hear the living Earth* — every real earthquake on
> the planet, right now, ringing a bell tuned to a Javanese gamelan scale, on a
> slowly turning globe of light?

This is a **stateful, long-form** instrument, not a loop. The last ~24h of
quakes accumulate as glowing embers on the globe; a soft drone bed swells with
rolling global seismic energy; minute 5 sounds different from minute 0.

## Data source

`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
— all quakes in the past 24h, fetched **client-side** (the endpoint is
CORS-enabled, public, read-only, no auth, no API route). Polled every ~60s.
Each poll diffs `feature.id`s against the seen-set; each genuinely new quake
rings a bell and flashes a point. On first load all existing quakes are placed
quietly and only the ~6 most recent are rung, so the open is gentle.

## Sonification mapping

- **Tuning — Javanese gamelan.** Default `slendro` (5 near-equal steps),
  cents `[0, 231, 474, 717, 955]`; toggle to `pelog` (7 unequal steps),
  cents `[0, 120, 258, 539, 675, 785, 943]`. Base ≈ low D (146.83 Hz);
  `freq = base · 2^(octave + cents/1200)`.
- **Depth → pitch.** Shallow quakes ring high, deep quakes (toward 700 km) ring
  low, quantized across ~3 octaves of the chosen scale.
- **Magnitude → loudness + decay length + brightness.** Micro/negative mags are
  soft ticks; M5+ are long, bright resonant gongs.
- **Longitude → stereo pan** via `StereoPannerNode` (−1..+1).
- **Drone bed.** Detuned, mildly inharmonic sustained partials around the gong
  base; its level and lowpass cutoff track the rolling count+magnitude of
  quakes in the last 5 minutes. There is always a soft baseline hum — never
  silent.
- **Bell timbre.** Bonang/gong-like: sine fundamental + 2 inharmonic partials
  (ratios 2.41, 3.93) + a short band-passed noise-burst mallet attack,
  exponential decay.
- **Safety.** Everything routes through a `DynamicsCompressor` (glue) and a
  brick-wall limiter (threshold −2 dB, ratio 20:1) so a swarm can never clip or
  hurt ears.

## Visual

three.js (`WebGLRenderer`), procedural — no texture files:

- Rotating Earth as a Fibonacci dot-sphere + faint wireframe shell + opaque
  inner core (so back-side embers are occluded) + an additive atmosphere halo.
- A `THREE.Points` starfield.
- Each quake is a glowing ember at its lat/lon (lat/lon → xyz on the sphere).
  New quakes flash bright and pulse, then settle to a dim ember sized by
  magnitude; colour runs warm-amber (shallow) → cool-violet (deep). Additive
  blending, soft round point sprite via a small custom `ShaderMaterial`.
- Embers older than ~24h, or beyond a 500-cap, fade and are reclaimed.
- Slow auto-rotation with drag-to-spin inertia.
- All geometries / materials / renderer are disposed on unmount; WebGL-
  unavailable shows a readable `text-rose-300` notice instead of crashing.

## Subsystems

- `seismic.ts` — `Quake` model, USGS fetch (timeout + abort), GeoJSON parser,
  and the synthetic fallback: Gutenberg-Richter magnitudes (`10^(-bM)`,
  b = 1.0) + Poisson arrivals + a plausible 24h backlog.
- `audio.ts` — `GamelanEngine`: tunings, depth→pitch, mag→envelope, panning,
  drone bed, compressor + limiter, full node cleanup.
- `scene.ts` — `createTerraScene`: globe, starfield, ember `Points` buffer,
  drag, render loop, dispose.
- `page.tsx` — client component: user-gesture boot (creates + `resume()`s the
  `AudioContext`), live polling loop, synthetic arrival loop, HUD, controls.

## Graceful degradation (required)

If the live fetch fails, times out, returns nothing, or CORS is blocked, the
piece falls back to the **synthetic seismicity generator** and keeps running as
a complete, evolving instrument with zero network. The status line is honest:

- emerald `text-emerald-300/95` — `live — USGS feed`
- amber `text-amber-300/95` — `showing simulated seismicity — live USGS feed
  unavailable`

If a live poll later drops the feed, it switches back to simulated rather than
going silent. The build/CI sandbox (no network) therefore shows the full
simulated experience.

## Named references

- **arXiv 2602.14560** — *Preliminary sonification of ENSO using traditional
  Javanese gamelan scales* (Feb 16 2026): parameter-mapping sonification onto
  pelog/slendro pentatonic systems. Terra Gamelan realizes that approach on
  **seismic** rather than climate data.
- **Seismic Sound Lab** / **Ben Holtzman, Anna Barth** (Lamont-Doherty Earth
  Observatory) — earthquake-data sonification lineage.
- **Ryoji Ikeda** — data-as-aesthetic; here the vibe is deliberately
  warm/evolving/resonant gamelan rather than cold-clinical.

## Ambition & diversity (cycle 373)

**Ambition 3/5 — honest, no over-claim:**
- **#2** ≥3 distinct subsystems — live USGS fetch+diff+rolling-energy · gamelan
  bell synth (depth→pitch, mag→loudness/decay, lon→pan) · stateful evolving
  drone bed · three.js globe + additive ember shader (= 4).
- **#3** named references — arXiv 2602.14560 (gamelan-scale sonification),
  Seismic Sound Lab / Holtzman & Barth (earthquake sonification), Ryoji Ikeda.
- **#4** multi-cycle commitment — this is **cycle 1 of the new "Living Earth"
  spine** (the jury's #1 ask: restart a multi-cycle thread). Cycle 2 folds the
  EDM build-and-drop arc + a space-weather layer onto the globe (banked
  siblings 464/465).
- **#1 NOT claimed** — grep-verified: gamelan **slendro** tuning already appears
  in `402-kids-steady-walk` and **pelog** in `408-kids-breath-grove`, and a live
  external-data stream already exists in `437-wiki-pulse`. The *fresh* moves are
  the **planetary/geophysical** data domain (vs. 437's human-activity firehose)
  and the gamelan-tuned-globe synthesis — application novelty, not a new
  primitive.

**Diversity (vs. cycle-373 bans — AI-image OUT [4× count] · Canvas2D OUT ·
drum-machine TECH · refuse-to-resolve/clinical-Ikeda VIBE · calm-pentatonic-kids
template):** live-planetary-data **INPUT** · **three.js** globe + additive shader
**OUTPUT** (zero Canvas2D, zero AI-image) · gamelan-tuned data-sonification
**TECHNIQUE** (not drum-machine) · **warm planetary-observatory VIBE** (resonant,
evolving — not cold-clinical, not a lullaby). Breaks the recent adult
latent-image monoculture.

## What's unverified

The build sandbox has **no live network, no GPU, and no audio output**, so the
following were reasoned/traced but not observed at runtime here:

- The live USGS feed path (CORS, real arrivals, the 60s poll diff) — verified
  by code/trace only; the simulated path is what runs offline.
- Actual WebGL rendering of the globe + ember shader on a real GPU.
- Audible output of the gamelan bells, drone evolution, and limiter behaviour.
- iOS `AudioContext` unlock — the boot is wired to a user-gesture `resume()` as
  required, but not tested on-device.

TypeScript, ESLint, and Next route compilation for this folder are clean.
