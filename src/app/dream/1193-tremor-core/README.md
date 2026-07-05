# 1193 · Tremor Core

**The one question:** *What if you could HEAR the living Earth right now — every
real, live earthquake on the planet striking a resonant inharmonic metal gong —
while you WATCH the quakes ring at their true depth inside a glowing cutaway of
the Earth?*

Tremor Core is a live real-world-**data** sonification. It pulls USGS's public,
keyless, CORS-enabled "past 24 hours, all magnitudes" earthquake feed and lets
the planet play itself: each quake strikes a bell/gong voice and blooms inside a
full-screen WebGL2 cross-section of the Earth. You do not aim or point — the
Earth's own seismicity is the instrument. You only press play and listen.

## How it works

Four files behind one page:

- **`feeds.ts`** — fetches `all_day.geojson` from USGS, normalizes every feature
  into a guarded `{ mag, place, time, lon, lat, depth }` (skipping malformed
  features, clamping depth ≥ 0), and returns a chronologically sorted array with
  a `live` / `sample` status. A hard-coded set of ~12 realistic quakes (mag
  1.5–6.2, depths 5–600 km, varied places) is the mandatory fallback so the piece
  always runs and sounds identical if the fetch fails or is CORS-blocked. Re-polls
  every ~60s.
- **`gong.ts`** — `GongEngine`, a Web Audio bell/gong synth (below).
- **`core.ts`** — `CoreRenderer`, a WebGL2 fragment-shader Earth cutaway (below),
  with a Canvas2D fallback.
- **`page.tsx`** — the client component: gesture-gated start, the time-compressed
  scheduler, and the live readout.

## Data → sound mapping

Each strike is a **seismic gong**: a short *stick-slip friction* onset followed
by a ring of **inharmonic bell partials**.

- **Stick-slip attack transient** — before the clean ring, a very short
  (~40–90 ms) bandpass-swept noise burst grinds the onset. Earthquakes *are*
  stick-slip friction ruptures, so the gong is seated with friction, not a pure
  mallet. This is the key synthesis refinement, after *Echoes of the Land*
  (below).
- **Inharmonic partials** — 7 oscillators at ratios
  `[0.5, 1, 1.19, 1.71, 2, 2.74, 3]`, each with its own exponential decay (lower
  partials ring longest → a long metallic hum under the shimmer), through a
  per-voice lowpass.
- **magnitude → pitch (inverted)** — bigger quake = **lower** fundamental,
  mapped `mag ∈ [0,7] → ~660 Hz … ~55 Hz` and **snapped to a just-intonation
  pentatonic grid** (ratios `1, 9/8, 5/4, 3/2, 5/3` across octaves) so
  overlapping gongs stay consonant.
- **magnitude → amplitude + ring length** — bigger = louder and longer.
- **depth → timbre** — deep quakes are darker (lower lowpass cutoff) and slightly
  more inharmonically detuned (muffled); shallow quakes are bright and clear.

The signal path is: voices → shared **procedural convolver reverb** (a generated
exponential-decay noise impulse) + dry → a **DynamicsCompressor limiter** →
master gain (~0.2, ramped from 0 on start). 16-voice oldest-steal polyphony;
`dispose()` stops and disconnects everything and closes the context.

## The WebGL2 cross-section

A single full-screen triangle runs a fragment shader that draws the Earth in
cutaway: concentric bands for **inner core / outer core / mantle / crust**,
rendered **bright** — a rice-paper/cream ground that never approaches black,
bronze/amber/ochre layer gradients, and a faint ink graticule of depth-rings.
Outside the planet circle is warm paper.

Live quakes ring **inside** the planet. Each active "bloom" is placed at an
azimuth from its longitude and a radius from center of
`surfaceRadius × (1 − depth/700)` — so a deep quake rings near the core and a
shallow one near the crust. Each bloom is an additive **flash** plus 1–3
expanding concentric **depth-rings** that grow with age and fade out. Magnitude
scales flash brightness and ring reach. Up to 24 blooms are uploaded as a
`uniform vec4 uBlooms[24]` array with a live count.

Safety and robustness: **no strobe** — all brightness changes are slow luminance
ramps, and the 250 ms min inter-onset caps flash frequency. Device-pixel-ratio is
capped at 1.75. If WebGL2 is unavailable, a Canvas2D version draws the same
cross-section with fading ripple arcs. `webglcontextlost` is caught
(preventDefault + restore) and teardown fully deletes the program/VAO and loses
the context. `prefers-reduced-motion` slows the ring drift.

## The time-compressed scheduler

The past 24h are compressed into a ~150 s chronological loop. Quakes are walked
in time order, each mapped to its proportional position in the loop, then a
**250 ms minimum inter-onset** gap is enforced (bursts are spaced) so a busy day
reads as a slow bell-choir rather than a machine gun. On reaching the end the
loop restarts, swapping in fresher data if a 60 s poll brought any.

## References

- **"Echoes of the Land"** — arXiv:2507.14947 (2025). A granular seismic sound
  installation that models earthquakes as **stick-slip friction** events. The
  direct inspiration for the friction attack transient on each gong strike.
- **Alexandre Estrela, "RedSkyFalls"** — Venice Biennale 2026, Portugal Pavilion.
  Live seismic data driving sound and image; kin to this piece's ambition of
  making the ground's motion audible and visible in real time.
- **Florian Dombois, *Auditory Seismology*** — foundational work on listening to
  seismograms and audification of the solid Earth.
- **USGS "Listening to Earthquakes"** (Zhigang Peng) — audified seismograms and
  the practice of turning seismic records into sound.
- **Andrea Polli** — environmental-data sonification as an artistic and civic
  practice; the lineage of turning planetary data into listening.

## Honest gaps

- This is a **sonification**, not audification: we synthesize a gong *triggered
  by* each event's parameters (mag/depth/lon), not a resampling of the actual
  seismogram waveform. It represents the catalog, not the ground motion itself.
- Longitude maps to a 2D azimuth around a *cross-section*; the cutaway is not a
  true geographic slice through any single plane, so a bloom's angle is
  evocative rather than cartographically exact. Latitude is not used spatially.
- The 250 ms floor and 16-voice cap mean a very dense hour is thinned — we
  prioritize a legible bell-choir over one-to-one completeness.
- Depth→radius uses a fixed 700 km ceiling; the deepest recorded quakes
  (~700 km) sit at the inner boundary, so the mapping is linear rather than
  matched to the real (non-linear) layer boundaries.
