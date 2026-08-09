# 8952 · Tensegrity

## The one question

**What if you could *play* a tensegrity — a floating-compression structure where
rigid struts touch nothing, suspended in a net of tension cables — by grabbing a
node and sculpting it, so the prestress redistributes through the ENTIRE
globally-coupled network and every cable retunes and rings at once?**

This is the first tensegrity in the dream lab. The magic of tensegrity is that
it is *self-stressed*: loosen one cable and the whole thing sags globally,
tighten one and everything tightens. This piece makes that audible — **each
cable's live tension is a plucked string (higher tension = higher pitch), so
dragging one node retunes the whole chord.**

## How to play it

- **Drag a glowing node.** The three top nodes float freely; the three base
  nodes are anchored. Pull a node and the structure resists and springs back —
  it is stable because it is prestressed.
- **Tap a node** to pluck it; **flick it** to fling and ring the retuned chord.
- **Drag empty space** to orbit the camera.
- **Begin** turns on sound (browsers gate audio until a gesture). Before that the
  piece self-demos, silently: a seeded breeze plucks the net within ~1s of load.

## The physics

A canonical **3-strut tensegrity prism** (a "T-prism"): 6 nodes, 3 rigid struts,
9 tension-only cables — the smallest unit of Snelson's floating-compression
structures. Integrated with **Verlet + constraint relaxation** (the cloth
family), ~8 relaxation passes per step:

- **Struts** are bidirectional distance constraints — they hold rest length
  exactly (rigid compression members). With the top triangle twisted ~150° they
  cross the interior *without touching*.
- **Cables** are **tension-only** constraints: if a cable is longer than its
  rest length it pulls its endpoints together; if shorter it does nothing. Cables
  never push. This one-sided rule is what makes the net self-equilibrate and sag
  globally when perturbed.
- Cable rest lengths are set shorter than their built length, so the assembly is
  **prestressed** and settles into a self-stressed equilibrium.
- **Live tension** per cable = `max(0, length − rest) × stiffness`. Tension maps
  to pitch (snapped to an equal-tempered minor pentatonic) and to cable
  thickness/glow in the render.

Because every node is shared by several cables, moving one node re-tensions the
entire network — the physical basis for "retune the whole chord by sculpting one
node".

## Sound

Web Audio API. Each pluck voices every cable incident to the grabbed node as a
**Karplus–Strong** plucked string (seeded noise burst → tuned delay + low-pass,
rendered offline into an `AudioBuffer`). Tuning is strictly **12-TET**, snapped
to a cool minor pentatonic — no just-intonation, no drone bed. A short bright
send lets the steel ring without becoming a pad.

## Render

Raw **WebGL2** with hand-written GLSL (no three.js). Real lit 3D geometry: struts
are thick shaded steel cylinders, node joints are faceted beads, cables are thin
tensioned tubes whose thickness and glow track live tension — **wire-white when
slack, copper/amber when taut**. Cool graphite/blueprint palette with one warm
tension accent. If WebGL2 is unavailable it degrades to a Canvas2D projection of
the same structure (identical physics + audio).

## Determinism

All randomness comes from a seeded **mulberry32** PRNG (seed `0x8952`) — initial
geometry jitter, the auto-breeze, and the Karplus noise bursts. No
`Math.random()` / `Date.now()` anywhere; timing uses `performance.now()` /
`AudioContext.currentTime`. Every load is identical.

## Named references

- **Kenneth Snelson**, *Needle Tower* (1968) — the floating-compression sculpture
  this models a single unit of.
- **Buckminster Fuller** — coined "tensegrity" (tensional integrity).
- **Force-density method** — H.-J. Schek, *The force density method for form
  finding and computation of general networks* (1974).
- **R. E. Skelton & M. C. de Oliveira**, *Tensegrity Systems* (2009) — dynamics
  of tensegrity structures.

## Honest limitations

- The model is a single 3-strut prism with a pinned base, so only three nodes are
  playable — it demonstrates global coupling but is not a tall multi-stage tower.
- Constraint relaxation is a position solver, not a true elastodynamic FEM; the
  "tension" is a geometric proxy, tuned for feel rather than physical accuracy.
- Karplus–Strong buffers are rendered per pluck on the main thread; a very dense
  flurry of plucks is voice-capped rather than mixed with a worklet.
- The tension→pitch snap is musical, not the literal `f ∝ sqrt(T/µ)` of a real
  string across its whole range.
