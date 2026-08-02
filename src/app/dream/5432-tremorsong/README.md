# Tremorsong (5432)

## The question

> What if you could **hear** the last 24 hours of the living Earth — every
> earthquake on the planet as a note, sequenced by when it happened, pitched by
> its depth, struck by its magnitude — a real-time seismic score you can play
> back and watch ripple across a world map?

Music *about something other than music*: a parameter-mapping sonification of
real geophysical data.

## How it works

Three subsystems:

1. **Live fetch + parse** — `loadQuakes()` (in `data.ts`) does a client-side
   `fetch` of the public, CORS-enabled USGS feed
   `earthquakes/feed/v1.0/summary/all_day.geojson`, parsing each GeoJSON feature
   into `{ mag, time, place, lon, lat, depth }` and sorting by time. If the fetch
   fails, errors, returns too few events, or you are offline/headless, it falls
   back to a baked ~40-quake snapshot spanning a realistic 24 h of global
   seismicity. A badge reads **live · USGS** or **sample data** accordingly.

2. **Data → sound parameter-mapping engine + generative Web Audio** (`audio.ts`)
   — the 24 h window is compressed to ~40 s. Each quake fires at its scaled
   origin time as a struck bell voice:
   - **depth → pitch**, quantized to a just-intonation major-pentatonic scale
     (shallow = high & bright, deep = low & sub);
   - **magnitude → loudness + decay length + partial richness**, with a low
     sub-thump for M ≥ 5;
   - **longitude → stereo pan** (−1 west … +1 east).
   A soft sustained drone bed (detuned saws + slow filter LFO) keeps the silence
   between events alive. The master runs through a `DynamicsCompressor` limiter
   at gain ≤ 0.24.

3. **Canvas2D map / timeline render** (`render.ts`) — an equirectangular world
   map drawn as a faint violet lon/lat graticule with labeled hemispheres. Each
   quake plots as a depth-shaded dot (VIOLET.300 shallow → INDIGO deep); when its
   note fires a glowing violet ring blooms (radius ∝ magnitude) and fades. A
   sweeping temporal cursor, a running UTC clock/date readout, an event counter,
   and a depth→pitch / magnitude→size legend complete the frame.

The piece **self-demos hands-free**: on load the visual timeline auto-plays the
snapshot immediately (headless-safe), seeded by `mulberry32(0x5432)` for
deterministic per-strike jitter. Audio starts on the first user gesture (browser
autoplay policy) via the **Play the last 24 hours** button; Pause/Resume, speed
(0.5×/1×/2×), and loop controls are provided. The playback "now" reference is the
newest quake time in the data — no `Date.now()` at module top level.

## Named references

- **Ben Holtzman & the Lamont-Doherty Earth Observatory "Seismic Sound Lab" /
  SeismoDome** — earthquakes and seismograms time-compressed into audible sound
  in a planetarium/dome setting.
- The emerging **2026 near-real-time global-seismic ingestion-via-open-APIs
  framework** — this prototype is that idea made playable in the browser.

## What I'd deepen next cycle

- Ingest additional feeds (moment tensors, `all_week`) and let the user scrub a
  live 7-day window.
- Physically-grounded audification: pitch-shift the actual seismogram waveform
  per event rather than a synthesized bell, à la Holtzman's audifications.
- A real simplified coastline polyline for stronger geographic grounding, and a
  great-circle "P-wave travel" animation between hypocenter and antipode.
- Region focus / solo (mute all but one tectonic belt), and depth cross-section
  view.
