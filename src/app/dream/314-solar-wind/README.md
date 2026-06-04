# 314 · Solar Wind

**The one question:** *What if a long-form generative piece were scored, live
and in real time, by the Sun — the actual current state of space weather above
the listener?*

This is the warm, immersive reading of that idea: an evolving just-intonation
drone whose harmony and texture are driven by the live solar wind, paired with a
sky of flowing **aurora curtains** that brighten and turn magenta during
geomagnetic storms. It is not a player; it is a window you open and the Sun
plays through it.

## How it works

Three keyless, CORS-open feeds from **NOAA's Space Weather Prediction Center
(SWPC)** are fetched directly from the browser (no API route, no key), merged
onto a single timeline, and used to continuously glide the synth and visuals.

- `products/solar-wind/plasma-1-day.json` — **speed** (km/s) and **density**
  (p/cm³).
- `products/solar-wind/mag-1-day.json` — **bz_gsm** (nT, the key coupling
  channel) and **bt** (total field).
- `json/planetary_k_index_1m.json` — **Kp** (0–9; ≥5 = geomagnetic storm).

Parsing is **defensive by contract**: the two array feeds ship a header row of
strings, and we look up each channel's column *by name* (`speed`, `density`,
`bz_gsm`, `bt`) rather than hardcoding positions. Missing / `null` / `-9999.9` /
empty values are filtered, times are normalised to UTC, and the three series are
merged with a sample-and-hold (Kp updates slowly). Every fetch is wrapped in
`try/catch`; if all feeds fail we fall back to a bundled ~54-row synthetic day
with a believable storm in the middle (`buildSampleHistory`), so the piece still
plays and animates offline. The HUD always states the source: emerald
**"Live · NOAA SWPC"** vs amber **"Sample data (NOAA feed offline)"**, and any
genuine error is shown in `text-rose-300`.

### Mapping (data → sound)

The audio engine (`audio.ts`) is a fixed bank of sustained oscillators tuned in
**just intonation** over a low D2 (~73.4 Hz) — a stacked-overtone / quartal
drone (ratios 1, 3/2, 2, 3, 4, 5, 6), deliberately **not** C-major-pentatonic.
There are no triggers or plucks: the solar-wind numbers `setTargetAtTime`-glide
the parameters over ~4 s so change is continuous, never clicky.

| Channel | Drives | Feeling |
| --- | --- | --- |
| **Speed** | lowpass cutoff + slight upward register drift | faster wind → brighter, higher |
| **Density** | higher-partial gain + tremolo shimmer depth | denser plasma → thicker texture |
| **Bz** (southward) | detunes the 5th partial → slow beating | south → tension/dissonance; north → settles to a pure ratio |
| **Kp** | overall drive + shimmer rate; aurora brightness/turbulence | high Kp → storm climax, sky lights up |

Everything routes through a **brick-wall `DynamicsCompressor`** limiter and a
modest master gain (~0.42), so a Kp-9 climax can never blast. The AudioContext
is created/resumed inside the "Begin" tap (iOS-safe) and disposed on unmount
(rAF cancelled, intervals cleared).

### Mapping (data → aurora)

The visuals (`aurora.ts`) are **Canvas2D layered curtains** — explicitly *not* a
single full-screen noise shader. Six "curtains" are drawn as folded sheets: a
wavy hanging top edge, a vertical green→magenta gradient that fades to nothing
at the bottom, drawn with additive blending so crossings glow. Geomagnetic
activity (Kp + southward Bz + density) raises brightness, ripple amplitude and
vertical reach; faster wind speeds up the sideways flow; southward Bz pushes the
hue from green toward magenta/violet; audio level adds a top-edge sparkle. A
faint star field and a storm-reactive horizon glow round it out.

### Two modes

- **Live** (default): sonifies the present moment (newest sample), re-polling
  every ~60 s so the piece slowly drifts with the real Sun. It genuinely sounds
  different after a few minutes than at the start.
- **Replay 24h**: time-compresses the fetched 1-day history into ~3 minutes, so
  you hear a whole day of the Sun — including any storm — as a single arc, with
  a progress bar.

## Reference / lineage

- **Terry Riley & Kronos Quartet, *Sun Rings* (2002)** — a composition built
  from Don Gurnett's real NASA plasma-wave recordings of space. This prototype
  is the *live-data* cousin: instead of archival recordings, it scores from the
  Sun's state *right now*.
- **NOAA SWPC** — the live data source.
- **Seismic Sound Lab / SeismoDome** lineage — data that carries strength and
  register at once (here: a storm raises both loudness *and* brightness *and*
  the aurora), making the physical event legible by ear and eye simultaneously.

## What's unverified

- **Live values not seen at build time.** The mapping ranges (speed 300–750,
  density 0–25, Bz ±18) are physically plausible but were tuned against the
  synthetic dataset; an unusually extreme real storm may push a channel past its
  assumed range (clamped, so it won't break — but the *musical* ceiling is a
  guess until heard against a real event).
- **CORS / availability** of the NOAA feeds at the review moment is assumed from
  the brief; the sample-data fallback is the insurance.
- **Musicality of beating** (the Bz tension partial) is theoretically sound but
  has not been A/B'd against alternative tension intervals.

## Next-cycle deepening

- **Stereo / spatial field**: pan partials by magnetic field direction
  (by_gsm / bx_gsm) so the storm has a location in the room.
- **Per-channel voices that enter/exit**, so the listener can learn which sound
  *is* the density vs the field, like instruments in *Sun Rings*.
- **Real storm capture + replay library**: cache notable past days (e.g. a G4
  event) as selectable "scores."
- **Hemisphere awareness**: use the listener's latitude to tune how high the
  curtains sit and how plausible an aurora actually is overhead.
- **A gentle generative macro-form** layered on top (slow swells independent of
  the data) so very quiet solar days still breathe.
