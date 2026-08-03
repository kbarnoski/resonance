# 5864 · Overture — a cinematic generative journey

## The one question

**What if a Resonance session were a 6-minute generative journey with a genuine
CINEMATIC dramatic arc — setup → inciting incident → rising action → climax →
resolution — driven by a real, quantitative MUSICAL-TENSION model, so minute 5
feels earned by minute 1?**

This is the **cinematic / narrative-film** dramaturgy of three sibling
explorations of the same idea. Its shape is Freytag's pyramid: a single tall
climax with a long asymmetric build and a graceful fall.

## How it works

### The arc (`arc.ts`)

Gustav Freytag's pyramid (1863) is encoded as a control-point curve
`targetTension(pos) ∈ [0,1]` over the normalised journey `pos ∈ [0,1]`:

- **Exposition** (0–0.13) — near-flat calm, tension ≈ 0.1.
- **Inciting incident** (0.13) — a discrete step up in tension and a forced
  bright harmonic event (the subtonic VII lift).
- **Rising action** (0.13–0.66) — a stepped, faintly rippling climb.
- **Climax** (0.66–0.76) — a single tall peak (~0.99).
- **Falling action** (0.76–0.90) — the pressure releases.
- **Dénouement** (0.90–1.0) — resolves onto a *transformed* tonic (a bright
  A-major add9 / Picardy third), settling slightly above absolute zero.

### The tension model (`tension.ts`)

A hand-rolled version of **Morwaread Farbood, "A Parametric, Temporal Model of
Musical Tension" (Music Perception, 2012)**. Tension is a weighted blend of five
parameters — LOUDNESS, PITCH HEIGHT (register), HARMONIC TENSION, ONSET DENSITY
and TEMPO (weights sum to 1; harmony is weighted highest).

The model runs **both ways**, which is the whole point:

- **Inverse** — `computeParams(pos)` reads the Freytag target and chooses the
  register, dynamics, density and tempo needed to hit it; `chordForSlot` picks
  a chord whose intrinsic harmonic tension matches the demand. The dramaturgy
  drives the notes.
- **Forward** — `realizedTension(params, chordWeight)` reads the *actually
  chosen* parameters back into a scalar. Because harmony is quantised to a
  small chord vocabulary, this "live" tension wobbles around the smooth target
  — you can see and hear the gap.

Harmony is a functional-ish vocabulary in a warm modal A, from tonic add9
(weight 0.08) through the dominant family to an altered dominant and a ♭II
cluster (0.95), plus the transformed-tonic resolution.

### The ensemble (`synth.ts`)

A lookahead scheduler advances a real-time journey clock and, at each beat,
uses the inverse model to render a small synthesised ensemble (no samples):

- **felt-piano** — a 2-operator FM voice with a soft attack; onset probability
  and arpeggiation follow onset density, pitch follows register, velocity
  follows loudness, with high sparkle notes at the climax.
- **string pad** — detuned saws through a lowpass that opens with tension;
  swells once per chord.
- **bass / cello** — a low triangle+sub root per chord.
- **percussion** — a soft filtered-noise tick that only enters once tension
  passes ~0.34 (the rising action) and grows with density.

Everything runs through a compressor and a deterministically-generated
convolution reverb. The journey loops (restarting from the exposition) so the
gallery piece self-plays forever, but each pass is a full through-composed
shape, not a bar loop.

### The visual (`render.ts`, raw WebGL2)

Hand-written GLSL, no three.js. The whole arc is drawn as a legible tension
**landscape**: a horizontal timeline whose height is the target tension, with
the realised live tension riding on top in a warm-shifting colour, the five act
regions divided, the inciting incident marked, and a bright playhead + glowing
bead at the current position. Behind it, a field of ~1400 instanced glowing
marks accretes — denser, higher and warmer where tension is greater. It is a
*representation of a discrete dramaturgical state*, not a simulated continuous
field (no fluid / PDE / drag-on-a-field). Colour drifts cool violet → warm gold
with tension; all motion is slow (well under 3 Hz — no strobe).

`canvas2d.ts` is a graceful fallback (timeline + curves + playhead) when WebGL2
is unavailable; audio is unaffected.

## References

- **Gustav Freytag, *Die Technik des Dramas* (1863)** — the five-part dramatic
  pyramid.
- **Morwaread Farbood, "A Parametric, Temporal Model of Musical Tension",
  *Music Perception* 29(4), 2012** — tension as a weighted temporal blend of
  loudness, pitch height, harmony, onset density and tempo.
- Film-scoring dramaturgy (Claudia Gorbman; classical Hollywood underscore) —
  flavour for the "luminous swelling climax, never a jump-scare" aesthetic.

## Controls

- **Begin the journey** — one tap starts the seeded, self-playing arc (audio
  needs a gesture; the landscape is drawn immediately so it reads while silent).
- **Play / Pause**.
- **Drag or tap the timeline** anywhere to seek — sample the climax without
  waiting five minutes.
- **New journey** — re-seeds a fresh deterministic render.
- **Design notes** — opens an in-page summary.

Live readout: current act, live tension % / target %, tempo (bpm), current
chord, and a sentence describing what the music is doing.

## Determinism

All randomness flows through a mulberry32 RNG (`rng.ts`) seeded by the journey
seed. No `Math.random` / `Date.now` / `new Date` in logic; `performance.now()`
is used only for animation timing. Re-seeding is a deterministic hash step, and
seeking is reproducible (per-position RNG).

## Known rough edges

- On a seek, up to ~120 ms of already-scheduled audio and any ringing pad/bass
  tail from the previous chord can briefly overlap the new position before the
  next swell takes over.
- The realised-vs-target gap is driven mainly by harmonic quantisation; the
  other four parameters track the target smoothly by construction, so the
  "live" curve mostly hugs the target rather than diverging dramatically.
- The internal clock is real-time over the full 6 minutes; there is no
  time-compression toggle (use the scrub to jump).
- Particle density is fixed at 1400 marks — fine on phones, but not adaptive to
  very low-end GPUs.
