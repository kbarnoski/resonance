# 9512 · Heliosong

**What if the live sky were the carrier wave?**

Heliosong turns the *actual current state* of the Sun's wind and Earth's
magnetosphere into an infinite, non-looping cosmic ambient drone-field — a
Brian-Eno-style generative piece you're immersed in, under breathing auroral
light. This is real-data sonification: the space weather happening right now is
the music and the light.

## How it works

On **Play the sky** the browser opens an `AudioContext`, starts a gentle
synthetic-sky drone immediately (so there is sound and light from the first
frame), then reaches for live data. It polls three public NOAA SWPC products
every ~60 seconds, each behind a 4-second `AbortController` timeout:

- Solar-wind **plasma** (speed, density) — `products/solar-wind/plasma-2-hour.json`
- Solar-wind **magnetic field** (Bz, Bt) — `products/solar-wind/mag-2-hour.json`
- Planetary **K-index** (Kp) — `products/noaa-planetary-k-index.json`

Each product is an array-of-arrays with a header row first and the newest
sample last; parsing is defensive (header-aware column lookup, take the last
finite row, physical-range clamps). If any fetch fails, times out, or is
CORS-blocked, the piece falls back to a **seeded synthetic sky** — a slow
random-walk through plausible values — so it is never silent and never blank. A
small note reads *"Live sky unavailable — showing a synthetic sky."*

## The sonification (mappings)

| Live driver | Musical / visual effect |
|---|---|
| **Kp** (storm level) | density of pad events + a touch of detune roughness + reverb smear |
| **Bz south** (negative) | root-pitch **drop**, harmony shifts to the minor/tension scale, light darkens toward violet |
| **Wind speed** | shimmer rate + how often pads swell (tempo of entries) |
| **Plasma density** | master lowpass cutoff / body |
| **Bt** (field magnitude) | overall aurora glow + pad loudness |

The arrangement **never loops**. A drone of three detuned voices holds the
current root, while a self-rescheduling generator keeps minting new pad entries:
each entry draws its register, scale degree, detune, envelope, and next gap from
a seeded PRNG (mulberry32 @ `0x9512`) combined with the live values. Same seed →
reproducible demo; live sky → an arrangement that is always evolving and never
repeats a fixed pattern.

All audio routes through the shared ear-safety master
(`createSafeMaster(ctx, { gain: 0.18 })`).

## The light

Pure **DOM/CSS** — no canvas, no WebGL. Eight layered auroral curtains
(vertical light bands with blurred, screened gradients) drift and breathe on
slow keyframes. Base hue interpolates green → teal → violet as Bz goes south; a
multiply overlay darkens the deep-near-black sky under storm tension. All motion
is slow luminance/position drift **well under 3 Hz — no strobe, no flicker**.
`prefers-reduced-motion` freezes the drift.

## Caveats

- NOAA "real-time" solar-wind is a live spacecraft feed but can lag or drop
  samples; gaps are why the synthetic fallback exists.
- CORS on NOAA SWPC is open in practice, but a hostile network/proxy can still
  block it — the piece degrades gracefully to synthetic.
- Column names occasionally shift between NOAA product revisions; parsing uses
  substring header matching with positional fallbacks, but a major schema change
  would send it to the synthetic sky.
- Mappings are expressive, not scientific — this is an instrument, not an
  instrument reading.

## References

- **Helioradar AV** — av.helioradar.com, v1.0.0 (2026-02-01): infinite,
  non-looping NOAA sonification; the named lineage for this piece.
- **NOAA SWPC Real-Time Solar Wind** — the DSCOVR/ACE-derived plasma and
  magnetic-field feeds and the planetary K-index.
