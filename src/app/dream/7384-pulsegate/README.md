# 7384 · Pulsegate

**What if you could *play* the drop?** Most journey pieces in this lab set a
fixed, pre-baked arc. Pulsegate swaps that for a live **Web-MIDI instrument**:
a human performer drives an EDM build → riser → DROP → breakdown tension arc
in real time, while a **WebGPU compute** energy chamber physically tightens
through the build and erupts on the drop. It is kinetic and physical — a
club energy-chamber, not a transcendent cosmic mandala.

## How to use

1. Press **Begin — arm the sound** (a user gesture is required to start
   `AudioContext`; the visual field is already running before you press it).
2. **Play notes** — a connected MIDI keyboard, the on-screen keys, or your
   computer keyboard's home row: `A W S E D F T G Y H U J K` (naturals on
   `A S D F G H J K`, sharps on `W E T Y U`, one octave + a step from C4).
   Every note bumps the **tension** meter.
3. **Push the riser** — a MIDI mod wheel (CC1), or the on-screen **riser /
   mod** slider. Riding it up during the build opens the filter and swells
   the white-noise riser; releasing it (or letting tension peak) triggers
   the **DROP**.
4. Nothing connected, nobody touching it? A seeded **auto-DJ** performs a
   full 32-bar arc into the exact same input the human uses, so the whole
   piece reads — silently, visually — from first paint. Play anything and
   you take over for good.
5. Pitch-bend (if your controller sends it) colors the lead voice ± 2
   semitones.

## Tags

- **input** = Web MIDI (primary) — note-on velocity → tension, CC1 → riser/
  filter-sweep amount, pitch-bend → lead color. Degrades to an on-screen
  clickable keyboard + a computer-keyboard row, and beneath that a seeded,
  deterministic auto-DJ demo that performs the full arc with zero input.
- **output** = WebGPU compute + WGSL render (primary), an 80,000-particle
  "energy chamber" storage buffer. Falls back to a small Canvas2D field with
  identical physics when `navigator.gpu` is unavailable.
- **technique** = a hand-rolled real-time tension-arc state engine (phases:
  intro → build → riser → drop → breakdown → back) driving a hard EDM voice
  engine (supersaw/detuned-saw lead, sub, white-noise riser sweep, kick)
  with a sidechain-pump envelope, plus the GPU field.
- **vibe** = EDM-kinetic / energy-chamber — energetic, physical, club energy.
  Explicitly not visionary-transcendent, not clinical-microscope.

## The engine (`engine.ts`)

`TensionEngine` exposes exactly two performer entry points:

- `noteOn(vel, human)` — accumulates a decaying tension accumulator
  (`tensionRaw += vel * 0.16`, exponential decay, τ≈6s).
- `setMod(value, human)` — sets the riser/filter-sweep amount directly.

A `step(dt)` call each frame smooths both, runs a steady 128bpm kick clock
that computes the sidechain-pump recovery envelope, decays the drop-burst
impulse, and walks the phase machine with hysteresis and min/max phase
durations (so a shy performer or a stuck mod wheel never permanently stalls
the arc):

```
intro --(tension>0.22)--> build --(mod>0.5 or tension>0.85)--> riser
riser --(mod wheel released after peaking, or 4-bar timeout)--> DROP
drop --(tension decays, or timeout)--> breakdown --(timeout)--> back --> intro/build
```

The **seeded auto-DJ** (`mulberry32(0x7384)`) is not a parallel state
machine — it is a scripted *performance*: a pure function of bar-position
(0–32, looping) that decides note density, velocity, and the mod-wheel
curve, and feeds them into the *same* `noteOn()`/`setMod()` calls a human
uses. The real phase machine reacts to it exactly as it would to a person.
It retires permanently the first time a real input arrives.

## The voice engine (`audio.ts`)

An authentic sidechain topology: the kick bus bypasses the duck (a kick
should hit full-level); the lead stabs, sub, and riser-noise route through a
`duck` GainNode whose value is written every frame from the engine's `pump`
value. Everything sums through a `DynamicsCompressor` limiter
(threshold −6dB, ratio 20:1) into a fixed ~0.25 ceiling.

- **Lead**: 7-voice detuned sawtooth stab per note-on, spread widening with
  tension, through a lowpass filter whose cutoff tracks tension+mod.
