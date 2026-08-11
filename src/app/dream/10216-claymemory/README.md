# 10216 · Clay Memory

## The one question

**What if the clay REMEMBERED your hands?** You reach into the webcam and knead a
glowing lump of warm clay — and every dent, pinch, and pull is **permanent**. The
clay does not spring back. It plastically holds the shape you sculpt, so the piece
is a record of everything you did to it.

This is the **plastic-clay** approach. Real clay is plastic, not elastic: it holds
the shape you push it into. This build encodes that literally — the *rest shape*
itself changes as you sculpt.

## The technique — shape matching with a plasticity threshold

The lump is a **meshless soft body** built on **region-based shape matching**
(Müller, Heidelberger, Teschner & Gross, _Meshless Deformations Based on Shape
Matching_, SIGGRAPH 2005), extended with an **XPBD-flavoured plasticity threshold**
(Macklin, Müller, Chentanez, _XPBD: Position-Based Simulation of Compliant
Constrained Dynamics_, 2016).

- A `THREE.IcosahedronGeometry(1.2, 3)` (~3840 verts) is **de-duped** into ~642
  particles, each with a current position `x` and a **rest position `x0`**. A
  vertex→particle map writes the solved particles back to the geometry each frame.
- Particles are grouped into **overlapping cubic clusters** (a 3×3×3 grid plus a
  margin, so regions overlap for continuity). Empty/tiny cells are dropped.
- **Per frame, per cluster:** compute the current centre of mass `cm` and rest
  centre of mass `cm0`, build the moment matrix `A = Σ (xᵢ − cm)(x0ᵢ − cm0)ᵀ`, and
  extract the best-fit **rotation R** by iterative **polar decomposition**
  (`R ← ½(R + R⁻ᵀ)`, ~16 iterations, guarded against singular/reflecting inputs →
  identity). The elastic **goal** for a particle is `gᵢ = R·(x0ᵢ − cm0) + cm`,
  averaged over every cluster containing it. A stiffness term pulls `x → g`.
- **PLASTICITY — the differentiator.** When a particle's deviation from its goal
  exceeds a **yield threshold**, its **rest position `x0` permanently creeps**
  toward the deformed state (mapped world→rest via the global `Rᵀ`), bounded by a
  max plastic radius. Because the rest shape moves, the elastic goal moves with it:
  **the dent becomes the new home.** Gentle touches stay elastic and spring back;
  firm kneading past yield is permanent. That is the clay's memory.

The solver is guarded end-to-end (zero-mass clusters, degenerate/reflecting moment
matrices, non-finite velocities → safe fallbacks) so the mesh can never NaN.

### Why this makes the clay "remember"

An elastic soft body stores its rest shape as a constant and always returns to it.
Here the rest shape is **mutable state** that integrates the deformation history.
Nothing restores it — there is no healing term — so the geometry accumulates every
past interaction. The only way back to a sphere is the **Fresh lump** button.

## Input degrade ladder

1. **MediaPipe HandLandmarker** (opt-in "Enable camera"). Runtime CDN import of
   `@mediapipe/tasks-vision@0.10.14`, float16 `hand_landmarker.task`, `numHands: 2`,
   `runningMode: "VIDEO"`, `delegate: "GPU"`. Palm = landmark 9 (dents inward);
   pinch = thumb-tip(4)↔index-tip(8) distance below threshold (pulls a peak). Every
   CDN/WASM/WebGL call is wrapped — it degrades, never throws. SSR-safe.
2. **Pointer drag** — one hand: drag to press, hold roughly still (dwell) to pinch.
3. **Frame-diff blob** — a single bright-motion centroid if MediaPipe can't load
   but a camera opened; hold still to pinch.
4. **Seeded ghost sculptor** — a deterministic `mulberry32(0x10216)` PRNG drives
   two phantom hands that knead the lump from frame one, accumulate an evolving
   form, and **wipe it to a fresh lump on their own loop**. Because the clay is
   plastic, a muted phone sees shape accumulate and then start fresh — the memory
   is legible with zero input. Audio waits for the first user gesture (autoplay).

## Audio mapping (inharmonic, non-just-intonation)

Everything routes into the shared safe master (`createSafeMaster(ctx, { gain: 0.16 })`).
No microphone is opened — the camera is the input.

- **Struck-bar drone** at **free–free bar mode ratios `1 : 2.76 : 5.40`** (genuinely
  inharmonic — the modes of a free bar, not a harmonic series or JI), root ~110 Hz.
  As accumulated **plastic deformation** grows, a lowpass closes (1400 → ~350 Hz)
  and the root sags — the more you've sculpted, the darker the tone, so the drone
  is a record of the shape.
- **Strain-driven granular squelch** — fast particle motion fires short
  band-passed noise "wet clay" grains (capped at 20 voices). A low **"thup"**
  (150 → 52 Hz sine drop + noise burst) fires when a region crosses yield: the
  satisfying "it took the shape" cue.

## Named references

- **MediaPipe Hands** — Zhang, Bazarevsky, et al., Google 2020.
- **Meshless Deformations Based on Shape Matching** — Müller, Heidelberger,
  Teschner & Gross, SIGGRAPH 2005 (the shape-matching solver and its plasticity
  extension).
- **XPBD: Position-Based Simulation of Compliant Constrained Dynamics** — Macklin,
  Müller & Chentanez, 2016 (the constraint / plastic-flow framing).

## Files

- `page.tsx` — imperative three.js scene, RAF loop, mode selection, UI chrome.
- `clay.ts` — the shape-matching + plasticity soft-body solver.
- `audio.ts` — inharmonic struck-bar drone + strain-driven granular squelch.
- `hands.ts` — the four-tier input ladder (MediaPipe loader, frame-diff, ghost).
- `rng.ts` — `mulberry32` seeded on `0x10216`.
