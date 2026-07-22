# Phase Society

## The one question

> What if the sense of a crowd finding — or losing — agreement were something you
> could HEAR and SEE, where no single dial controls it, because the "level of
> unity" is an EMERGENT OUTPUT of a whole society of oscillators arguing, not a
> knob you turn?

## What it is

A coupled-oscillator synchrony field. 320 phase oscillators are split into two
communities with different natural-frequency distributions — a **slow** inner
crowd and a **fast** outer crowd — that genuinely conflict: one wants to run
ahead, the other lags. The classic Kuramoto order parameter
**r = |mean(e^{iθ})|** (0 = chaos, 1 = full lock) is the master expressive
scalar, drawn as the bright white centroid vector. It is always a **READOUT** of
the argument between the two communities — never a slider.

## How it works

- **Model.** Two-community mean-field Kuramoto (Kuramoto, 1975). Each oscillator
  is pulled toward its own community's centroid (`K_intra`) and toward the rival
  community's centroid (`K_inter`). The block structure collapses the O(N²) double
  sum to O(N) per step.
- **Memory that disagrees (required).** The field is integrated with **inertia**
  (the second-order Kuramoto model), plus a bistable "lock-memory" that integrates
  with a deadband. Once the crowd locks it resists breaking; once it fractures it
  resists re-forming. The target coupling/gap are also low-passed, so the field's
  own state lags and can contradict a fresh gesture (readouts show `Breaking` when
  the memory is still locked while r falls, `Coalescing` for the reverse).
- **Two controls that fight (no master knob).** Dragging maps X → inter-population
  coupling (pull the crowds together) and Y → frequency gap (widen the argument).
  Neither is "the" driver — unity is what survives the tug-of-war, filtered through
  the hysteresis. **Tap** the inner ring to shock (scramble) the slow crowd, the
  outer ring to shock the fast crowd — a perturbation the field must recover from.
  **Tilt** (DeviceOrientation β/γ) is an alternate mobile perturbation.
- **Autopilot.** Idle > 3.5 s and a seeded `mulberry32` autopilot wanders the two
  targets on slow Lissajous paths and fires periodic shocks, so a phone reviewer at
  06:30 always sees the field breathing between sync and fracture.
- **Sound.** Each community becomes a choral voice — a stack of detuned oscillators
  whose detune spread WIDENS as that community's coherence drops (rough beating,
  cluster-chord cacophony) and COLLAPSES toward unison as it locks. The pitch
  interval between the two voices tracks the frequency gap (unison at agreement → a
  tritone at conflict). Global r opens a lowpass, fades in a consonant fifth-drone,
  and deepens a slow collective tremolo. You hear consensus emerge or fracture.
- **Visual.** Raw WebGL2 (no Canvas2D, no three.js): instanced phase-dots on the
  Kuramoto phase circle, a thin precision grid, three centroid vectors, and a
  scrolling r(t) timeline. Monochrome with one restrained accent.

## Named references

- **"Sound in Multiples: Synchrony and Interaction Design using Coupled-Oscillator
  Networks"** and the **"Collective Rhythms Toolbox"** — audio-visual
  coupled-oscillator interfaces with adjustable coupling matrices inducing dynamic
  rhythmic states.
- **Kuramoto, Y. (1975)** — the foundational coupled-oscillator synchronization
  model.
- **Ryoji Ikeda, *datamatics*** — the monochrome data-precision visual language.

## How it dodges this cycle's bans

- **No master knob** — r is a readout of two conflicting populations plus inertial
  hysteresis; the user perturbs, never sets the level.
- **WebGL2, not Canvas2D** — raw WebGL2 phase-circle renderer.
- **Ikeda mono, not violet→gold** — white/grey dots and thin grid on near-black
  with a single muted-red accent for the rival community.
- **Emergent, not intense** — the piece breathes between agreement and chaos as an
  output of the dynamics, not a driven intensity ramp.
