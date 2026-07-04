# 1161 · Flight Choir

**The one question:** _What if the whole sky above the planet right now — every
airliner in flight — became a living, bright, generative choir you could listen
to?_

A wave of hobbyist ADS-B **visual** radars shipped in May–June 2026 (Adafruit's
"DeskRadar64"; the viral "Skylight" ceiling projector). They render the sky but
nobody **sonified** the feed. Flight Choir does: it turns live global air
traffic into a bright, high-key choir over a **daylight cartographic world
map** — the deliberate opposite of the dark cosmic glow the lab overused.

## Use it

1. Open the prototype. The bright map appears immediately and aircraft start
   moving (no audio yet — browsers block autoplay).
2. Click **▶ Listen to the sky** to start audio (gesture-gated for Safari/iOS).
3. Pick a region: **whole world · LHR · JFK · HND · DXB**. Each re-fetches.
4. **Hover an aircraft** to focus it — the legend shows its callsign, altitude,
   speed, climb/descent and rough position. With no cursor over the map it
   auto-focuses the most dramatic voice (fast + high).
5. **how it sounds** reveals the live mapping key.

## Data source (live, keyless, client-side — no API route, no key)

Fetched directly from the browser with an `AbortController` + ~8s timeout:

- **Hub presets** → `https://api.airplanes.live/v2/point/{lat}/{lon}/{radiusNm}`
  (250 nm around the hub). Fields used: `hex`, `flight`, `lat`, `lon`,
  `alt_baro` (ft), `gs` (kt), `track` (deg), `baro_rate` (ft/min).
- **whole world** → `https://opensky-network.org/api/states/all` → `{ states }`,
  each a state array: `[0]` icao24, `[1]` callsign, `[5]` lon, `[6]` lat,
  `[7]` baro altitude (m), `[8]` on_ground, `[9]` velocity (m/s), `[10]`
  true_track (deg), `[11]` vertical_rate (m/s).

Everything is normalised to metres / m/s / degrees. Live snapshots re-poll every
15 s; between polls each aircraft is **dead-reckoned** along its heading for
smooth motion. Live = emerald "N live aircraft" chip.

### Mandatory fallback — simulated sky (always demoable, zero network)

If **any** fetch fails (CORS, offline, rate-limit — which it usually will in a
headless/preview box), the piece seamlessly switches to a **deterministic
simulated field** of ~64 aircraft (`mulberry32` seeded PRNG — never
`Math.random` in hot paths) clustered on real busy corridors + scattered
worldwide, each on its own great-circle heading, with gentle altitude/heading
drift. It runs the **identical** sonification pipeline. Amber "simulated sky"
chip. **The piece is fully demoable with no network at all.**

## Sonification mapping (Web Audio API only, no libraries)

Each tracked aircraft = **one sustained voice** with a real lifecycle: fade-in
on entry (~0.9 s), sustain while tracked, fade-out on exit (~1.1 s).

| Input | → | Sound |
|---|---|---|
| **altitude** (0–13 km) | → | pitch, quantised to a bright **just-intonation lydian** lattice (ratios 1, 9/8, 5/4, **11/8**, 3/2, 5/3, 15/8) over 4 octaves from C3; higher = higher |
| **ground speed** (0–~580 kt) | → | low-pass filter cutoff 380 Hz → 6 kHz (faster = brighter) |
| **longitude** (−180…180) | → | stereo pan via `StereoPannerNode` (west = left, east = right, matching the map) |
| **vertical rate** | → | vibrato depth (LFO → detune) + a small sustained detune glide (climb = shimmer/sharp) |
| **traffic density** | → | shared sub-drone bed gain (sub-octave root + fifth) + reverb depth |

Voices are capped at **16** with voice-stealing (focused + most dramatic
aircraft win). Everything routes through a shared **ConvolverNode** reverb
(generated decaying-noise impulse) and a **DynamicsCompressor** limiter for ear
protection. Params are smoothed with `setTargetAtTime` (no zipper noise).

## Visual (bright Canvas2D — no WebGL, no three.js)

Equirectangular **daylight** world map: pale-blue ocean gradient, warm-sand
continents (coarse hand-authored low-poly outlines), a faint graticule with a
slightly stronger equator. Each aircraft is a small heading-oriented glyph
coloured by altitude (amber low → teal → violet high) with a short fading
motion trail; new live arrivals bloom a small, local, smooth ring. The focused
aircraft gets a highlight ring; a DOM legend (readable dark UI chrome) shows its
details.

## Safety (photosensitive epilepsy)

- No strobe, no full-frame flashes. Blooms are small (≤26 px), local, low-alpha
  (≤0.4) and smooth, capped to new arrivals only.
- The base map is static; motion is gentle aircraft drift.
- `prefers-reduced-motion` halves motion rate, slows blooms, and disables
  vibrato.
- The limiter caps output level.

## Teardown

On unmount: `cancelAnimationFrame`, abort in-flight fetches, clear poll/drift
timers, release + stop all voices, stop the drone, and close the AudioContext.

## References / lineage

- **"Skylight"** ceiling ADS-B projector and Adafruit **"DeskRadar64"** (the
  May–June 2026 hobbyist visual-radar wave) — the visual sky nobody sonified.
- **Andrea Polli** — airspace / atmospheric data sonification (Atmospherics /
  Weather Works; N.; Cloud Car): the lineage of turning live atmospheric and
  air-traffic data into sound.

## Honest gaps

- Continent outlines are **coarse silhouettes**, not GIS coastlines — enough to
  read as a bright cartographic backdrop, not a survey map.
- OpenSky's public endpoint is heavily rate-limited and often CORS-blocked from
  the browser; airplanes.live CORS support varies. In practice the **simulated
  sky is the common demo path**, and it is built to be indistinguishable in feel.
- Dead-reckoning between polls is flat-earth (fine at 15 s intervals); it doesn't
  model wind or true great-circle curvature.
- No aircraft-type / airline timbre differentiation — every voice shares the
  same synth recipe, differentiated only by the mapped parameters.
