# 279 — Tremor Score

> **What if Resonance composed in real time from the planet's LIVE seismic activity — turning the earthquakes happening right now into an evolving, non-looping piece?**

Tremor Score is the lab's first piece driven by a **live external API**. It fetches the
USGS real-time earthquake feed and turns every quake on Earth into a sound event and an
ink mark, so the composition is literally about the world *right now* and never exactly
repeats.

## How to use it

1. Press **Begin listening to the Earth**. A calm low drone fades in (the room is never
   silent) and the current day's quakes are plotted quietly on the world map.
2. **Live** mode: the feed is polled every 60s. When genuinely new quakes appear (a
   `time` newer than anything seen), they *sound and draw* as they arrive — staggered so a
   batch never slams.
3. **Replay 24h** mode: the whole day is fast-played in time-compressed order
   (24h → ~90s) as a one-shot composition.
4. Toggle **Last 24h / Last hour** to switch feeds (`all_day` vs `all_hour`).
5. **Mute** silences everything (drone included) while the visuals continue.

Loads instantly; the audio engine and network only start on the first button press
(browser autoplay policy).

## Data source

USGS real-time earthquake GeoJSON feeds (CORS-enabled, no API key):

- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`

Each feature gives `properties.mag`, `properties.place`, `properties.time` (ms epoch),
and `geometry.coordinates = [lon, lat, depth_km]`.

## Mapping table (data → sound)

| Quake property | Sound parameter |
|---|---|
| **Magnitude** | Loudness (peak gain), note **duration**, and — for M ≥ 2.2 — a deep **sub-rumble** sine swell; for M ≥ 4 a filtered low-noise rumble that crescendos then decays. Small quakes are brief plucks. |
| **Depth (km)** | **Pitch register / timbre.** 0 km → high & bright; ~650 km → very low, dark, muffled (lowpass cutoff falls with depth). Pitch is chosen from a **just-intonation / overtone palette** over a 55 Hz root — *not* a C-major pentatonic (banned this cycle). |
| **Longitude** | **Stereo pan** via `StereoPannerNode`: −180°W = hard left, +180°E = hard right. |
| **Latitude** | Secondary modulation: **tone brightness** (filter cutoff rises with `abs(lat)`), and waveform shifts to sawtooth for large events. |

Signal path per quake: oscillator(+sub/noise) → lowpass filter → gain envelope →
`StereoPanner` → master gain → `DynamicsCompressor` (limiter, so a swarm never clips).

## Visual — deliberately non-luminous

A hard constraint this cycle: **no glow, no three.js, no WebGL, no additive blending.**
A single Canvas2D in plain `source-over`, ink-on-paper on near-black:

- A restrained graphite **lat/long graticule** + map frame (equirectangular).
- Each quake is plotted at its (lon, lat) as an expanding **ink ring** that pulses once
  and settles to a quiet dot whose size ∝ magnitude (M ≥ 5 gets the one muted amber accent).
- A continuous **seismograph ribbon** along the bottom — a pen-on-drum-paper ink trace
  that jolts (amplitude ∝ magnitude) when a quake sounds, then decays and scrolls.

Palette: bone-white ink, graphite grid, one muted amber accent. Ikeda-data calm.

## What's novel

- **First live-external-API real-world-data sonification in the lab** — a technique never
  used here before. The piece is non-deterministic and tied to actual planetary events.
- **Non-luminous on purpose.** The lab is over-saturated with glowing particle clouds;
  this is the deliberate opposite — a scientific, graphite seismograph aesthetic.
- ≥3 subsystems: (1) live polling fetch + new-event diffing, (2) data→sound mapping
  engine, (3) Web Audio synth with limiter + ambient drone, (4) Canvas2D ink seismograph/map.

## Graceful degradation

If the USGS fetch fails (offline, CORS, blocked, or empty feed), the piece falls back to a
**bundled constant set of ~30 plausible recent quakes** (M 1.0–7.2, depths 5–650 km,
longitudes spanning the globe) and plays/draws them on a gentle timer. A readable
`text-amber-300/95` notice appears: *"Live feed unavailable — playing from a cached set of
recent quakes."* The prototype is fully demoable with **zero network**.

## Named references

- **SeismoDome** — Ben Holtzman, Seismic Sound Lab, Lamont-Doherty Earth Observatory /
  American Museum of Natural History: turning seismometer waveforms into planetarium
  sound + visuals.
- **seismic2midi** — the seismic-data → MIDI sonification approach (PyPI, updated Nov 2025).
- Data: **USGS real-time earthquake feeds**.

## Next-cycle deepening

- Use real waveform data (USGS event detail / FDSN) instead of point events, so each quake
  *sounds its actual ground motion* rather than a synthesized envelope.
- Tectonic-plate context: draw plate boundaries and let aftershock *sequences* form motifs.
- Spatial audio (HRTF `PannerNode`) placing quakes on a 3D globe of the listener.
- Aftershock clustering → rhythmic phrases; great-circle distance from the listener →
  pre-delay, as if the sound travels through the Earth.
- A scrubbable 30-day timeline and a "biggest of the year" curated replay.
