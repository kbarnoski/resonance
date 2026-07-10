# 1426 · Biome Field

**The one question:** What if a real, live planetary dataset were the composer — a
living data-field you can walk into, that sounds and looks different right now
than it did an hour ago, because Earth's data changed?

Biome Field grows the last ~24 hours of global earthquakes — fetched **live from
the USGS at runtime in your browser** — into a breathing shell of light around a
dark, slowly-turning Earth, and sounds it as a slow, inharmonic drone with a
granular shimmer. It is a *living field*, not a chart: the shell breathes, every
point drifts, fresh quakes twinkle, and the whole thing re-fetches every ~2.5
minutes so it keeps changing with the planet.

## How to play

1. Hit **Begin · enter the field**. Audio starts from your gesture; the field
   appears instantly on a bundled snapshot, then swaps in the live USGS data.
2. **Drag** to orbit the planet.
3. **Hover** to "listen in" on a region — a halo lights where you point, nearby
   points brighten, and the shimmer is drawn toward the quakes there.
4. Use **headphones**. Read the in-page **design notes** for the full mapping.

## The mapping

- **magnitude → size + brightness** of each point, and (in sound) the depth of
  the drone voice it can seed — bigger quakes sound lower and larger.
- **depth → colour** (shallow warm-gold → mid teal → deep violet) **and radial
  height**, so the field reads as a 3-D data-terrain floating off the surface;
  in sound, depth stretches an **inharmonic** upper partial of each drone voice.
- **recency → shimmer** rate/amplitude on the visuals and grain weighting in the
  audio, so the most recent quakes glitter and sound the most.

## Data

- Live GET (no key, no side effects, no secret, no API route): USGS
  `summary/all_day.geojson`, fetched client-side on the Begin gesture with a 6 s
  timeout, then re-fetched every ~150 s.
- **Always alive:** a bundled ~30-quake snapshot (`data.ts`) renders and sounds
  immediately and covers any network failure — an amber "bundled snapshot" badge
  shows when running offline.

## Audio

Master ramps from silence to a **0.18** peak through a `DynamicsCompressor`
limiter into `../_shared/psych/convolutionVoid` (a vast code-generated reverb).
The pitch material is derived **entirely from the data** — a spectral,
inharmonic drone cluster plus a continuous-pitch granular texture — never a
pentatonic / just-intonation scale index. Full teardown on unmount: grains
stopped, voices ramped out, three.js geometries/materials/renderer disposed,
RAF cancelled, context closed after the tail.

## Named reference

**Refik Anadol — DATALAND, "Machine Dreams: Rainforest,"** which opened **June
20, 2026** in Los Angeles: a *living data field* that continuously evolves from
real-time ecological data and visitor presence, described as "never truly
finished." Biome Field is the browser-scale echo of that idea — a living
data-field driven by a live planetary dataset and shaped by the visitor's
presence. It also stands in the **seismic-sonification lineage**: audification
and parameter-mapping of seismic signals to make the Earth audible.

## Ambition criteria hit

- **Living field, not a chart:** continuous breathing/drift/shimmer + periodic
  live re-fetch; the piece is never static and never silent.
- **Real live public dataset as composer:** runtime client fetch of USGS
  seismic GeoJSON drives form, colour, height and sound.
- **Presence:** drag-to-orbit and hover-to-listen modulate which part of the
  field sounds and glows.
- **Cosmic-ambient / Anadol-organic vibe:** vast, planetary, meditative.

## Diversity tags

- **INPUT:** external live data (USGS earthquake GeoJSON) + pointer.
- **OUTPUT:** three.js particle / point field on a globe.
- **TECHNIQUE:** real-world-data sonification of live seismic data driving a
  living field (inharmonic drone cluster + granular texture).
- **PALETTE / VIBE:** cosmic-ambient / planetary / Anadol-organic.
- **POLE:** cosmic-ambient.

## Files

- `page.tsx` — client component: Begin gesture, phase/HUD, pointer wiring,
  live-data swap + refresh, teardown.
- `data.ts` — USGS fetch + parse + bundled fallback snapshot.
- `scene.ts` — three.js living field (custom-shader point shell, globe,
  orbit + hover-focus raycast).
- `audio.ts` — data-derived inharmonic drone cluster + granular shimmer.
