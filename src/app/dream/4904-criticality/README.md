# 4904 · Criticality

> **"What if your own voice could tip a poised field over the edge — long-range
> order into scale-free entropy — and the crossing itself felt like the boundary
> between you and everything dissolving?"**

A phase-transition instrument. A 2D field sits **poised just below its critical
point**. Below criticality it shows a bright, coherent "self" pattern with
visible **long-range order** — a symmetric radial standing-wave mandala,
localised against a dark surround (the boundary between you and everything). The
user's **own voice** is the control parameter: sustained voice pushes the field
**past the critical point**, where the correlation length diverges and then
long-range order shatters into **scale-free entropic turbulence** that fills the
whole frame. No centre, no boundary — a boundless glowing medium. **That crossing
is the ego-dissolution.** Fall silent and the self slowly re-forms.

This renders the *mechanism* of a visionary peak — a measurable criticality
shift — not its content.

## How criticality maps to ego-dissolution

The newest neuroimaging of visionary states localises ego-dissolution to a measurable
**criticality shift**: the collapse of posterior alpha rhythm pushes cortical
dynamics past the brain's slightly-subcritical operating point into a more
entropic / near-critical regime, and the *magnitude* of that shift correlates
with rated ego-dissolution intensity.

The instrument makes that literal:

- **Control parameter** `pressure` (0..1), critical at `P_CRIT = 0.62`. It rests
  below criticality (a slightly-subcritical, coherent "self").
- **Order parameter** `order` collapses from ~1 (coherent long-range order) to 0
  as `pressure` crosses `P_CRIT`, following a mean-field-flavoured
  `((Pc − p)/Pc)^0.55`.
- **Correlation-length bloom** `crit` is a Gaussian in `|p − Pc|` — it diverges
  *at* the crossing (critical opalescence: all-scale fluctuations), seen as a
  swell and heard as an audio surge.
- **Entropy** `= 1 − order` drives the scale-free turbulence (a 1/f multi-octave
  fBm with no privileged length scale) and the audio's decoherence.

It is a **metaphor made literal**, not a claim that the brain *is* this exact
mean-field system.

## Input — your own voice (real FFT / RMS)

- Web Audio `AnalyserNode` (`fftSize = 2048`) on the live mic stream (never routed
  to the destination — no feedback).
- Drive = broadband **RMS loudness** blended with a **low-band (~80–350 Hz)
  energy proxy** standing in for the alpha-band collapse (cortical alpha is
  ~8–12 Hz and inaudible; the audible analogue is sustained low voiced energy).
- The core integrates the drive with **asymmetric attack/release** (voice builds
  pressure in ~0.85 s, silence releases it over ~2.6 s), so dissolution feels
  earned and the self re-coheres slowly.

## Output — a drone that dissolves in lockstep

A consonant additive drone (8 partials on the harmonic series 1..8 of a 110 Hz
root) whose harmonic **coherence** dissolves as the field crosses criticality:

- partials progressively **detune** (cents ∝ entropy) and drift slightly
  **inharmonic** off the harmonic grid;
- a rising **broadband noise floor** whose low-pass opens from ~240 Hz to ~6 kHz;
- a **widening reverb** (wet up, dry down) → a boundary-less space;
- a **swell** at the critical bloom (opalescence heard as a surge).

Everything runs through a limiter; sound is gesture-gated (AudioContext resumes
on first tap) and shares one AudioContext with the mic.

## Safety design (photosensitive epilepsy)

Non-negotiable, and built in:

- **No strobe by default.** Motion is slow luminance *drift*. The field's phase
  advances at a clamped speed (base ~0.6 rad/s; *Intensify* adds up to ~1.4
  rad/s). Every temporal term in the shader uses a small angular coefficient, so
  per-pixel luminance oscillates far below the photosensitive danger band —
  well under ~3 Hz even at maximum intensity.
- **Always-visible instant kill.** *Calm / Stop* freezes all motion (the phase
  accumulator stops) and fades the drone to silence the same frame.
- **`prefers-reduced-motion`** damps motion speed to 0.4×.
- The order/entropy/crit values change on the *voice* timescale (seconds), so the
  overall brightness envelope also drifts slowly rather than flickering.

## Degradation

- **No mic / denied:** a deterministic **seeded auto-demo** scripts a voice
  envelope (rest → build → cross criticality → boundless dissolution → release →
  re-cohere, looping every 17 s). The field self-paints a coherent self from the
  first frame; audio joins on first tap. A `text-destructive` notice explains the
  mic fallback.
- **No WebGL2:** a Canvas2D fallback still shows order → entropy.
- **No Web Audio:** the field still runs; a notice reports no sound.
- **Determinism:** no `Math.random` / `Date.now` / `new Date`. Randomness is a
  seeded `mulberry32(0x4904)`; timing is `performance.now()` / the AudioContext
  clock.

## Named references

- Carhart-Harris et al., *The Entropic Brain* (2014).
- Carhart-Harris & Friston, *REBUS and the Anarchic Brain* (2019).

## Tags

- **input:** mic (real FFT / RMS + low-band alpha-analogue)
- **output:** WebGL2 fullscreen shader (+ consonant additive drone that decoheres)
- **technique:** self-organized-criticality / phase-transition field driven
  across its critical point
- **vibe:** visionary-INTENSE / ego-dissolution / entropic-brain
- **pole:** intense

## Honest limitations

- The order-parameter dynamics are a **mean-field caricature**, not a simulated
  lattice with a real diverging correlation length; the "scale-free" turbulence
  is 1/f fBm, which *looks* scale-free but is not measured to be. The physics is
  evocative, not rigorous.
- The mic "alpha-analogue" is a low audio band, not a real 8–12 Hz neural rhythm
  — a deliberate perceptual stand-in.
- The mapping from voice to criticality is tuned for a quiet room; very loud or
  very noisy environments may saturate the control parameter.
- Correlation length is rendered as a bloom rather than measured from the field,
  so the "divergence" is authored, not emergent.
