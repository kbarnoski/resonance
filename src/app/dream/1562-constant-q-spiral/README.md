# 1562 · Constant-Q Spiral

## The one question

> What if you played your voice through a resonant constant-Q filterbank — a
> geometrically-spaced bank of ringing bandpass filters, one per semitone — and
> watched the energy climb a glowing **pitch helix** where every octave is one
> turn of a spiral and every partial lands as a bead of light in a psychedelic
> vortex you can hear ring?

## Why it is new here

This is the dream lab's **first Constant-Q Transform / wavelet-family analysis**
and its **first use of Web Audio's `IIRFilterNode`** — both `grep-0×` across the
entire gallery. Every other piece analyses sound with an **FFT**
(the `AnalyserNode` frequency-bin API). This one does
**not** use an FFT for the analysis at all. Instead it builds a genuine bank of
60 resonant IIR bandpass filters and reads each band's energy directly.

## The technique, concretely

- **Filterbank (`cqt.ts` + `audio.ts`).** 60 bands, 12 per octave, geometrically
  spaced from C2 (65.41 Hz) to ~C7 (2093 Hz): `f[i] = 65.41 · 2^(i/12)`. Every
  band uses the **same quality factor Q** — that is what "constant-Q" means: a
  constant number of cycles per band, so pitch is uniform on a log axis and
  octaves are equal steps (a scalogram, not a linear spectrum).
- **Real biquads.** For each band we compute **RBJ-cookbook bandpass** biquad
  coefficients (`b0,b1,b2 / a0,a1,a2`, normalized by `a0`) for the center
  frequency and Q, and hand the feedforward / feedback arrays to a real
  `IIRFilterNode`. No FFT, no library.
- **Energy per band.** Each filter feeds a small per-band `AnalyserNode` used
  **only** for `getFloatTimeDomainData` → RMS (never its FFT). Those 60 RMS
  values are the CQT column for the frame.
- **Render — pitch helix (`page.tsx`, Canvas2D).** Screen center is the origin.
  For band `i`: `octave = floor(i/12)`, `pc = i mod 12`. **angle = pc/12 · 2π**
  (+ a slow global rotation), **radius = r0 + octave · dr** (+ a small energy
  push). So a note and all its octaves line up on one **radial arm** — octave
  equivalence made visible. Bead brightness/size = band energy; hue climbs
  violet → magenta → cyan by octave and energy. Faint radial threads connect
  same-chroma beads across octaves. An alpha-fade feedback buffer gives glowing
  trails.
- **Audio you hear (the weld).** The summed filterbank output is routed (gently,
  through a `DynamicsCompressor` limiter, master ≤ 0.15) to the speakers, so you
  literally hear the resonant CQT ring — a "played instrument" quality. The 60
  numbers you **see** as beads are the same 60 band outputs you **hear**.

## Idle self-demo (never blank, never silent)

Before the mic is granted — or if it is denied — a **deterministic seeded synth
carrier** (`mulberry32` only — no non-seeded entropy, no wall-clock) plays an evolving
sawtooth arpeggio through the **same** filterbank, so the helix climbs and rings
on its own within a second of pressing start. When the mic is granted, the
carrier fades out and your voice drives the bank.

## Safety

- AudioContext created/resumed only after the start gesture; master gain ≤ 0.15
  through a compressor/limiter; ≤ ~3 concurrent carrier voices. A resonant
  filterbank can ring hot, so per-band gains are modest and everything passes
  the limiter. Full teardown on unmount (cancel RAF, disconnect all 60 filters +
  taps + mix nodes, stop mic tracks, `ctx.close()`).
- Photosensitive-safe: no strobe/flicker; slow global rotation and a sub-3 Hz
  luminance drift; `prefers-reduced-motion` slows motion further.

## References

- **Constant-Q Transform** — Judith C. Brown, *Calculation of a constant Q
  spectral transform*, JASA 1991.
- **Morlet wavelet & the scalogram = CQT equivalence** — a constant-Q filterbank
  is the discrete cousin of a continuous wavelet transform with a Morlet-like
  kernel.
- **Pitch helix** — Drobisch's tone spiral and Roger Shepard's helical model of
  pitch (chroma × height), where octave-equivalent tones share an angle.
- **Bressloff–Cowan cortical form constants** — the spiral / vortex geometry of
  visual hallucination, the target look for the climbing partials.

## Honest limits & roadmap

A real-time resonant filterbank is a **CQT approximation**: sharper bands ring
longer and add latency; softer bands blur pitch. We run Q ≈ 14 (0.8 × the ideal
constant-Q of ~17.3 for 12 bands/octave) as a stability/ring compromise so the
live mic path doesn't edge toward feedback howl.

This is a **multi-cycle commitment**:

- **Cycle 1 (this build):** the pitch helix + played mic + seeded carrier.
- **Cycle 2:** a proper CQT sharpening pass (phase / reassignment or a
  matched-length per-band window) and swapping the synth carrier for Karel's
  real Path piano.

## Files

- `cqt.ts` — pure band layout, constant-Q, and RBJ bandpass coefficients.
- `audio.ts` — the `IIRFilterNode` filterbank engine, mic + seeded carrier, RMS.
- `page.tsx` — Canvas2D pitch-helix renderer + UI (`"use client"`).
- `README.md` — this file.
