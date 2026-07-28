# Seismic Bell-Choir (3224)

**Route:** `/dream/3224-seismic`

## The one question

> What if the living Earth played a slow bell-choir? — every real recent
> earthquake becomes a struck resonant voice, and you scrub a 24-hour clock to
> hear the planet's seismicity as generative, meditative gamelan.

## How it works

A 24-hour clock sweeps the day. As its play head crosses each earthquake's
origin-time, that quake **fires**: a struck modal bell rings out and an
expanding ripple blooms on an equirectangular world map at its lat/lon. You can
grab the clock ring and **scrub by hand** — dragging past quakes re-triggers
them, so you can "play" a stretch of the planet's day like an instrument.

- **Input:** a baked USGS-shaped snapshot of ~52 earthquakes (guaranteed,
  network-free) plus an optional live merge of the real USGS `all_day` feed, and
  a play / scrub clock.
- **Output:** Canvas2D — a low-poly world map with quake dots + ripples and a
  24-hour scrub ring (hour ticks, one coloured tick per quake, a violet play
  head). A `font-mono` readout shows the clock time, the last quake
  (mag / depth / region), and how many have struck today.
- **Technique:** data-sonification. Each quake is a **modal bell** — a few
  decaying inharmonic partials (bell/minor-third ratios) plus a short
  band-passed noise-click mallet. Physical-modelling-flavoured, not a sample.
- **Vibe:** documentary / planetary / contemplative. This is music *about* the
  real Earth, not a hand-played toy or an ambient wash.

The baked snapshot auto-plays on load (the clock sweeps immediately, silently).
Audio is armed behind a **Start** button (Web Audio requires a user gesture),
after which the sweep is audible. All timbre jitter is driven by a seeded
`mulberry32` PRNG keyed on each quake's id, so the demo path is byte-reproducible
— no `Math.random` / `Date.now` on the demo path. Live mode is the only place
real `Date.now` / `fetch` are used.

### Live overlay (graceful)

"Load live quakes" fetches
`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
(CORS-enabled, no key) with a 3-second abort timeout, keeps quakes M≥2, maps each
onto the same 24-hour clock via `time % 86_400_000`, and merges them into the
score. If the fetch fails, is blocked, times out, or returns nothing usable, the
piece keeps the baked snapshot and shows a small `text-destructive` note. A
failed fetch never breaks the piece.

## Mapping table

| Quake property | Musical / visual parameter | Mapping |
| --- | --- | --- |
| `depthKm` (0 → 700) | base pitch | `55 · 2^((1 − d/700)·3.6)` Hz — shallow ≈ 660 Hz, deep ≈ 55 Hz. **Continuous**, never snapped to a scale. |
| `mag` (M2 → M7) | loudness | peak env gain `0.03 → 0.26` (pre-master) |
| `mag` | decay length | `0.35 s → 5.0 s` (M2 tick vs M6 long ring) |
| `mag` | partial richness | `2 → 8` inharmonic partials |
| `mag` | mallet click | brighter/louder transient for bigger quakes |
| `lon` (−180 → +180) | stereo pan | `lon / 180`, clamped to `[−1, 1]` (west L, east R) |
| origin `time` | onset | position on the 24-hour scrub clock |
| `mag` | dot size + ripple radius + ring tick length | larger for bigger quakes |
| `mag` | art colour | violet ramp heating to orange for the biggest quakes |

Master gain is `0.13` (≤ 0.15) into a `DynamicsCompressor` limiter
(threshold −8 dB, ratio 20:1) so overlapping quakes layer into chords without
clipping. Up to 16 voices; the oldest is stolen past the cap.

## Named references

- **USGS real-time earthquake GeoJSON feed** — the raw material and the shape of
  the baked snapshot (`.../feed/v1.0/summary/all_day.geojson`).
- **Florian Dombois — earthquake *audification*** — the lineage of making
  seismic data audible. This piece is a *sonification* (parameter-mapped bells)
  in that tradition rather than literal audification of the waveform.

## Honest limitations

- The baked snapshot is *modelled* on real USGS values (plausible locations,
  depths, magnitudes, times) but hand-written — it is not a capture of one
  specific day. Live mode brings in the genuine current feed.
- The world map is deliberately low-poly (coarse continent polygons +
  graticule); it is a legibility backdrop, not an atlas.
- All quakes are mapped onto a single 24-hour UTC clock via `time % day`, so a
  live quake and a baked quake at the same time-of-day collide on the ring.
- Depth→pitch is continuous by design, so the piece is atonal/gamelan-like
  rather than harmonically resolved — intentional, but not to every ear.
- A very fast hand-scrub across many quakes caps at 8 strikes per frame to
  avoid an audio blast; you hear a dense cluster, not literally every one.

## Next-cycle deepening

- Stream the *live* USGS `all_hour` feed continuously so new quakes appear on
  the ring in real time as the day advances.
- True audification option: sonify a real seismogram waveform for a selected
  quake (time-compressed) alongside the bell.
- Depth-based timbre morph (shallow = bright metal, deep = dark wood/gong) on
  top of the pitch mapping.
- Great-circle "P-wave" travel-time ripples that expand across the map at real
  seismic velocity.
- A magnitude/region filter and a "today only vs. this week" clock scale.
