# 418 — Seismic Pulse

**What question does it answer?**
*What if you could HEAR the whole planet shaking — the last 24 hours of real earthquakes, sonified so it never resolves to a chord?*

---

## Data Source

**USGS Earthquake Hazards Program — GeoJSON Feeds (public domain, no API key)**

- All events, last 24 hours: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
- M2.5+ only: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`
- Significant only: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson`

Feeds are GeoJSON FeatureCollections. Each feature provides:
- `properties.mag` — Richter magnitude (can be null; guarded)
- `properties.place` — human-readable location string
- `properties.time` — Unix epoch in milliseconds
- `geometry.coordinates` — `[longitude, latitude, depth_km]`

**Offline fallback:** if the fetch fails or times out (5 s AbortController), the piece falls back to a hard-coded array of ~40 realistic earthquakes spread across the Pacific Ring of Fire with depths from 2–620 km and magnitudes from 0.9–6.4, covering a simulated 24-hour window. A visible amber notice announces the fallback.

---

## Sonification Mapping

The 24-hour earthquake record is compressed into a 75-second loop. Each event fires a sound transient at its proportionally-correct compressed timestamp.

| Seismic parameter | Audio parameter |
|---|---|
| **Magnitude** | Gain (exponential: M6 >> M3), event duration, low-end weight |
| **Depth (km)** | Band-pass filter center frequency — shallow (1 km) → 2200 Hz bright crack; deep (600 km) → 45 Hz low rumble |
| **Longitude** | Stereo pan (`StereoPannerNode`, −180° → −1, +180° → +1) |
| **Latitude** | Band-pass filter Q — higher absolute latitude → narrower resonance (more "ringing") |

**Synthesis layers (per event):**
1. **Filtered noise burst** — white noise through a band-pass filter, always present. The core "crack" or "rumble" texture.
2. **Sub-bass sine boom** (M3.5+) — a short, non-musical sine transient at a data-mapped frequency (~38–65 Hz). Frequencies are raw data values; no scale quantization or equal-temperament snapping.
3. **High-frequency crack** — for shallow (<30 km), small (<M2.5) events: a decaying noise burst through a high-pass filter, center also data-mapped from depth.

**Tectonic drone bed:** two slightly-detuned sub-oscillators (28.3 Hz, 31.7 Hz) running continuously — their ~3.4 Hz beating is intentionally anti-consonant, giving the silent gaps between quakes the feeling of a living, restless planet. A `DynamicsCompressorNode` limits the master output.

**Design intent:** the result should read as the planet's noise, not a melody. No pitch is snapped to a scale; no chord is formed; no resolution is possible. The Earth shakes continuously and atonally.

---

## Visual Mapping

- **Dark equirectangular world map** drawn in Canvas2D: faint graticule (30° grid) + simplified continent polylines from Natural Earth public-domain data.
- **Persistent quake dots:** all events in the dataset rendered as faint dots at their (lon, lat) position, with amber tint for M4.5+ events.
- **Flash events:** each quake fires an expanding ring + bright center dot at the moment of sound, with ring radius and duration proportional to magnitude. M5.5+ events fire two concentric expanding rings.
- **24-hour timeline** at the bottom with amber ticks for significant events and a moving playhead.
- **Live text readout** showing the currently-firing event: magnitude (amber for M4.5+), place name, depth, coordinates.

---

## Named References

**Ryoji Ikeda — *data-cosm*** (180 Studios, London — on view through February 2026)
Ikeda's installation turns vast datasets (cosmological, biological, seismic) into extreme monochrome audio-visual streams. *Seismic Pulse* inherits his clinical-minimal aesthetic: dark ground, white/amber data marks, no ornamentation, no narrative arc. The piece refuses to resolve because the data it represents never resolves.

**USGS Earthquake Audification — "From Wiggles to Pops, Booms and Rumbles"**
AGU/Eos, Benjamin Baker et al. (2018). Documents the USGS practice of directly sonifying seismograph waveforms — mapping seismic velocity to audio samples, audible at 250× speed. The characterization of earthquakes as "pops, booms, and rumbles" (with small local quakes reading as pops and large teleseismic events reading as deep booms) directly informs this prototype's noise-burst + sub-sine architecture.

---

## Unverified Surface Notes

This prototype is **build-verified** (TypeScript compiles clean, ESLint passes on all prototype files) but **not browser/audio-verified in the sandbox environment** (no browser runtime available during build). The following behaviors are implemented but unconfirmed at runtime:

- AudioContext autoplay policy: the auto-demo starts playback 2.5 s after load, which may be blocked on iOS/Safari. A "Tap to enable sound" notice and canvas-tap handler are included to handle this.
- USGS CORS: the feed URL is confirmed CORS-enabled as of the brief spec, but may change.
- Canvas sizing on mobile: the ResizeObserver-driven DPR-aware canvas sizing is standard but untested on device.
- The build infrastructure failure (`ENOENT: 500.html`) in `npm run build` is a pre-existing project issue unrelated to this prototype; the ESLint and TypeScript compilation phases both pass cleanly for `src/app/dream/418-seismic-pulse/`.
