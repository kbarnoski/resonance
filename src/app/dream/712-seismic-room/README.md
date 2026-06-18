# Tremor — `/dream/712-seismic-room`

**The world's earthquakes, live — the moment each one is detected, it becomes a sound and a ripple on the planet.**

## The question

What if Resonance were a room where every earthquake on Earth becomes a struck tone
the instant it's detected — a planet you listen to? You don't watch a chart; you sit
inside the seismic present of the whole planet and hear it tick.

## How it works

A single Canvas2D **equirectangular world map** (faint 30° graticule + dotted
equator/prime-meridian, no image assets) projects each event by longitude/latitude.
Every detection spawns an expanding ring + bright core and, simultaneously, one
synthesized **struck resonant tone**. A continuous low room-tone drone ties events
together. The master chain ends in a brick-wall limiter so a magnitude-7 can never
clip or blast the listener.

### Feed state machine

- Starts in **Simulated swarm**.
- On Start, attempts the EMSC WebSocket. `onopen` → badge flips to **● Live feed**
  (emerald); real events sonify and simulated ones go silent so live is pure.
- `onerror` / `onclose` → calm amber note *"Live feed unavailable — playing a
  simulated swarm."* (never a red error) and falls back to the synthetic swarm.
- A toggle button forces Simulated vs Live at any time.

The synthetic generator is a Poisson-ish process (~3–12 s between events) with
magnitudes drawn from a Gutenberg–Richter distribution
(`mag = 2.5 - log10(rand) * 0.9`, clamped to [2.5, 7.6]) so small quakes vastly
outnumber large ones. This guarantees the piece always sounds and moves, even with
no network.

## Sonification mapping

| Quake property | Audio parameter | Mapping |
| --- | --- | --- |
| **Magnitude** | Fundamental pitch | bigger = lower (140 Hz → 38 Hz across [2.5, 7.6]) |
| **Magnitude** | Loudness | bigger = louder (peak gain 0.12 → 0.67) |
| **Magnitude** | Decay / tail length | bigger = longer release (0.7 s → 4.0 s) |
| **Depth** | Timbre / body | shallow (<70 km) = brighter triangle body; deep (>300 km) = pure low sine |
| **Depth** | Transient "crack" | shallow only: short band-passed noise burst on top; deep = no crack |
| **Depth** | Color (visual) | shallow = amber/red, mid = violet, deep = blue |
| **Longitude** | Stereo pan | lon ∈ [-180, 180] → pan ∈ [-1, 1] via `StereoPannerNode` |
| **Longitude/Latitude** | Position on map | equirectangular projection |
| (shared) | Reverb | procedural impulse-response `ConvolverNode` — a vast room |
| (shared) | Room drone | two detuned low sines under everything |
| (master) | Safety | `DynamicsCompressor` brick-wall limiter (thr −6 dB, ratio 12) + master gain 0.3 |

## Data source

**EMSC / SeismicPortal real-time feed** — `wss://www.seismicportal.eu/standing_order/websocket`
(free, no auth, no key). Messages are GeoJSON FDSN events; we read
`m.data.properties` (`mag`, `depth`, `flynn_region`, `time`, `magtype`, `auth`) and
`m.data.geometry.coordinates` `[lon, lat, depth]`, with `properties.lon`/`.lat` as a
defensive fallback. Only `m.action === "create"` / brand-new `"update"`s are
sonified, deduped by `data.id` / `unid`.

## Named reference

- **Florian Dombois — *Auditory Seismology*** (since ~1998): the canonical art/science
  practice of turning seismograms into audible sound, letting the ear read the Earth's
  vibrations where the eye struggles. Tremor is a real-time, event-level cousin: rather
  than playing back a single sped-up seismogram, it sonifies the *arrival* of each
  detection across the whole planet.
- **EMSC (European-Mediterranean Seismological Centre) real-time WebSocket feed** — the
  live data backbone.
- **Ryoji Ikeda** — the clinical data aesthetic (monospace, graticule, restraint, a
  cosmos of precise points) that the visual register borrows from.

## Next-cycle deepening

- Use `magtype`/`auth` to subtly vary timbre (e.g. teleseismic vs local networks),
  and let `time` (detection lag) bend pitch so you can *hear* how fresh a detection is.
- Add a slow great-circle "P-wave" sweep that travels outward from each large quake to
  a few listening stations, sonifying travel-time — closer to Dombois's seismogram idea.
- Replace the graticule with a real coastline vector path (still no raster assets) so
  events read against actual plate boundaries.
