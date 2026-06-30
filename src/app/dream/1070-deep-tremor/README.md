# Deep Tremor

> What if the planet's live seismic activity — every earthquake happening on
> Earth *right now* — were a dark, spatialized instrument you fall into: each
> real quake a depth-timbred strike placed in 3D space around you, ringing out
> into a cavernous void?

Route: `/dream/1070-deep-tremor`

Interaction model: **exocentric** — you orbit a dark globe and the planet's last
hour of earthquakes plays around you. This is the dark "near-death / void" pole:
calm, vast, a little funereal — not cosmic-bright, not a center-out bloom.

## The piece

On a single **Begin** gesture we start an `AudioContext` (from the user gesture),
build the three.js scene, fetch live earthquake data, replay the last hour over
~36s, and then poll for new quakes every 60s. Each earthquake becomes:

- **One struck tone** (a gong/bell-like strike) ringing into a long shared
  reverb void, over a very low just-intonation drone.
- **One expanding ring + glow** sitting on the dark globe's surface at the
  quake's true latitude/longitude.

## Data source (live, public, no key, CORS-enabled)

Fetched **client-side** (no API route — it's a public no-key GET):

- Primary: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`
- Fallback when the hour is thin: `…/summary/all_day.geojson`

Each feature gives `geometry.coordinates = [lon, lat, depthKm]`,
`properties.mag`, `properties.place`, `properties.time` (ms epoch), and `id`.

Each fetch is guarded by a **5s `AbortController` timeout**. On *any* failure
(network / timeout / empty feed) we generate a **synthetic "Ring of Fire"** set
of quakes (random lon/lat clustered along the Pacific rim, mag 2.5–6, depth
5–600 km) so the piece **always plays and moves with zero network**. A status
badge shows emerald `live · USGS` for real data, amber `synthetic` for the
fallback.

On first load we replay the recent quakes sorted by time over ~36s so the
listener hears the planet's last hour unfold; afterward we poll `all_hour` every
60s and strike only genuinely new quake ids.

## The HRTF mapping (the signature technique)

Each quake routes through a `PannerNode` with
`panningModel = "HRTF"`. We convert its `(lon, lat)` to a point on a unit sphere
(same Y-up convention as the visual globe) and set the panner's
`positionX/Y/Z`, with the `AudioListener` at the origin facing -Z. Depth maps to
**radial distance** (deeper quakes are placed further out, so they're quieter and
more distant). The result: each strike rings out from its **true direction**
around the listener. The panner then feeds the shared convolution void, so every
strike decays into the same cavern.

Per-strike synthesis (written in `audio.ts`):

- **Pitch ← magnitude (inverse):** bigger quake = lower, more massive boom;
  small = higher tap (mag 7 ≈ 46 Hz, mag 1 ≈ 330 Hz).
- **Timbre ← depth:** shallow = brighter (higher partials, sharper noise click,
  higher lowpass); deep = darker, longer, more sine/sub.
- **Loudness + decay length ← magnitude.**
- A short filtered-noise onset transient (sharper when shallow) gives the strike
  its attack.
- A ~120 ms spacing queue caps simultaneous strikes so a burst never clips into
  noise; nodes self-clean on `ended`.

The drone (`startDroneBank`, root 41 Hz) and reverb (`createVoidReverb`, 8s tail)
are the lab's **shared** psychedelic engines — composed, not reimplemented. The
drone swells slightly when many quakes are active.

## Visual

- A slowly auto-rotating dark Earth: a sphere of deep indigo/slate points + a
  faint wireframe shell + a near-black core, in a star-flecked void.
- Each quake spawns an expanding ring tangent to the globe surface at its true
  lat/lon, plus a brief radial glow; radius and brightness scale with magnitude
  and fade as the ring grows.
- WebGL is probed up front (`hasWebGL`); without it the page shows a
  `text-rose-300` notice instead of crashing.
- **Safety:** no strobe/flicker — only slow smooth luminance drifts, well under
  3 Hz.

## Files

- `page.tsx` — client component: Begin button, status badge, design-notes
  toggle, replay scheduler + 60s poll loop, full teardown on unmount.
- `audio.ts` — master/compressor chain, shared drone + void, per-quake HRTF
  strike synthesis, spacing queue.
- `data.ts` — USGS fetch with timeout + day fallback + mandatory synthetic
  Ring-of-Fire generator.
- `scene.ts` — three.js dark globe, expanding quake rings/glows, WebGL probe,
  disposal.

## Named references

- **"Echoes of the Land: An Interactive Installation Based on Physical Model of
  Earthquake"** (arXiv:2507.14947, 2025) — seismic dynamics → real-time
  multisensory sound + light.
- The **ambisonic / spatial "make the Earth audible" seismic-sonification
  tradition** — spatialising seismic data to surround sound; high-frequency P
  waves gliding down into lower S / surface waves as an upward (here, downward)
  glide.
- **Near-death-experience / void phenomenology** — the dark, vast,
  presence-in-the-void pole — as the aesthetic target.

## What I'd do next cycle

- Map each event's true **P → S → surface-wave glide** as a short downward sweep.
- Couple ring colour to depth; add a great-circle ripple propagating across the
  globe from each epicentre.
- Let the listener **orbit the camera** by dragging.
- A magnitude-gated sub-bass thump you feel more than hear for the rare large
  quakes.
