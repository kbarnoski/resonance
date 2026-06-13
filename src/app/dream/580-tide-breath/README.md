# 580 · Tide Breath

**Question:** What if the real ocean breathed a warm chord?

---

## What it is

A sustained, warm just-intonation drone whose breath is paced by the visitor's actual coast: the
swell period, wave height, and sea surface temperature are fetched live (no key, no server) from
Open-Meteo Marine and mapped directly onto the synthesis and water-surface rendering. There is no
melody, no rhythm, no note-tapping — one continuous chord that inhales and exhales with the sea.

---

## How it works

### Data → Sound → Visual

**Marine fetch:**
`GET https://marine-api.open-meteo.com/v1/marine?…&current=wave_height,wave_period,
swell_wave_height,swell_wave_period,sea_surface_temperature`

Three live values drive everything:

| Marine value | Synthesis mapping | Visual mapping |
|---|---|---|
| `swell_wave_period` (6–18 s) | Pace of the master gain + lowpass LFO (one full breath per swell cycle) | Speed & wavelength of the surface height field |
| `wave_height` (m) | Depth of the breath envelope (bigger swell → deeper inhale/exhale) | Amplitude of the drawn waves |
| `sea_surface_temperature` (°C) | Timbre tilt: cooler → darker lowpass cutoff; warmer → brighter upper harmonics | Palette: cool blues/teals vs warm ambers/corals |

**Synthesis chain (`audio.ts`):**
Six oscillator pairs (sine + triangle, slightly detuned for warmth) tuned to a D2 just-intonation
chord: ratios 1, 3/2, 2/1, 5/2, 3/1, 7/4. Each voice pair runs through its own gentle lowpass,
then into a shared mix gain, master lowpass, and dynamics compressor. A rAF-driven sine breath LFO
modulates the master gain and cutoff frequency on every frame using `setTargetAtTime`.

**Visual renderer (`render.ts`):**
Feature-detects `navigator.gpu`. If WebGPU is available a full-screen WGSL fragment shader computes
a sum-of-sines water surface with horizon glow and shimmer, tinted by a temperature-derived palette.
If WebGPU is absent or init fails, a Canvas2D path draws the same wave math as a filled polygon with
glow strokes and glint points. Both paths update `params` instantly when marine data arrives.

---

## Graceful degradation

| Axis | Behaviour |
|---|---|
| **No location permission / timeout** | Silently falls back to Monterey Bay (36.95°N, 122.02°W); labelled in status line |
| **Marine API offline / network error** | Uses baked sample data (period 11 s, height 1.4 m, SST 14°C); amber status "Sample swell (feed offline)" |
| **No WebGPU** | Canvas2D renderer activates; same wave math + breathing waterline |
| **iOS audio unlock** | AudioContext built inside the user-gesture handler; webkit fallback typed safely |

The piece always plays and always breathes, regardless of connectivity or browser support.

---

## Ambition read

**3 / 5** — Three independent subsystems (live marine data fetch + sonification mapping + dual
WebGPU/Canvas2D water render + breathing drone synth) are connected into a single coherent
autonomous piece with graceful degradation on every axis. The first-claim of "real-data
sonification" is not made; that practice exists broadly (Andrea Polli's work, environmental sound
art). What is fresh here is the marine → breath → drone structure with an autonomous just-intonation
chord that requires no interaction beyond a gesture.

---

## References

- **Andrea Polli** — ocean and climate data sonification; *Atmospherics/Weather Works* (2004) and
  subsequent pieces demonstrating the aesthetic validity of mapping environmental datasets directly
  onto sustained sound.
- **Éliane Radigue** — long-form drone composition built from sustained, slowly evolving electronic
  tones; foundational to the sensibility of a piece with no onset or melody.
- **La Monte Young** — just-intonation sustained-tone practice; the harmonic series ratios used here
  (1, 3/2, 2/1, 5/2, 3/1, 7/4) draw directly from the tradition he established.
- **Open-Meteo Marine API** — `https://marine-api.open-meteo.com/` — keyless, CORS-open, public
  domain marine forecast data.
