# 1600 — orbital-drift

## What it is
A pure-SVG world map with the International Space Station's **ground track** drawn
live across it, sonified as a serene, slowly-evolving **just-intonation orbital
drone**. Deliberately cool and cartographic — deep-space navy, cyan/teal grid,
a single warm amber ISS marker — a contemplative-scientific break from the lab's
recent psychedelic run. No mandala, no violet, no iridescence.

## The one question
> *What if you could HEAR the machines orbiting overhead right now — the ISS and
> its ground-track drawn live across a world map, sonified as a serene, slowly-
> evolving orbital drone?*

## How to use
- The map, ground track, and ISS marker animate **immediately** (silently) using
  the deterministic propagator — nothing to click to see motion.
- Press **Start sound** to open the (gesture-gated) `AudioContext` and fade the
  drone in.
- **Tap the map** to drop a *ground station* (cyan ring). When the ISS passes
  within ~7.5° of it, the station flashes and rings a just-tuned bell whose pitch
  is chosen by the station's latitude band. Up to 6 stations (oldest retire).
- **feed: LIVE | SIMULATED** badge (top-right) reports whether a real position
  fetch is currently driving the marker.
- **Design notes** button (map corner) opens a short in-piece explainer.

## Data source + mandatory fallback
- **Live:** polls `https://api.wheretheiss.at/v1/satellites/25544` every 4 s
  (public, no auth, CORS-friendly; gives latitude, longitude, velocity,
  altitude). Falls back to `https://api.open-notify.org/iss-now.json` for
  position if the primary fails.
- **Fallback (always running):** a closed-form **Keplerian sub-satellite-point
  propagator** (`propagator.ts`) — 51.6° inclination, 92.9 min period, with
  Earth rotation + nodal regression folded in so successive passes step ~23° west
  like the real trace. It runs from t = 0 so the piece is **never blank and never
  silent** with zero network / on CORS failure / headless. When a live sample
  arrives it *re-anchors* the propagator's node longitude (solving the argument
  of latitude from the measured latitude, disambiguated by ascending/descending),
  so the model becomes a smoothing flywheel between the 4 s polls rather than
  teleporting the marker.

## How the sound is built (`audio.ts`)
Just-intonation partials over a 110 Hz (A2) root, master ≤ 0.16 through a
`DynamicsCompressor`:
- **Latitude** → lowpass cutoff (equator open/bright, poles veiled).
- **Ocean vs land** (point-in-polygon against the map polygons) → crossfades a
  quiet sawtooth grain in over continents, pure sines over ocean.
- **Orbital phase** → a slow **Shepard-style** amplitude window across 3 octaves
  (an endless, barely-perceptible glide mirroring the orbit).
- **Ground-station flyby** → short inharmonic FM **bell** on a JI degree.

Voice budget: 3 pad + 3 Shepard + 1 land grain + ≤4 chimes = ≤ 11 (< 12 cap).

## Named references (cited honestly)
- **Ryoji Ikeda — *datamatics*** (2006– ): austere audiovisual works that turn
  raw data streams into synchronized sound and monochrome projection. The
  instrument-panel restraint here — data as the score, no decoration — is in that
  lineage.
- **Semiconductor — *Brilliant Noise*** (2006): built from unprocessed solar-
  telescope image data, letting real scientific measurement drive the
  audiovisual surface. This piece's ISS-telemetry-as-timbre follows that idea of
  sonifying an actual live feed rather than an aesthetic simulation.
- **Equirectangular (plate carrée) projection** (Marinus of Tyre, ~100 CE): the
  trivially simple lon/lat → x/y mapping the SVG map is drawn with; chosen partly
  *because* it is honest and legible, not because it is accurate at the poles.

(These are influences/idioms, not collaborators or endorsers.)

## Ambition self-assessment
- **#2 — ≥3 integrated subsystems: HIT (4).** (1) live orbital feed with dual
  source + timeout; (2) deterministic Keplerian fallback propagator that also
  smooths the live feed; (3) SVG cartographic renderer (hand-authored continent
  polygons, graticule, antimeridian-split ground track, land/ocean test); (4) the
  JI orbital drone synth with flyby chimes.
- **#3 — named references in README: HIT.** Ikeda *datamatics*, Semiconductor
  *Brilliant Noise*, and the equirectangular projection, cited above.

## Constraints honored
Pure client (`"use client"`, no `route.ts`). Web Audio + SVG DOM only — no
raster-canvas path, no GPU-shader path, no 3-D engine, no d3, no new npm deps
(projection + point-in-polygon hand-rolled). Determinism: seeded `mulberry32` +
`performance.now()` only; no nondeterministic entropy and no wall-clock, verified
by grep of this folder (0 hits).
Master ≤ 0.16 behind a compressor, ≤ 12 voices, no strobe, `prefers-reduced-
motion` freezes the drift. Full teardown on unmount (`ctx.close()`, `cancelAnimationFrame`,
`clearInterval`). Typography: title `text-2xl`, body `text-base`, no `font-serif`,
44px buttons, failure/state text in amber/rose, off-violet cyan/teal/amber art
palette.

## Cycle-2 deepening ideas
- Overlay a **terminator** (day/night shading) computed from the sub-solar point
  and let it modulate the drone's brightness (dusk = warmer).
- Add a second satellite (e.g. Hubble / a Starlink) as a counter-voice for a
  two-body just-intonation interval that beats as they converge.
- Elevation-aware chimes: only ring a ground station when the ISS is actually
  *above the local horizon* (add altitude → visibility-circle geometry) and pan
  the bell by station longitude.
- A thin **pass-prediction** ribbon: shade the next time the track crosses a
  chosen city, turning the piece into a quiet "when is it overhead" instrument.
