# 4520 · Seismarium

**The one question:** *What if the living Earth played itself — real global
earthquakes, right now, as an accumulating planetary instrument?*

A hands-free, self-demoing audio-visual piece. On load it immediately paints and
plays the last 24 hours of global seismicity: every earthquake is an impulse
dropped into a planetary ripple tank and a struck modal bell, quantised into a
slow musical grammar so the Earth sounds like an instrument, not a siren.

---

## What it is

- **Input** — the USGS real-time earthquake feed
  (`.../summary/all_day.geojson`, public, CORS-enabled, no key, read-only GET).
  Each feature gives `mag`, `time` (ms epoch), and `[lon, lat, depthKm]`.
- **Visual** — an equirectangular world basin simulated as a **2D elastic wave
  field** on a **WebGPU compute shader**. Two ping-ponged storage buffers hold
  `(u, u_prev)`; a compute pass integrates the discretised wave equation
  `u_next = 2u − u_prev + c²·∇²u`, then multiplies by a near-1 damping factor.
  Longitude **wraps** (the world is a cylinder), the poles **reflect** softly.
  Damping ≈ 0.9994 → ripples **accumulate**; the field has genuine long-form
  memory (minute 5 ≠ minute 1). Painted as a violet height/energy ramp with a
  faint 30° graticule.
- **Audio** — each quake is a **struck modal bell** (Web Audio): a few
  inharmonic decaying partials + a short noise-click mallet, panned in stereo,
  fed through a feedback-delay tail and a **DynamicsCompressor limiter** on the
  master. Fundamentals are snapped to a **slowly-rotating pentatonic mode** over
  a **sub-bass drone** that swells with recent total seismic energy.

## Mapping table

| Quake property | Visual                         | Audio                                            |
| -------------- | ------------------------------ | ------------------------------------------------ |
| `mag`          | impulse amplitude ∝ 10^mag     | strike energy (loudness) + register (big = low, long) |
| `depthKm`      | (via amplitude/decay of ripple)| timbre + decay (deep = darker & longer, shallow = bright & short) |
| `lat`          | north at top of the basin      | stereo pan (north = left … south = right)        |
| `lon`          | horizontal position (wraps)    | —                                                |
| `time`         | onset in the 24h → 90s replay  | onset (looped); new quakes struck live on poll   |
| —              | —                              | fundamental snapped to rotating pentatonic mode  |

## Time model

- The fetched catalogue's last **24 h** is compressed into a **~90 s** loop and
  replayed gently, wrapping forever.
- A background poll every **60 s** re-fetches the live feed and strikes any
  **genuinely-new** quakes (time greater than the max seen) the moment they land.
- On load the most recent ~8 events prime the basin so a reviewer sees a
  planetary bloom within ~1 s, no interaction required.

## Named references

- **Florian Dombois, _Auditory Seismology_ (2001)** — turning seismograms into
  sound; the origin of listening to the solid Earth.
- **Eos.org, 2026 — "Earth Is Noisy. Why Should Its Data Be Silent?"** — the
  current push for seismic sonification as a first-class scientific+public medium.
- **Style-based / musical-grammar sonification (arXiv:2605.21874, 2026)** — the
  key finding: an indefinite live-data stream stays engaging only if you impose
  a musical structure rather than emitting arbitrary tones. Seismarium's rotating
  pentatonic + drone is exactly that grammar.

## Degrade paths (non-negotiable, all implemented)

- **Fetch fails / offline / blocked** → a **seeded synthetic catalogue**
  (`mulberry32(0x4520)`, Gutenberg–Richter-ish exponential magnitude tail across
  the last 24 h). Deterministic, identical every load. Badged **SYNTH** vs
  **LIVE**. The piece always plays and paints on load.
- **WebGPU unavailable** (`!navigator.gpu` or adapter/device failure) → a
  coarser **Canvas2D** ripple tank running the same wave equation in JS typed
  arrays with the same visuals + audio. Badged **CPU** vs **GPU**.
- **Web Audio unavailable / suspended** → visuals continue; a "Tap to enable
  sound" affordance resumes the AudioContext on the first gesture. If Web Audio
  is entirely unsupported, a `visuals only` notice is shown.
- **No `Math.random` / `Date.now` / `new Date`** anywhere — randomness is the
  seeded `mulberry32`; "now" is `performance.timeOrigin + performance.now()`;
  animation time is `performance.now()`.

## Files

- `page.tsx` — `"use client"` React component: canvas, timeline replay + live
  poll, readout, badges, tap-to-enable-sound, design-notes modal.
- `quakes.ts` — types, USGS fetch, seeded synthetic catalogue, projection +
  perceptual normalisers.
- `gpu.ts` — WebGPU compute wave field + violet render pass (WGSL).
- `cpu.ts` — Canvas2D fallback wave field.
- `field.ts` — shared `WaveField` interface, grid constants, violet ramp.
- `audio.ts` — modal-bell synth, rotating-pentatonic grammar, drone, limiter.

## What I'd deepen next

- **Real continent outlines** instead of a graticule — a baked low-poly coast
  path drawn under the field, or a distance-to-coast texture that colours ocean
  vs land differently.
- **Depth-driven wave speed** — let `c²` vary per cell so deep quakes ripple
  through a "slower" mantle basin, coupling the depth mapping into the physics
  as well as the timbre.
- **GPU read-back of field energy** to drive the drone from the actual painted
  interference rather than a CPU-side accumulator.
- **A scrub clock** so a listener can drag through the day, and a longer memory
  window (7-day / 30-day feeds) for a slower, more geologic accumulation.