- **Sub**: a persistent low sine at two octaves below the arc's root note,
  gain gated by phase + tension.
- **Riser**: a persistent looped seeded-noise buffer through a swept
  bandpass filter, gain shaped by `mod² × phase weight` — quiet until the
  performer pushes the wheel, loud in riser/drop.
- **Kick**: synthesized per hit (150Hz→42Hz pitch envelope, ~260ms decay),
  four-on-the-floor in build/riser/drop/back, half-time in breakdown, off in
  intro.
- **Drop impact**: a one-shot sub thump + noise crack fired once per drop.

## The energy chamber (`gpu.ts`)

A WebGPU compute shader advects a storage buffer of particles through a
containment field: a spring pulls each particle toward a radius that
**shrinks** as tension+mod ("charge") rise, plus a tangential swirl that
**spins faster** with charge, plus a small curl-noise agitation. On the
drop, `dropImpulse` (1 → decaying to 0 over ~0.5s) fires a strong outward
radial force, blowing the containment open, then the chamber re-forms.
Render brightness is multiplied by `pump` every frame — the same
sidechain envelope driving the audio — so the whole field visibly ducks on
every kick. Kick rate at 128bpm is ~2.13Hz, comfortably under the 3Hz
strobe-safety ceiling, and the duck is a smooth exponential recovery, never
a hard flash. Colors draw from the shared `_shared/palette.ts` violet ramp.

`navigator.gpu` absent, or WebGPU init throws → a clear `text-destructive`
notice plus a Canvas2D fallback running the identical physics at ~2,200
particles, so the page never white-screens.

## References

- Dorien Herremans & Elaine Chew, tonal-tension modelling; Elaine Chew's
  spiral-array tension curve — the tension-curve idea a human now performs
  live instead of a model computing it in advance.
- Standard EDM arrangement structure (build / riser / drop / breakdown) as
  an alternate journey-arc shape for the lab, sitting alongside the fixed
  visionary arc most pieces here use.
- Research context, cited honestly and not overclaimed as fresh: the 2026
  symbolic-music explicit tension-curve conditioning thread — *"Explicit
  Tonal Tension Conditioning via Dual-Level Beam Search"* (arXiv
  2511.19342) and **LK_Jam**, a real-time human-AI jam system (arXiv
  2606.21018, 2026) — both compute a Continuous Harmonic Space tension
  trajectory for a model to follow. Pulsegate is the deliberate **non-ML**
  analog: no model, no "first" claimed — a person shapes the curve live,
  the machine just tracks their performance.

## Honest notes / unverified headless

- This was built and reviewed without a browser in the loop (no GPU/audio
  device in this environment). TypeScript (`tsc --noEmit`) and ESLint both
  pass clean on the whole project including this folder, and the code
  follows the same WebGPU guard + Canvas2D fallback pattern already shipped
  in `7240-fluxforge`, but the actual WGSL compile, the audio graph's gain
  staging (whether 0.25 ceiling + the per-voice envelopes clip or feel
  quiet), and the phase-machine's tuned thresholds (whether a real performer
  reaches "riser" and "drop" at musically satisfying moments) are all
  **unverified by ear/eye** and worth a first pass of live tuning.
- The auto-DJ's 32-bar scripted performance is tuned by inspection, not by
  listening — the exact bar boundaries where it crosses into build/riser/
  drop are approximate on purpose (the real phase machine decides, reacting
  to whatever the auto-DJ or the human actually did).
- Pitch-bend is applied only at note-trigger time (frozen per stab), not
  live-swept mid-note — a deliberate scope cut to avoid per-voice bend
  scheduling complexity.

## Next-cycle deepening ideas

1. **Note-off-aware sustain** — currently every note-on is a fixed-envelope
   stab; a real held-note voice pool (with MIDI note-off release) would let
   a performer sustain pads through the breakdown for more expressive
   contrast against the stabs.
2. **Per-performer "drop button"** — a dedicated low key or MIDI CC that
   force-triggers the drop on demand (bypassing the mod-release heuristic),
   for a performer who wants hard manual control over the arrangement hit.
3. **Visual "core" readout of the scale/root** — a small always-on glyph in
   the chamber showing the current auto-DJ/human root note and scale
   degree, so a performer can see what they're about to play into, not just
   feel the field react after the fact.
