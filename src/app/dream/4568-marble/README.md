# 4568 · marble

## The one question

> **What if you could only SUBTRACT — sing a form out of a solid block of
> sound-material that RESISTS you, where every removal is permanent, and what
> remains when you stop is the sculpture?**

This is the additive-synthesis + inline-SVG attack on the concept. You start at
full saturation and carve down; the block fights back; restraint is the art.

## How it works

### The block (inverted synthesis)

- 48 sine oscillators (`audio.ts`, `material.ts`) — one per chromatic partial
  from C3 to B6 — all sounding at once, each with a deterministic ±7-cent
  detune so the slab shimmers and beats. A `DynamicsCompressor` tames the
  48-voice cluster into a bright roar: the uncarved marble.
- This inverts synthesis: instead of building up from silence (additive) or
  filtering a source (subtractive), we begin at **full additive saturation** and
  make music only by **taking away**.

### Pitch → carve (time-domain YIN, not an FFT field)

- `pitch.ts` runs **time-domain YIN / autocorrelation** on the mic's raw
  waveform (`AnalyserNode.getFloatTimeDomainData`): difference function →
  cumulative-mean-normalised difference → absolute threshold → parabolic
  interpolation. It reports one number — the **fundamental** — and nothing else.
  This is deliberately **not** a spectral-centroid/flux/RMS feature field driving
  a visualiser (that pattern is banned this week).
- The detected pitch maps to the nearest still-alive partial (log-cents
  distance). A stable, in-tune hold (≥2 detections, within ~½ semitone, small
  cooldown) **carves** it: the oscillator ramps to zero and the bar falls away.
  Carving is **irreversible** — a partial never comes back within a sculpture.

### Material agency — the block resists (the research heart)

Modelled in `material.ts` + the sim loop in `page.tsx`:

- **Lean-back:** partials within ±2 of a fresh cut get a transient `boost` —
  briefly louder and brighter. The stone pushes against the chisel, so precise
  carving is rewarded and greedy sweeping is punished.
- **Settling:** the remaining block slowly re-tunes / re-beats (a slow detune
  LFO per surviving partial).
- **Greed vs restraint:** cuts closer than ~0.6 s stoke a `heat` accumulator
  that amplifies the lean-back — sweep and the block roars back at you. A
  deliberate, spaced cut (`heat` low, gap > 0.75 s) is rewarded with a chime and
  a resonant bloom across the whole figure.
- **Over-carving is self-defeating:** a live "material remaining %" readout and
  a gentle warning thin out as you go; carve everything and you are left with
  silence and an empty frame. The art is what you **leave**.

### The figure

The surviving partials are the figure in the marble. The seeded auto-sculptor
leaves a wide, luminous **Cmaj9** (C E G B D across four octaves) — a
recognisable sparse chord revealed purely by removal.

### Visual (inline SVG only)

React-rendered `<svg>`: 48 `<rect>` columns packed edge-to-edge fill the frame
as a solid violet slab (violet ramp `#4c1d95 → #8b5cf6 → #ede9fe` over near-black
`#070511`). Live bars shimmer and brighten when they lean back; carved bars
collapse and desaturate toward gray; a bright `<line>` flashes at each fresh cut.
No Canvas2D, no WebGL, no three.js.

## Fallback + seeded self-demo

- On load the **deterministic seeded auto-sculptor** chisels the figure out on
  its own in ~0.75 s (visual paints immediately; audio joins the instant the
  page receives any tap, per browser autoplay policy). Badge: `auto-sculptor`.
- **Carve it yourself** requests the mic → `LIVE mic` mode over a fresh full
  block. If the mic is denied/unavailable it falls back to **tap** (tap any
  column) and **keyboard** (keys along the row chisel low → high), badge
  `tap / keys`, with the destructive-tinted mic notice.
- **Determinism:** no `Math.random` / `Date.now` / argless `new Date()` anywhere
  — a seeded `mulberry32` PRNG (fixed seed `0x9e3779b9`) and `performance.now()`
  for timing. Loads in <1 s and is wrapped to never throw.

## Tags

- **input:** mic (autocorrelation / YIN pitch, + keyboard/tap + auto-sculptor fallback)
- **output:** inline SVG
- **technique:** subtractive additive-synthesis + irreversible carving + material-agency resistance
- **vibe:** material-craft / sculptural-stakes

## References

- Michelangelo's **_levare_** — the subtractive method: "the figure is already
  in the marble; I remove what isn't the figure."
- Zheng, Xambó & Bryan-Kinns, *Explainable AI through the Lens of Material
  Agency* (2026, cs.HC/cs.SD).
- Magnusson / Intelligent Instruments Lab, *Opening the Design Space*
  (arXiv:2604.23583, 2026) — the instrument's material has agency the player
  negotiates with, not a tool that obeys.
- Subtractive vs. additive synthesis as a conceptual frame — inverted here:
  start at full additive saturation, then subtract.

## What's rough / next-cycle deepening

- **Audio needs a gesture.** Browser autoplay policy means the auto-sculptor
  *paints* with zero interaction but *sounds* only after the first tap. On
  desktop the mount-time `resume()` often succeeds so it plays immediately; on
  mobile the first tap unlocks it. This is the honest limit, surfaced as a
  "tap for sound / muted" affordance.
- **YIN is O(τ²) on the main thread.** It runs every other frame on a 1024-sample
  window (512 lags) — fine on a phone, but an AudioWorklet would free the main
  thread and allow a longer, more robust window for low hums.
- **Carve tolerance is fixed** (~½ semitone). Adaptive tolerance that tightens as
  the block thins (harder to carve near survivors) would deepen the "precision"
  reward.
- **Resistance is heuristic**, not physical. A next cycle could couple partials
  as a real modal lattice so a cut genuinely re-voices its neighbours' spectra
  rather than nudging a gain/detune envelope.
- **One fixed figure.** The seed always reveals a Cmaj9; a small bank of seeded
  figures (each a different luminous voicing) would make the auto-demo re-playable.
