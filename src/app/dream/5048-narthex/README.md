# 5048 — Narthex

*A narthex is the threshold hall of a church — the space you cross before the
sanctuary. This one is a near-death threshold you inhabit.*

## The one question

**What if a room could be a place you cross, not a screen you watch?** — a
cosmic-ambient near-death "threshold" you inhabit, where a choir of drone-voices
is HRTF-spatialised in a full sphere around your head, and you cross from a
scattered dark void into a warm unison light by **turning your head and drawing
forward**.

## The HRTF choir + head-tracked listener (the star)

Eight sustained drone-voices — each two detuned oscillators (sine, with the two
top voices on triangle) plus a breath of band-passed noise on the lower half —
are each **fixed at a point on a sphere** around the listener: a ring of six at
head height, one directly overhead, one behind and below. Every voice runs
through its own `PannerNode` with `panningModel: "HRTF"`, so it truly occupies a
place in 3-D space rather than a pan position in a stereo field.

A **head-tracked `AudioListener`** is driven by the head-look orientation: its
`forwardX/Y/Z` and `upX/Y/Z` are recomputed each frame from yaw/pitch (with the
deprecated `setOrientation` as a fallback for older Safari). Turning your head
rotates the entire sound-field around you — you move *among* the voices. This is
a synthetic homage to **Janet Cardiff's _The Forty Part Motet_**, a room of
forty individually-placed voices you physically walk between.

## The void → tunnel → light state machine

A single scalar — **distance-to-light** (0 = void … 1 = arrived) — drives every
subsystem:

- **Convolution reverb.** A procedurally-synthesised impulse response (long,
  dark, low-passed exponential decay — a cathedral tail, *no external IR file*)
  is wet and vast in the void and pulls back toward the direct, present light.
- **Master low-pass.** Muffled (~320 Hz) in the void, opening bright (~6.5 kHz)
  as you arrive.
- **Voice convergence.** In the void each voice sits at a scattered, detuned
  microtonal pitch and its two oscillators beat widely; as distance → 1 the
  pitches slew toward a **single luminous unison chord** (an open D voicing,
  D A D F♯ A D · A · D) and the detune narrows to a gentle chorus.
- **Visuals** (Canvas2D projected-3-D). A starfield drifts scattered in the
  dark; as distance rises the points rush forward and streak into a radial
  tunnel converging on the vanishing point, where a warm violet-white light
  blooms and grows. Head-look pans the whole field (turn left → field swings
  right). The full arc reads from the visuals alone — for a phone review with
  no headphones. Motion and slow luminance drift only: **no strobe, no flicker.**

Everything passes a final `DynamicsCompressor` limiter; nothing clips; the
entrance is a slow fade-in.

## Input & the hands-free auto-demo

Head-look comes from `deviceorientation` (iOS permission requested on Enter)
with a **pointer-drag fallback that always works on desktop**. In manual mode
you aim your look at the light to be drawn forward, and drift back toward the
void if you turn away. If you never touch it, a **seeded scripted descent**
plays the full void → tunnel → light journey hands-free in ~13 s, slowly
sweeping the head-look. Any real input takes the helm.

All randomness is a seeded **`mulberry32(0x5048)`** PRNG — no `Math.random`, no
`Date.now`, no `new Date`. Timing uses `performance.now()`.

## Fresh research

This piece draws on **arXiv:2607.23293 "PathRIR" (28 Jul 2026)** — fast
room-impulse-response simulation for a *moving listener*: a room whose acoustic
signature you inhabit and carry with you as you cross it, exactly the sensation
this threshold reaches for.

## References

- **Janet Cardiff, _The Forty Part Motet_** — spatial choir installation; a room
  of individually-placed voices you move among.
- **Susan Blackmore, _Dying to Live_** — the near-death tunnel-to-light
  phenomenology this crossing dramatises.
- **arXiv:2607.23293 "PathRIR" (28 Jul 2026)** — moving-listener room-impulse-
  response simulation (the fresh research above).

## Ambition floor

Four subsystems (HRTF spatial choir · head-tracked `AudioListener` · procedural
convolution reverb · void→tunnel→light state machine) + three named references +
fresh 2026 research.

## Next-cycle deepening (from the DEEP fan's runners-up)

This shipped as the winner of a 3-approach DEEP fan (cycle 985). The two banked
siblings point the way to deepen it:

- **Make the room's *acoustics* re-render as you move, not just the voices**
  (from `5064-cupola`): replace the single fixed convolution reverb with a
  moving-listener early-reflection model — a small bank of image-source taps
  (delay = path/343, gain = 1/r, air-absorption low-pass) recomputed as
  distance-to-light rises, so the space audibly opens boxy → vast → infinite
  bright. This is the literal PathRIR (arXiv:2607.23293) mechanic.
- **Let the room sense you're there** (from `5080-antechamber`): add an optional
  raw-optical-flow presence input (no ML) so leaning toward the camera draws you
  forward through the threshold — turning the piece into a true installation
  room that responds to physical presence.
