# 1116 · Gait Loom

**What if walking WAS the instrument** — if you held your phone, walked, and your
own footstep cadence set the tempo and phase of a slow Reich-style phasing raga,
while a mandala unfurled one petal per step?

A walking-meditation / embodied rhythmic-entrainment piece. The pole is
cosmic-ambient, warm, flow-trance. Your body is the clock.

## How it works

### Input — accelerometer / gait (DeviceMotion)

`gait.ts` listens to `window.addEventListener("devicemotion", …)` and reads
`accelerationIncludingGravity`. Per sample it:

1. computes the acceleration **magnitude** `√(x²+y²+z²)`;
2. removes gravity with a slow low-pass **baseline**, then high-passes the rest;
3. runs a small state machine — an **adaptive threshold** (scaled to recent
   motion energy) plus a **refractory window** (~250 ms) — to register the impact
   peak of each footfall.

Each detected step carries an **EMA-smoothed cadence** (steps/min) and a
normalized **intensity**. iOS gates the sensor behind
`DeviceMotionEvent.requestPermission()`, which must be called from a user
gesture, so the **Start walking** button doubles as the permission tap.

This is deliberately **not** a tap/pointer piece and **not** a mic piece — the
input is your gait.

### Phasing — Steve Reich process music, driven by your feet

`audio.ts` builds a Web Audio graph: two voices + a breathing drone bed →
master → `DynamicsCompressor` (limiter) → destination. Both voices play the
**same warm pentatonic cell**:

- **Voice A ("your steps")** advances exactly one note per detected footfall, so
  it is locked to your body's tempo.
- **Voice B ("the phasing voice")** runs on its own lookahead scheduler ~3%
  faster, so it slowly slides out of and back into alignment with Voice A — the
  *Piano Phase* process, but the metronome is your cadence.

Cross-modal mapping: **cadence → tempo**, **step intensity → brightness &
dynamics** (opens the low-pass filter and lifts the gain of each pluck).

### Output — SVG mandala

`page.tsx` renders an inline React `<svg>` (no Canvas, no WebGL — SVG is the
point). One **petal blooms per step**, filling rings outward; the whole mandala
rotates slowly. Two orbiting markers show **your locked voice** (deep rust) vs.
**the drifting phasing voice** (ochre), with a link whose opacity tracks how
phase-aligned they currently are. A live readout shows cadence, step/petal count,
phase alignment %, and whether the source is your steps or the simulator.

### Palette

Warm terracotta / earth / clay — rust, ochre and sand petals on a warm
off-white (`#f2e7d7`) background with dark clay ink. No black void, no neon.

## Degrading gracefully

Most desktops (and this headless build env) have no accelerometer. **Simulate
walking** runs a fully deterministic walker — a seeded `mulberry32` PRNG (never
`Math.random`) at ~108 steps/min with humanized jitter and a slow cadence
wander — so the piece is completely demoable with no sensor. **Start walking**
uses real steps and **auto-falls-back to the simulator** if no `devicemotion`
event arrives within ~2 s, with a clear on-screen notice. A manual **Simulate
walking** button is offered prominently too.

`prefers-reduced-motion` slows the mandala's spin and the phasing marker.

## References

- **Steve Reich**, *Piano Phase* and *Music for 18 Musicians* — phasing /
  process music; two identical parts drifting in and out of alignment.
- **Walking meditation** (Thich Nhat Hanh) — attention braided to the footstep.
- **Gait-sonification / rhythmic-entrainment research** — Audio Mostly 2024,
  "Making Movement Sonification Usable in Clinical Gait Rehabilitation"; and the
  central-pattern-generator line on gait↔music entrainment (cadence coupling).
  The meditative feel is what the *piece* creates; **no therapeutic benefit is
  claimed**.

## Honest verified-vs-not notes

- Type-checked (`tsc --noEmit`) and linted (`eslint`) clean within this folder.
- **Not** verified against a real accelerometer or real speakers — this build
  environment is headless with no motion sensor and no audio output. The
  simulate path is deterministic and is how the piece will first be seen.
- Step-detector thresholds are hand-tuned from the gait literature, not
  calibrated against recorded phone data; on-device tuning would likely be
  needed.

## Next-cycle deepening

Add a **gait-quality** dimension: estimate stride regularity (variance of
step intervals) and left/right asymmetry, then let *steadiness* — not just
tempo — shape the music: a smooth, even walk lets Voice B drift luxuriously far
before resolving, while an irregular walk pulls the two voices back toward unison
and darkens the drone, so the mandala visibly "listens" to how you move.
