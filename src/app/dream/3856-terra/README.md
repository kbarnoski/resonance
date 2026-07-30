# Terra — the living planet as an acoustic space

**3856-terra**

## The one question

> What if a recording of the *living planet* — the real global earthquakes
> happening in the last hour — were the score, and you could hear and watch the
> Earth as an acoustic space?

## What it is

A slowly self-rotating 3-D globe (three.js). On mount it fetches the live USGS
global earthquake feed and replays the last hour of seismicity, time-compressed
into a ~90-second loop, as synchronized sound and light. Every earthquake is a
point at its true latitude/longitude; when its moment arrives in the replay
clock it blooms — visually and sonically — and then keeps glowing.

## How it works

### Data source

- Live client-side `fetch` of
  `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`.
- The endpoint sends `Access-Control-Allow-Origin: *`, so no API route / proxy
  is needed. There is no server code in this prototype.
- Each GeoJSON feature gives `geometry.coordinates = [lon, lat, depth_km]` plus
  `properties.mag`, `properties.time` (epoch ms) and `properties.place`.

### The replay clock

- The window is the last hour: `[now - 1h, now]`.
- That hour is compressed into ~90 s and looped. On each loop the glowing dots
  and rings are cleared and the hour re-plays.
- A **coherence / tempo** slider (0.25×–3×) speeds or slows the clock live.
- On Begin the clock is seeded just before the first quake so a strike lands
  within ~2 s — the piece never opens on silence.

### When a quake fires

**Visual**
- An expanding shockwave ring bloom, tangent to the globe surface at the
  epicentre, scaling outward and fading over ~2 s (larger magnitude → wider).
- A persistent glowing dot sized by magnitude, warm-to-hot coloured by
  magnitude, gently shimmering, kept until the loop resets.

**Sound** — a struck modal-resonator "bell": a bank of 3–5 inharmonic
detuned sine/triangle partials with per-partial decay envelopes through a
lowpass and a stereo panner. Mappings (all **continuous**, never quantized to a
musical scale):
- **magnitude → gain + decay length** — bigger quakes are louder and ring out
  longer, with more partials.
- **depth (km) → brightness / register** — continuous logarithmic map; shallow =
  bright and high (~520 Hz), deep = dark and low (~66 Hz), with the lowpass
  cutoff tracking the same axis.
- **longitude → stereo pan** via `StereoPannerNode` — west = left, east = right.

**Bed & drone**
- A soft sustained **drone pad** whose gain and cutoff track the total released
  energy (sum of `10^mag` with exponential decay), so busy minutes swell and
  quiet minutes hush.
- Under everything, a continuous **ambient bed** — a low pad (bare fifth) with a
  very slow filter drift. No drums, no pentatonic snapping; continuous pitch
  only.

### Mandatory graceful fallback

- If the fetch fails, times out (~6 s via `AbortController`), or returns zero
  features, the piece falls back to a **seeded synthetic quake stream** built
  with an inline `mulberry32(0x3856)` PRNG (deterministic — never
  `Math.random` for the stream) that scatters plausible quakes across tectonic
  belts over the last hour. So it always self-demos with sound + rings within
  ~2 s of Begin, headless included.
- A subtle status line reads **"live feed — USGS all_hour"** (muted) vs
  **"synthetic demo (feed unavailable)"** — the latter shown in
  `text-destructive` when it was a genuine fetch error.
- If **WebGL** is unavailable the globe is replaced by an on-brand notice and an
  audio-only replay loop still plays the planet.

## Controls

- **Begin** — starts audio (the `AudioContext` is created and resumed inside the
  click handler, as browsers require a user gesture).
- **Drag** the globe to rotate/orbit it; it also auto-rotates slowly on its own,
  with a little inertia after a flick.
- **Coherence / tempo slider** — speed up or slow down the replay clock.
- **Readout** (top-right) — current UTC replay time, count of quakes in the
  window, and the largest magnitude. Each fired quake briefly names its place
  and magnitude.
- **Design notes** — corner link opening a modal with the essence of this README.

## Named reference

Inspired by the **Seismic Sound Lab** — Ben Holtzman, Jason Candler and Nolan
Lem (Lamont-Doherty Earth Observatory / American Museum of Natural History,
Hayden Planetarium), *"Sights, Sounds and Perception of the Earth as an Acoustic
Space"* — which time-compresses seismic data into sound synchronized with globe
renderings. Framed for the present by **SIGGRAPH Real-Time Live! 2026**
(July 21, 2026) and its emphasis on live, real-time data as performance.

## Known limitations / next-cycle deepening

- The globe uses a latitude/longitude graticule rather than real coastlines
  (no offline map data bundled) — dots read positionally but not against
  continents. Next: an embedded low-poly coastline outline.
- The shockwave ring is a tangent-plane approximation, not a true geodesic wave
  crawling the curved surface. A surface-shader ring travelling along great
  circles would be more physically faithful.
- No P/S-wave arrival modelling or moment-tensor timbre; every quake is a single
  struck bell. A next cycle could give shallow strike-slip vs deep megathrust
  events distinct spectral signatures.
- The feed is fetched once on mount; a live prototype could poll `all_hour`
  every minute and let genuinely new quakes ring in real time as they occur.
- The drone's energy window is a single global sum; spatializing the drone by
  hemisphere would let a swarm in one region colour that side of the field.
