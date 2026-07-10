# 1428 · The Dissolve

A long-form, irreversible ego-dissolution / NDE-tunnel **room you cannot leave**,
built entirely from DOM + CSS 3D — no canvas, no WebGL, no SVG, no GPU dependency.

## What it is

343 real `<div>` cells form a 7×7×7 glowing lattice inside a `preserve-3d` stage.
Over roughly five minutes the lattice **loosens**, cells push radially outward to
open a central **tunnel**, detaching panels tumble and dim, and the whole room
drifts toward a far **light**. It is not a loop: a single monotonic clock only
ever rises, so minute 5 is genuinely different from minute 1. Once it reaches the
light it holds there — a calm sustained void. You don't play notes; you play the
arc.

Phases (shown in the readout): **forming → loosening → dissolving → light.**

## How to use it

- **Begin the descent** — one tap gesture-gates the AudioContext (browsers require
  it) and ramps audio up from silence. Before Begin you see the still,
  gently-alive "formed lattice" preview (visuals live, silent).
- **Lean / hold to resist.** On a phone, **tilt** the device to steer and lean in;
  **press-and-hold** anywhere to pull back toward a more-formed lattice. On desktop
  (no device orientation) it falls back to **mouse-drag to steer** and
  **press-and-hold to resist** — the UI says so in readable text.
- Resisting recovers only the *look and tuning* toward "more formed". The
  underlying clock keeps marching. **You resist the dissolve; you never reverse it.**
- **Drift-speed slider (0.40×–2.20×)** fast-forwards or slows the ~5-minute arc for
  a morning review.
- Do nothing and the dissolution proceeds on its own — idle *is* the demo.

## The design idea

### Long-form, irreversible, accumulating
One `progress` accumulator integrates `driftSpeed / 300s` per frame and never
falls. Cell spacing widens, a growing clear-radius opens the tunnel mouth, and a
camera push drifts toward the light — all keyed off that single clock. This is the
opposite of the lab's usual reset-on-release loops.

### The tuning is the point
The lab has a monoculture of always-consonant pentatonic / just-intonation tuning.
This piece is the antidote: it is **inharmonic, and it drifts *further* out of tune
as it dissolves.**

- **Risset-style inharmonic bell partials** — `[0.5, 1.0, 1.19, 1.56, 2.02, 2.55,
  3.06] × 55 Hz`, none a small-integer ratio, so they beat faintly even at rest.
- A **Railsback octave-stretch**: every partial ratio is raised to an exponent
  that grows `1.00 → ~1.06` as the room dissolves, dragging the partials
  progressively sharp of any consonance.
- A **chorus detune** that widens from a few cents to tens of cents.
- A high inharmonic **light cluster** shimmers in during the light phase.
- Everything routes through the shared **void reverb**, then a master gain that
  ramps from silence to ≤ 0.18, then a **DynamicsCompressor** limiter, then the
  destination. Deterministic — no `Math.random` in the audio path.

## Safety

All motion is sub-Hz and slow; there is no strobe or fast flicker. If the OS asks
for **reduced motion**, the arc freezes to a formed-but-gently-alive lattice — no
accumulating dissolve, no brightness pulsing. On unmount the RAF is cancelled,
every oscillator stops, the input listeners are removed, and the AudioContext is
closed.

## Next-cycle deepening (from the DEEP twin `1432-egress`, banked)

This shipped as the DOM/CSS-3D approach of a DEEP cycle whose other approach was a
three.js **volumetric** room (`1432-egress`, banked to IDEAS). The strongest ideas
to graft when this piece gets a cycle-2, borrowed from that twin:

- A genuine **additive-bloom light** — layered additive glow sprites + a warming
  emissive core that grows with `progress`, with `FogExp2` thinning toward the
  center — reads more as "dying *into* light" than the current CSS radial-gradient
  bloom.
- **Instanced volumetric cells** in real depth (an `InstancedMesh` room shell) so
  the tunnel opens in true 3-D rather than screen-projected CSS-3D — at the cost of
  the current zero-GPU render robustness, so keep this DOM version as the safe
  fallback.

## References

- **Susan Blackmore, *Dying to Live* (1993)** — the NDE tunnel/dissolution
  experience and its neural, rather than metaphysical, origin.
- **Jean-Claude Risset** — the inharmonic bell partials whose non-integer ratios
  make a struck-metal timbre out of pure oscillators.
- The **DMT-models-NDE** finding: the tunnel → void → light sequence is a
  *universal, brain-generated scaffold*; only the personal content that decorates
  it varies from person to person. This piece renders the scaffold as a fixed
  journey you personalize by how hard you lean in.
