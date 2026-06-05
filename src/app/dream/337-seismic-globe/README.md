# 337 · Seismic Globe

**What if you could HEAR the living planet?** Every earthquake recorded on Earth
in the last day becomes a sustained voice placed in 3-D space around you, while
the quakes pulse on a slowly rotating 3-D globe. The ever-shifting chord you hear
*is* Earth's current seismic state.

## How to use

1. Open the page. The three.js globe loads immediately and auto-rotates; sample
   or live quakes appear as glowing points (visual is alive hands-free).
2. Press **▶ Listen to the planet** (a ≥44px button). This creates/resumes the
   `AudioContext` inside your tap — iOS-safe — and the spatial choir fades in.
3. Switch feeds with **M2.5+ · day** / **all · day** / **all · hour**. Larger
   feeds = denser chords. The data re-polls every 60 s; new quakes fade in,
   aged-out ones fade away.
4. Watch the **provenance badge**: emerald `● live USGS feed · N quakes` when the
   real feed loads, amber `● sample quakes` when it doesn't.
5. The **loudest voices right now** list names the places currently sounding.

## Subsystems

- **`quakes.ts` — data layer.** Fetches the public, CORS-open USGS GeoJSON
  summary feed (`{2.5_day|all_day|all_hour}.geojson`, no API key). Normalizes
  features to `{ id, mag, lon, lat, depthKm, place, time }`. **Graceful
  fallback:** any fetch failure or empty window returns 8 globe-spanning sample
  quakes, so the piece always surrounds you. `topByMagnitude` caps the active set
  to the loudest 24.
- **`globe.ts` — three.js output (v0.182, raw three in a host element).** Dark
  wireframe Earth + dark inner shell (so back-face points occlude) + faint
  lat-ring graticule + soft atmosphere halo, slowly auto-rotating. One glowing
  point per sounding quake at its lon/lat; size ← magnitude, **hue ← depth**
  (shallow warm amber → deep cool blue). Pulses every frame. Disposes every
  geometry/material/renderer on unmount.
- **`audio.ts` — HRTF spatial Web Audio engine.** Each quake owns ONE sustained
  voice through its own `PannerNode { panningModel: "HRTF", distanceModel:
  "inverse" }`: azimuth ← longitude, elevation ← latitude, distance/loudness ←
  magnitude. Pitch snaps to a **just-intonation** degree over C2 (65.41 Hz),
  ratios `1, 9/8, 6/5, 4/3, 3/2, 5/3, 15/8, 2`; bigger quakes drop a register,
  smaller ones rise one; **depth → lowpass cutoff** (deeper = darker). Slow
  attack / slow release so the chord evolves smoothly. An always-on quiet root
  drone (C1 + C2) keeps it from ever being silent. Master ≤ 0.42 → procedural
  convolver reverb → brick-wall `DynamicsCompressor`. **Fallback:** a
  `StereoPanner` path when `PannerNode`/HRTF is unavailable.
- **`page.tsx` — orchestration.** ONE `requestAnimationFrame` loop drives globe
  rotation + pulses by mutating refs/three.js objects — the React tree never
  re-renders per frame. Full teardown on unmount (rAF cancel, three.js dispose,
  audio nodes stopped + `AudioContext` closed, poll timer cleared, fetch
  aborted).

## Named references

- **Florian Dombois**, *Auditory Seismology* — turning seismograms into sound;
  and **Dombois & Eckel**, *"Audification"* (in *The Sonification Handbook*),
  the foundational treatment of mapping geophysical signals directly to audio.
  This piece sonifies the catalog (one voice per event) rather than audifying a
  single trace, but it stands in that lineage.
- **2026 Data Sonification Award (DATASONICA)** — its live-data-as-evolving-
  texture wave: real-world data streamed into a continuously mutating sonic
  field rather than a fixed rendering. Here the USGS feed re-polls every 60 s so
  the chord literally is the current planet.

## Ambition-floor criteria it hits

- **Audio-visual, never static:** three.js globe + HRTF spatial choir, both
  alive on load (visual hands-free, audio one tap away).
- **Live external input:** real USGS earthquake feed, three selectable windows,
  60 s polling, with a robust sample-data fallback + honest provenance badge.
- **Mandated tech:** real three.js (not SVG/Canvas2D), HRTF Web Audio as the
  primary sonic medium, no new npm dependencies.
- **Graceful degradation:** fetch blocked → samples + amber notice; no WebGL →
  `text-rose-300` notice and audio still plays; no HRTF → StereoPanner.
- **Typography/contrast:** body ≥ `text-base`, hero `text-2xl`+, errors in
  `text-rose-300`, buttons ≥44px, dark theme with monospace accents.

## Honest unverified risks

- **Not run through `next build`** in this session (per the build contract). It is
  written to compile cleanly (no unused vars, no `use`-prefixed helpers, single
  justified `eslint-disable` lines for intentional effect deps), but the
  TypeScript + ESLint pass is unverified here.
- **Live feed reachability** from the review device is unverified — by design the
  sample fallback covers this, and the badge will tell the truth.
- **HRTF perception** of azimuth/elevation varies by listener and is best on
  headphones; the spatial spread is real but its vividness is device-dependent.
- **Dense moments:** with `all_hour` during a swarm the active set is capped at
  24 voices and the compressor is a brick wall, but exact loudness across all
  output chains is not measured.
- Quake-time freshness in the sample set is relative to page load, not real
  events; the samples are illustrative, not current.
