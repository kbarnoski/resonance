# Heliochime — the weather of the Sun, right now, as an aurora and a chord

**4008-heliochime**

## The one question

> What if the actual weather of the Sun, **right now**, played itself as an
> aurora and a chord?

## What it is

An audio-visual instrument driven by **live** NOAA Space Weather Prediction
Center telemetry. On **Begin** it fetches the current solar-wind and
geomagnetic conditions, polls them every ~45 seconds, and turns them
continuously into a rippling aurora curtain (Canvas2D) and an evolving drone
chord (Web Audio). It is the measured weather of the Sun this hour — not a
synthetic "space ambient" texture that merely sounds cosmic.

## How to use

1. Press **Begin** (this creates and resumes the `AudioContext` inside the user
   gesture, as browsers require).
2. Listen and watch. The chord and the aurora drift as new telemetry arrives.
3. Read the **HUD** (top-right): live Speed, Density, Bz and Kp with units.
4. The badge (top-left) reads **LIVE · NOAA SWPC** when the real feed is
   flowing, or **SIMULATED** if the feed is unreachable and the seeded fallback
   has taken over.
5. **Design notes** (bottom-right) opens a summary + references overlay.

## Data sources (live, client-side, no key)

All three are public NOAA SWPC JSON products, served CORS-open
(`Access-Control-Allow-Origin: *`), fetched directly from the browser — there
is **no API route / server code** in this prototype.

| Product | URL | Columns used |
| --- | --- | --- |
| Solar-wind plasma | `.../products/solar-wind/plasma-1-day.json` | `[time_tag, density, speed, temperature]` → density, speed |
| Solar-wind mag field | `.../products/solar-wind/mag-1-day.json` | `[time_tag, bx, by, bz, lon, lat, bt]` → Bz, Bt |
| Planetary K-index | `.../products/noaa-planetary-k-index.json` | `[time_tag, kp, …]` → latest Kp |

Each product is an array of rows with a header row; the **last** row is the
latest sample and its fields are parsed as floats. The Kp parser also tolerates
an object-form row (`{ Kp }`) seen on some mirrors. Polling is a single
`setInterval(~45 s)`, each fetch wrapped in `try/catch` behind an
`AbortController` timeout (~9 s).

## Sonification mapping

All parameters are **continuously smoothed** toward their targets
(`setTargetAtTime`, and a per-frame lerp with τ ≈ 2.2 s) so nothing clicks or
steps.

| Solar quantity | Sound |
| --- | --- |
| **Wind speed** (300→700 km/s) | base drone **pitch** — logarithmic map, ~90 Hz low → ~240 Hz high |
| **Density** (0→20 p/cc) | **richness** — amplitude of the upper harmonic partials (octave, twelfth, double-octave, upper shimmer); thicker wind = fuller chord |
| **Bz** southward (negative, geoeffective) | a **beating detuned minor-second** rising dissonance whose level and beat rate grow with \|Bz\|; northward (positive) Bz stays pure/consonant |
| **Bt** (total field) | a small lift to overall body/gain |
| **Kp** (0→7+) | overall **loudness** + tremolo/**shimmer** depth (LFO held ≤3 Hz) |

## Visual mapping (aurora curtain)

| Solar quantity | Aurora |
| --- | --- |
| **Kp** | curtain **height** and **green intensity / brightness** |
| **Wind speed** | horizontal **sway speed** of the rippling bands |
| **Bz** southward | **hue** shifts green → violet, with a red fringe at deep south |

Rendered with `requestAnimationFrame`, 5 additive layered curtains with waving
top edges plus vertical ray streaks, a twinkling starfield, and a horizon glow.
Any brightness pulsing is a slow 0.25 Hz luminance drift — **no hard strobe**.

## Mandatory graceful fallback

On **any** failure (offline, headless, CORS hiccup, malformed rows) the piece
falls back to a **seeded `mulberry32(0x4008)` synthetic telemetry generator**
that random-walks realistic values — speed 300–700 km/s, density 0–20 p/cc, Bz
−12…+12 nT, Kp 0–7 — so it **always** animates and sounds. The badge then reads
**SIMULATED** (in `text-destructive`) with an on-brand notice. A gentle default
telemetry also drives a preview aurora before Begin, so the page is never blank.

## Ambition — how it clears the floor (honest)

- **≥3 subsystems:** (1) live polled multi-endpoint `fetch` of real NOAA
  telemetry with timeout + fallback; (2) multi-parameter continuous additive/FM
  synthesis (drone chord, density-gated partials, Bz dissonance voice, Kp
  tremolo/loudness); (3) an aurora-curtain simulation; (4) a live data HUD.
- **Named references:** NASA **HARP** — *Heliophysics Audified: Resonances in
  Plasmas* (sonification of THEMIS magnetospheric data); **Helioradar AV**
  (audio-visual space-weather monitoring); Joseph Morris — **"Solar Particle
  Wind Chime"** (solar-wind data as a wind-chime instrument); and **MUUUNE**
  (space-weather / cosmic data sonification). Heliochime shares their lineage of
  hearing the heliosphere, but commits specifically to *live, polled* telemetry
  as the score.
- **Lab context / novelty:** this is the lab's **second live-external-data
  sonification**, after `3856-terra`, which sonified live USGS earthquake data.
  The novel axis here is **real live telemetry driving synthesis** — not the
  solar aesthetic. Many prior "solar-wind" pieces are purely synthetic textures
  that only *evoke* the Sun; Heliochime is sound and light computed from the
  Sun's actual measured weather this hour. Where Terra *replays* a fixed
  last-hour window on a compressed loop, Heliochime is **open-ended and live**:
  it keeps polling and the instrument tracks conditions as they change.

## Known limitations / next-cycle deepening

- Sonification uses the single latest sample per poll; it does not yet play the
  1-day time-series as a scrubadble history or sweep.
- The aurora is an artistic curtain, not a physical auroral-oval model; it does
  not place brightness by real magnetic latitude.
- No CME/shock-arrival detection; a sudden speed/density jump could trigger a
  distinct "storm onset" gesture in a future cycle.
- Kp updates slowly (3-hourly cadence upstream) relative to the ~45 s poll, so
  its influence changes gently; sub-Kp geomagnetic proxies could add finer
  real-time motion.

## House style

Dark theme; all chrome uses semantic Tailwind tokens only (`text-foreground`,
`text-muted-foreground`, `text-primary`, `text-destructive`, `bg-background`,
`border-border`). Raw HSL colours appear **only** inside Canvas2D drawing calls
for the aurora art. No new npm dependencies; React + Web Audio + Canvas2D +
`fetch` only. Intervals, `AudioContext`, and the animation frame are all torn
down on unmount.
