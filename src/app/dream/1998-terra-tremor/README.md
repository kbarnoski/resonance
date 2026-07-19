# 1998-terra-tremor — "TERRA TREMOR"

The living planet plays Resonance. A **real-world-data sonification**: every
earthquake on Earth in the last 24 hours, streamed as struck resonances inside a
slow tectonic drone.

## The one question

> What if the living planet itself played Resonance — every earthquake on Earth in
> the last day, right now, as a struck resonance in a slow tectonic drone?

This is music **about the actual Earth**, not a tune about nothing. The score is
whatever the crust did today.

## The data source

`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` — the
USGS real-time feed of every quake worldwide in the last 24 hours (CORS-open, no
key). We poll it about every **60s**. Each GeoJSON feature gives
`properties.mag`, `properties.place`, `properties.time`, and
`geometry.coordinates = [longitude, latitude, depthKm]`. See `feed.ts`.

## The mapping (mag / depth / longitude → sound)

Each quake is a **struck low resonance** — a tiny modal bell (fundamental + two
partials) plus a filtered-noise transient for the impact (`audio.ts`, `strike()`):

- **Magnitude → energy + register.** Bigger quakes are **lower, louder and ring
  longer** (`register ≈ 46 − mag·3.1` semitones; loudness and decay both scale
  with magnitude). A magnitude-2 event is a soft high tick; a magnitude-6 is a
  low, sustained toll.
- **Depth (km) → timbre brightness.** A low-pass cutoff falls exponentially with
  depth — **shallow quakes are bright, deep quakes (down to ~650km) are dark and
  muffled**, the way the crust filters them.
- **Longitude (−180..180) → stereo pan (−1..1).** The Pacific rim sweeps across
  the stereo field as events fire around the world.

Every struck pitch **snaps to the current mode**, so quakes and drone stay in the
same slowly-turning key.

## The changing scale (why it is not a fixed partial stack)

Under everything runs a **deep tectonic drone** (root ≈ 29 Hz) of three voices:
root, a color voice near a fifth, and an energy-driven thickness octave. Its
fundamental **slowly rises and thickens as the running rate of seismic-energy
release climbs** — a busier Earth hums harder. Crucially the pitch material is a
**modal scale that drifts to a new mode every ~40s** (Aeolian pentatone → Ionian
pentatone → Dorian hexad → Phrygian shade → whole-tone → suspended fourths). This
is deliberately **not** a fixed just-intonation partial stack over a low root — the
point is that the key turns over minutes, and the whole piece re-colours itself.

## Metering (don't fire 300 at once)

A day holds hundreds of quakes. A time-ordered dispatcher meters the queue out over
the poll window (`WINDOW_MS / queueLength`, clamped 90ms–2.2s), so a backed-up batch
plays as a fast rhythmic current and a quiet Earth trickles — the last day
compressed into something listenable. New polls only enqueue genuinely new event
ids.

## Graceful fallback

On **any** fetch / parse / CORS / offline / empty error, the piece switches to a
**synthetic Poisson quake generator** whose magnitudes follow a
Gutenberg–Richter-ish exponential law (many tiny events, the rare violent one),
with random longitude / latitude and an exponential depth tail. An on-brand badge
always reads **LIVE — USGS feed** or **SIMULATED**, so it demos with sound and
motion even with no network and never goes silent. On unmount everything is torn
down: oscillators stopped, timers/RAF cancelled, AudioContext closed.

## The visual

Canvas2D, no WebGL. A dark **equirectangular** Earth — graticule plus soft
continent blobs (abstract/seismographic, not real coastline geometry). Each quake
**blooms as an expanding ring** at its true lat/long, radius ∝ magnitude, fading
out; the biggest get an **ember** glow. A **scrolling seismogram** at the bottom
traces recent event energy. Palette: graphite/ash with deep red-orange ember for
the largest quakes (a genuine "warning" warmth); UI chrome stays on the app's
semantic tokens.

## Named references

Seismic sonification has a real lineage, cited honestly:

- **USGS / IRIS "listening to earthquakes"** — audifications that speed
  seismograms up into the audible band.
- **Florian Dombois — _Auditory Seismology_** — the practice framed as an
  auditory display of seismic data.
- **Andrea Polli** — geophysical/environmental data turned into installation
  sound.

TERRA TREMOR sits in that tradition but treats each event as a *struck note in a
drifting mode* rather than a raw audification of the waveform.

## Where a next cycle could go

Real coastline and plate-boundary geometry; true moment-energy (10^1.5M) weighting
so tectonic hot-spots swell the drone locally; a depth-axis camera; and a
"foreshock → mainshock → aftershock" mode that follows a single sequence through
time.

## Files

- `page.tsx` — client component: Canvas2D world + seismogram, poll/dispatch loops,
  controls, design-notes modal.
- `audio.ts` — Web Audio engine: tectonic drone + drifting modal scale + struck
  quake resonance.
- `feed.ts` — USGS fetch/parse + synthetic Poisson (Gutenberg–Richter) fallback.
- `readme-text.ts` — design-notes copy shown in the in-page modal.
