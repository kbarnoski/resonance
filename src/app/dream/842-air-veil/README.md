# Air Veil — design notes

## The one question

**What if you could HEAR the air a city is breathing right now — and the
dirtier the air, the more it FOULS the harmony?**

A real-world-data sonification piece. Six world cities each become a sustained
voice in a chord; live air-quality data continuously sets how "fouled" each
voice sounds. Clean air rings as a pure, consonant just-intonation partial.
Rising pollution audibly corrupts it — inharmonic partials creep in, oscillators
detune, and detuned pairs beat against each other until the chord turns rough and
grainy. You can hear which cities are choking.

## How it works (three subsystems)

1. **Live AQ fetch / parse** — every ~60s the client fetches the
   [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
   for six cities at once (free, no key, CORS `*`). It reads each city's
   `current.us_aqi` (and `pm2_5`), validates the shape defensively, and ramps
   AQI smoothly toward the new value.
2. **Roughness / inharmonic synthesis engine** (`audio.ts`) — one voice per city
   over a fixed just-intonation chord on a C2 center (ratios `1, 5/4, 3/2, 9/4,
   10/3, 3`). Each voice has a *clean* set of harmonic partials (`1f, 2f, 3f`)
   and a *foul* set of inharmonic partials (`2.1f, 3.34f, 4.7f`), each foul
   partial being a **detuned pair a few Hz apart** for amplitude beating. US-AQI
   drives a continuous `foul` parameter 0..1: as it rises, clean partials recede
   and detune, foul partials swell in (squared, for a late ugly onset), and the
   beating interval widens (faster, rougher). All changes use
   `setTargetAtTime` so the morph is click-free (no zipper noise).
3. **Particle-wind sim + Canvas2D world-map render** (`render.ts`) — an
   equirectangular world map (`x = (lon+180)/360·w`, `y = (90-lat)/180·h`) with a
   low-poly continental silhouette, a glowing AQI-colored dot + name + AQI label
   per city, and a **drifting particle veil** whose density and brownness scale
   with PM2.5/AQI. A synthetic sideways "wind" drifts the particles.

The **aggregate worst-AQI city** raises overall tension: the master lowpass
opens (up to ~7 kHz) and a sub-octave drone thickens — so a single choking city
is felt across the whole mix.

**Master chain:** `gain 0.28 → lowpass → DynamicsCompressor → destination`,
sized to stay clean with six voices.

## Mapping summary

| Input (per city) | Visual | Audio |
| --- | --- | --- |
| US-AQI | dot color (emerald→amber→orange→rose), glow size | `foul` 0..1: inharmonic partials, beating, detune |
| PM2.5 | particle-veil density + brownness | (folds into AQI) |
| worst AQI of all | — | master lowpass cutoff + drone thickness (tension) |

## Graceful degradation (fully demoable with no network)

The canvas animates on load, before audio starts. Audio is gesture-gated behind
a **"Listen to the air"** button (creates/resumes the `AudioContext` on click —
iOS requires this). If the fetch fails or CORS blocks, a visible
`text-rose-300` notice — *"Live feed unavailable — simulated air"* — appears and
the **same pipeline** runs on plausible per-city AQI seeds that drift via a
random walk. Nothing about the mechanic depends on the network. On unmount the
rAF is cancelled, oscillators stopped, the `AudioContext` closed, and resize
listeners removed.

### Open-Meteo response assumptions

- The endpoint returns a **JSON array** (one object per coordinate, in request
  order) — but a single coordinate can return a bare object, so we coerce to an
  array.
- Each row has a `current` block; we read `current.us_aqi` and `current.pm2_5`.
- If `us_aqi` is missing/non-finite we derive it from `pm2_5` via US EPA
  breakpoints (`pm25ToAqi`). Missing rows leave that city on its previous value.

## Named references

- **Andrea Polli & Chad Eby — *Particle Falls*** — live PM2.5 sensor data driving
  a projected particle/light "waterfall" on a building facade; the direct
  ancestor of this piece's particle-veil idea.
- **Mutual Air** — a PM-driven wind-chime installation that lets pollution
  literally play an instrument.
- **Ximena Alarcón — *Huellas de Aire*** (MAMM, Museo de Arte Moderno de
  Medellín) — sonification of air/breath traces; a precedent for treating air as
  voice.

## Ambition criteria

- **#1 — a first for the lab:** this is the lab's **first air-quality external
  feed**. Weather, tide, and solar-wind sonifications exist here, but never AQ.
- **#2 — ≥3 subsystems:** live AQ fetch/parse + roughness/inharmonic synthesis
  engine + particle-wind sim + Canvas2D world-map render (four).
- **#3 — named references:** *Particle Falls*, *Mutual Air*, *Huellas de Aire*
  (above).
