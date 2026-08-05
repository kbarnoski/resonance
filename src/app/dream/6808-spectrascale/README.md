# 6808 · Spectrascale

**Living tuning — cycle 2.** A different road from cycle 1 (`6728-commawalk`, a
comma-lattice organ that retunes *chords*). Here the whole **scale** is grown
from the **timbre**: reshape the instrument's spectrum and the entire set of
playable pitches re-lays-out at the valleys of its dissonance curve.

## The one question

> *What if the SCALE itself were built from the timbre?*

Sethares' answer: a spectrum has its own consonant scale. Sweep a second copy of
the spectrum across an octave, sum the sensory dissonance at every interval, and
the **local minima of that curve ARE the consonant scale steps** for that
timbre. Change the timbre → the curve reshapes → a different scale emerges.

## The dissonance-curve method

1. **Spectrum from controls** (`computeSpectrum`). Eight drawbar partials with
   amplitudes `a₁…a₈`, an **octave-stretch** ratio `S` and an **inharmonicity**
   `B`. Partial *n* sits at ratio `n^log₂(S) · √(1 + B·n²)`, normalised so
   `ratio₁ = 1`. With `S = 2, B = 0` this is exactly the harmonic series.
2. **Roughness** (`dissmeasure`). The standard Plomp–Levelt / Sethares model:
   for every pair of partials, `l·(C₁·e^{A₁·s·Δf} + C₂·e^{A₂·s·Δf})` with the
   `Dstar/(S1·f_min + S2)` critical-bandwidth term (`Dstar = 0.24`, `S1 = 0.0207`,
   `S2 = 18.96`, `C1 = 5, C2 = −5, A1 = −3.51, A2 = −5.75`), summed over pairs.
3. **The curve** (`computeScale`). Sweep interval `α ∈ [1, 2]` (unison → octave)
   in 200 steps; at each `α` place a second copy of the spectrum at `α·f` and
   evaluate `dissmeasure`. That 200-point array is drawn directly as the plot.
4. **The scale** (`findValleys`). Local minima with a prominence gate and an
   ~18-cent merge. Each valley is labelled with its cents and nearest
   low-complexity just ratio; those become the playable degrees.

## Mapping (what plays what)

- **Computer keyboard** — `1 2 3 … 0 q w e r …` play the current derived degrees
  in order (unison, each valley, octave). `e.repeat`-guarded.
- **On-screen degree buttons** (≥44px) mirror the same degrees for touch.
- **Drawbar sliders** (partial amplitudes) + **octave-stretch** + **inharmonicity**
  reshape the timbre; the curve and scale **re-derive live**.
- **Preset row** — Harmonic / Stretched / Metallic-inharmonic / Odd-only.
- **Audio** — an additive voice built from the *same* partials (drawbar ratios &
  amps, stretched/inharmonic), so what you hear IS what the curve is computed
  from. 10-voice oldest-steal, `DynamicsCompressor` limiter, master 0.18.

## Output & constraints

- **Pure DOM + CSS, zero GPU.** No `<canvas>`, no `<svg>`, no WebGL. The
  dissonance curve is 200 absolutely-positioned `<div>` bars; valleys are violet
  and labelled; a thin grid marks the 12-TET semitones so the departure from
  equal temperament is visible. All motion is CSS `transform`/`transition`.
- **Alive on load.** A seeded (`mulberry32(0x6808)`) auto-demo slowly morphs the
  timbre harmonic ⇄ stretched ⇄ metallic ⇄ odd; the curve re-flows and the scale
  re-lays-out, occasionally sounding a degree (silent until the Start gesture
  unlocks audio). Yields instantly to any real input.
- **Deterministic** — no `Math.random` / `Date.now`; `mulberry32` + `performance.now`.
- **Degrades gracefully** — no `AudioContext` → curve keeps morphing plus an
  on-brand `text-destructive` notice, never a white screen.
- Full teardown on unmount (cancel rAF, clear timers, remove listeners,
  `AudioContext.close()`).

## Verified minima

Computed directly from the implementation (base C4 = 261.63 Hz):

| Preset    | Curve minima (cents)                          |
| --------- | --------------------------------------------- |
| Harmonic  | 388, 496, 585, 705, 886, 968                  |
| Stretched | 346, 422, 541, 634, 767, 963, 1055            |
| Metallic  | 381, 422, 470, 535, 640, 817, 891, 1007, 1174 |
| Odd-only  | 585, 728, 886                                 |

The **harmonic** spectrum's minima land right on the just ratios —
**388¢ ≈ 5/4 (386)**, **496¢ ≈ 4/3 (498)**, **705¢ ≈ 3/2 (702)**,
**886¢ ≈ 5/3 (884)** — confirming the method. The **stretched** spectrum's
minima are measurably displaced (no valley near 702; instead 634 and 767), and
the **metallic**/inharmonic and **odd-only** spectra yield entirely different,
non-12-TET scales. Changing the timbre visibly changes the derived scale.

## References

- **William Sethares**, *Tuning, Timbre, Spectrum, Scale* — the
  dissonance-curve construction and the timbre/scale "relatedness" chapters.
- **R. Plomp & W. J. M. Levelt**, "Tonal Consonance and Critical Bandwidth,"
  *J. Acoust. Soc. Am.* 38 (1965) — the sensory-dissonance / roughness model.
