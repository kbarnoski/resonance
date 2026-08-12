# 10712 · Thresholdway

## The one question

**What if you could DESCEND a long-form near-death passage — an endless tunnel
toward a light — by HOLDING a single "surrender" gesture, leaving the words you
type hanging in the tunnel behind you as a re-readable transcript, while the
piece moves through phenomenological phases so it is genuinely different at
minute 5 than at minute 1?**

## How to use it

- **Press and HOLD anywhere** (mouse / touch) = *surrender*. The descent
  accelerates, the rings rush faster, the Shepard fall lifts, and you fall
  toward the light. **Release** = you slow and drift.
- **Type** to pin a luminous **word** to the ring near you. As you descend it
  recedes into the dark behind you — the words you wrote hang in the tunnel as
  a re-readable transcript (last ~24 kept).
  - **Space** — start a new word cluster.
  - **Enter** — a brighter *surge* (slew-limited, never a flash).
  - **Backspace** — pull gently back up the tunnel.
- **Begin sound** starts audio (deferred until your tap — browser autoplay
  policy). Everything is ear-safe: routed through the shared safety master.
- Do nothing and a **seeded auto-performer** descends on its own within ~1 s,
  holding/releasing surrender and auto-typing a calm phrase — so a **muted phone
  with nothing granted still sees the whole passage.** Real input takes over;
  the performer resumes after ~8 s idle. Badged `auto — press and hold to
  descend`.

## The five phases (driven by an internal depth accumulator)

1. **Dissolution** — dim; the room's edges soften (vignette blooms in).
2. **The tunnel** — rings tighten, speed builds, the light appears far ahead.
3. **Approaching the light** — the far disc grows, brightness climbs.
4. **The clear light / ganzfeld** — a full-field luminance bloom eases in over
   ~3–4 s (smootherstep — a **slow drift, well under 3 Hz, never a flash**),
   then eases back over ~4 s.
5. **Boundless void / return** — the field opens, calm; the cycle can begin
   again.

Phases are continuous: params are interpolated across `phasePos ∈ [0,5)` and the
whole passage loops as descent depth accumulates, so minute 5 ≠ minute 1.

## Substrate & audio

- **Pure CSS 3D perspective — no canvas, no WebGL, no SVG.** A
  `perspective: 700px` container wraps a `preserve-3d` scene of 36 concentric
  ring `<div>`s at stepped `translateZ`. One `travel` accumulator rushes the
  rings toward and past the camera; a ring that passes the near plane wraps back
  to the far end → an endless corridor. The light is a soft radial-gradient disc
  deep at `translateZ: -3300px`. Every mark is a positioned `<div>` /
  `<span>` with `radial-gradient` backgrounds, `filter: blur()` and
  `mix-blend-mode: screen`.
- **Shepard–Risset falling endless glissando** as the descent drone —
  `startShepard(ctx, master.input, { dir: -1 })`, driven by
  `engine.setDrive()` from descent speed and `engine.step(dt)` each frame.
- **Inharmonic struck bell** on each ring passed (partials `1 : 2.76 : 5.40 :
  8.93`, envelopes ≤ 0.45 s, rate-limited). No sustained pitched bed beyond the
  Shepard drone.
- Everything is routed through `createSafeMaster(ctx)`; nothing connects to
  `ctx.destination` directly. Full teardown on unmount: cancel rAF, remove
  listeners, `engine.stop()`, `master.disconnect()`, `ctx.close()`.

## Safety

Every whole-field luminance value (the ganzfeld bloom, the far light, the
vignette) is **slew-limited** in the loop to at most full-range over ~3 s
(≈ 0.33/s ≪ 3 Hz) and eased with smootherstep. No ring strobes; no flash. This
is non-negotiable (photosensitive-epilepsy risk).

Determinism: seeded with `mulberry32(0x10712)`; time from `performance.now()`.
No `Math.random`, `Date.now`, or `new Date()` anywhere in executable code.

## Named references

- **James Turrell — *Ganzfeld* / *As Seen Below* (ARoS Aarhus, 2026)** — the
  full-field luminance dissolution of edges and depth cues.
- **Roger Shepard (1964) / Jean-Claude Risset — the endless glissando** — the
  auditory barber-pole, run downward (`dir: -1`) as the plunge.
- **NDE tunnel phenomenology** — the corridor toward a growing light.

## Tag line

`input: pointer+keyboard · output: CSS-3D-perspective · technique: phased
near-death descent + Shepard fall + ganzfeld bloom + tunnel-transcript memory ·
palette: cosmic-void → clear-white`

## Cycle-2 deepening

- **Breath-paced descent** — sense the phone's motion / a mic breath envelope so
  the surrender rides the inhale/exhale rather than a held press, and the phase
  cadence locks to breath.
- **Karel's real *Path* piano as carrier wave** — layer the recorded solo-piano
  loop (as in `1300-carrier-bloom`) beneath the Shepard fall so the drone has a
  human carrier, the bells answering its phrases.
- **A look-back, re-readable transcript** — let release + a slow scroll drift the
  camera *back up* the tunnel to re-read the words you left, turning the passage
  into a returnable memory rather than a one-way plunge.
