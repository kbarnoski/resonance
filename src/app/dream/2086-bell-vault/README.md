# 2086 · Bell Vault

A cathedral of struck & bowed metal you *play* — every strike is a real
dispersive resonant body voiced by banded-waveguide / modal physical-modeling
synthesis in the browser, never a canned bell sample.

## How to play

- **Enter the vault** (a user gesture is required to start audio).
- **Keyboard** — the keys `A S D F G H J K L ; '` map left→right, low→high
  across a two-octave bronze minor-pentatonic. Press to strike.
- **Bow** — hold **Shift** while pressing a key to *bow* that body: continuous
  filtered-noise energy is injected into the same resonator bank, so it sings
  and swells instead of ringing down.
- **Tilt-strum** — on a phone, tilt left/right (`deviceorientation.gamma`)
  to sweep/arpeggiate the vault across the note row; tilt speed sets velocity.
- **Material** — switch between *bronze bar*, *singing bowl*, and *bronze plate*
  (each a different inharmonic partial set and decay).
- **On-screen note row** — mirrors the keyboard for pointer play (the primary
  expressive inputs are keys + tilt).
- **Autopilot** — after ~8 s idle a deterministic, seeded phrase plays itself
  (mulberry32, seed `0x2086`) so the screen is never dead.

Degrades gracefully: no Web Audio → on-brand notice; no `deviceorientation` →
keyboard/pointer still work; `prefers-reduced-motion` quiets the background
drift. All motion is smooth energy decay — no luminance flicker above ~1 Hz,
no strobe.

## Core technique — modal / banded-waveguide synthesis

Each struck body is a **bank of high-Q `BiquadFilter` bandpass resonators**, one
per vibrational mode, excited by a short **raised-cosine noise burst** through a
per-body **dispersion allpass**:

```
exciter burst ─► dispersion allpass ─► ┌ bandpass @ f·r₀ (Q₀) ┐
(raised-cosine)                         ├ bandpass @ f·r₁ (Q₁) ┤ ─► voice ─► dry + reverb
+ seeded jitter                         └ bandpass @ f·rₙ (Qₙ) ┘
```

The ring you hear is the resonators' **own** decay, not an imposed envelope:
each mode's decay time is `τ = Q / (π·f)`, and Q is derived per mode from the
material's target decay (capped at 1800 for stability). Because higher modes sit
at higher `f`, they damp faster — the frequency-dependent damping of real metal
falls out for free. The visualizer reads the *same* `τ` values, so bars and ears
always agree. Bowing re-uses the identical bank with a looping noise source.

This is a Web-Audio realization of the family in the named reference below;
the bandpass-resonator bank is the standard modal realization, with the
inharmonic stretched ratios + dispersion allpass standing in for the traveling
wave of a full banded waveguide.

## Material partial-sets (the ones I chose)

All inharmonic and hand-derived. **None use the lab-banned Chladni set
`{1, 2.76, 5.40, 8.93}`.**

| Material | Ratios | Character |
|---|---|---|
| **Bronze bar** | `1 · 3.98 · 10.68 · 17.9` | Tuned vibraphone-bar voicing (1 : ~4 : ~10.7), bright attack, medium ring (~3.4 s) |
| **Singing bowl** | `1 · 2.66 · 4.97 · 7.36 · 10.2` (+ a ~7-cent beating twin fundamental) | Very long ring (~7.5 s), slow acoustic beat, the natural body to bow |
| **Bronze plate** | `1 · 2.31 · 3.79 · 5.44 · 7.18 · 9.10` | Dense, clangorous, strongly inharmonic, shorter ring (~2.2 s) |

Per-strike seeded jitter (±0.2% detune, random exciter from a pool of 8,
velocity-dependent mallet brightness) means no two strikes are identical.

## Subsystems

1. **Physical-modeling voice engine** (`synth.ts`) — resonator/waveguide bank +
   raised-cosine exciter + dispersion allpass + seeded jitter; strike *and* bow.
2. **Playing surface** (`page.tsx`) — keyboard mapping, device-tilt strum /
   arpeggiator, and a bronze/bowl/plate material selector (distinct partial set
   & decay each).
3. **Canvas2D modal-spectrum visualizer** (`viz.ts`) — draws the live per-mode
   energy: each partial a decaying bar/ring, height = that mode's energy, X =
   frequency (log axis), so you see the dispersion and decay you hear.
4. **Room bed** — a synthesized-impulse `ConvolverNode` reverb plus a low drift
   drone ("vault air") the strikes ring into.

## Named reference

Georg Essl & Perry R. Cook, *"Banded Waveguides: Towards Physical Modeling of
Bar Percussion Instruments"* (ICMC 1999), and Perry Cook's **STK (Synthesis
ToolKit)** modal / banded-waveguide models. This engine is a browser Web-Audio
realization of that family.

## What I'd do next cycle

- Add a true delay-line waveguide (`DelayNode` + allpass dispersion + feedback)
  per band, for a more literal banded-waveguide traveling wave alongside the
  biquad modal bank, and A/B the two.
- Move the bank into an `AudioWorklet` so I can read exact per-mode amplitude
  from the DSP rather than tracking analytic envelopes, and support many more
  simultaneous voices without GC pressure.
- Velocity-sensitive strike *position* (striking a bar off-centre changes which
  modes are excited) mapped to vertical pointer/tilt.
- A second beating twin on more partials for a richer bell "warble", and a
  strike-hardness control exposed in the UI.
