# 618 · Solar Organ

**What if the REAL solar wind hitting Earth right now played an organ — and you
watched the actual aurora it is driving?**

This prototype fetches **live, keyless, CORS-open NOAA Space Weather (SWPC)**
data client-side, turns the last ~24 hours of the storm into an evolving
sonified piece (~75 s per sweep, then loops), and renders the aurora that same
data is producing — a hand-written **WGSL curl-noise** auroral curtain, with a
**Canvas2D** fallback. If any feed fails, a built-in **synthetic geomagnetic
storm** keeps the piece alive so you never see a blank screen.

## The data

Three feeds, fetched in parallel with a 6 s `AbortController` timeout, parsed to
numbers with NaN guards, then resampled onto a unified 240-bin / 24h series:

| Feed | URL | Shape | Used columns |
| --- | --- | --- | --- |
| Planetary K-index | `…/products/noaa-planetary-k-index.json` | array of objects | `time_tag`, `Kp` |
| IMF (magnetic field) | `…/products/solar-wind/mag-1-day.json` | array of arrays (row 0 = header) | `time_tag`, `bz_gsm`, `bt` |
| Solar-wind plasma | `…/products/solar-wind/plasma-1-day.json` | array of arrays (row 0 = header) | `time_tag`, `density`, `speed` |

`bz_gsm` (the north–south component of the interplanetary magnetic field) is
**the aurora trigger**: when it turns sharply *southward* (negative) it
reconnects with Earth's field, dumping energy into the magnetosphere — a
substorm. That is the moment everything opens up.

## Data → sound (the magnetospheric organ)

The voice is a bank of **inharmonic** partials at non-just ratios
`1, 2.04, 3.11, 4.33, 5.78, 7.19, 9.02×` — deliberately *not* a warm
just-intonation drone. It has edges.

- **Wind speed → base pitch.** Faster wind (≈300→800 km/s) raises the
  fundamental (≈70→165 Hz) — higher, more urgent.
- **Southward Bz → the aurora opens.** As Bz plunges negative, a lowpass filter
  sweeps open and the upper partials fade in — the substorm crescendo. Northward
  Bz = quiet, closed, sparse.
- **Kp → intensity *and* dissonance.** High Kp detunes the partials (up to ~38
  cents, spread apart not chorused) and raises slightly-offset beating
  oscillators → tense roughness. A real storm sounds like a slow alarm, not a
  hymn. Low Kp = still.
- **Density → granular texture.** A band-passed noise layer thickens with the
  plasma pile-up ahead of the storm front.

Master chain: per-partial gain → bus → lowpass → masterGain →
`DynamicsCompressor` → destination. The `AudioContext` is created and resumed
inside a user gesture (with a `webkitAudioContext` fallback for iOS); after ~2.5
s of idle the piece **autostarts** so a silent glance still hears and sees it.

## Data → visual (curl-noise aurora)

A fullscreen WGSL fragment shader builds vertical auroral curtains. A **curl of
an fBm potential field** (divergence-free flow — Bridson's curl noise) warps the
curtains; `south`, `kp`, `speed`, `density` drive turbulence, height, flicker,
drift, and palette:

- quiet → faint **green** (`#7CFFB2`-ish) low on a near-black sky
- storm-south → curtains rise, brighten, and bleed **violet → crimson** at the crown
- Kp adds fast shimmer/flicker; density sprinkles sparkle dust

If `navigator.gpu` is missing (or adapter/device request fails), it hot-downgrades
to a Canvas2D aurora driven by the same uniforms, and a **backend badge**
(`WEBGPU` / `CANVAS2D`) shows which path is live.

## References

- **Andrea Polli — *Sonic Antarctica* / atmospheric data sonification.** The
  lineage of turning real environmental/atmospheric measurement into sound rather
  than illustration.
- **Auroral substorm physics — the Dungey cycle & southward-Bz reconnection.**
  Why negative Bz is the trigger: dayside reconnection opens field lines, the
  tail loads, and a substorm unloads them into the auroral oval.
- **Robert Bridson — curl noise** ("Curl-Noise for Procedural Fluid Flow"). The
  divergence-free flow-field technique driving the curtain turbulence.

## Honest / unverified-surface notes

- The NOAA feeds were briefed as CORS-clean (`access-control-allow-origin: *`)
  and keyless; the fetch path is wrapped in try/catch + 6 s abort and falls back
  to the synthetic storm, so the piece is robust even if a feed is down, rate-
  limited, or its schema shifts. Live parsing was not run against the wire in
  this build environment — the synthetic path is what was exercised here.
- The sonification mapping is an artistic interpretation, not a calibrated
  geophysical instrument; ratios, ranges, and detune amounts are tuned by ear.
- WebGPU rendering depends on the browser exposing `navigator.gpu`; the Canvas2D
  fallback approximates the same look with stacked translucent bands and shares
  all four data uniforms.
- Resampling carries the last-known value forward across feeds of differing
  cadence; gaps in the real feeds therefore hold rather than interpolate to the
  next reading until a new sample lands.
