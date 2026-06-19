**For**: kids (4+)

# Bounce House

## The one question
What if a 4-year-old could bounce bright balls on a giant stretchy TRAMPOLINE —
and the trampoline itself SINGS, the sheet's wobble and each landing turning into
a warm, tuned drum-and-bell sound — a bouncy, joyful, sunny playspace, not a calm
meditation?

## How to play
- **Tap the sky** (anywhere above the trampoline) to drop a fat bouncy ball in a
  random bright color. It falls, sinks deep into the stretchy sheet, and bounces —
  over and over, slowly losing energy. Other balls' ripples can re-launch it.
- **Drag a finger across the trampoline** to pluck and stretch the sheet directly;
  a wobble travels outward and you hear a soft pluck.
- Every **landing sings**: the pitch depends on *where* the ball hits — the middle
  of the sheet is low and round, the edges are higher and brighter. Loud landings
  ring louder. Everything is locked to a **C major pentatonic**, so nothing is ever
  "wrong."
- Up to **10 balls** can pile up and bounce together, making a gentle, ever-changing
  polyrhythm of warm hits. When there are too many, the oldest one quietly shrinks
  and sinks away.
- A soft, always-on **pad (an open fifth)** hums underneath and brightens with the
  sheet's ripple, so the scene is never silent.
- **No reading needed.** One big "Play ▶" button starts the sound. If no one
  touches it for ~3 seconds, a friendly "ghost" auto-drops a ball every ~1.5s so you
  can see and hear it bounce and sing on its own; it stops the moment a child plays.

## What's novel
This is the **first structured cloth / trampoline membrane in this lab**. The
trampoline is not a faked sine wobble — it is a genuine **2D mass-spring / Verlet
soft-body cloth**:

- A **24×10 grid of point masses** connected by **structural springs** (horizontal +
  vertical) and **shear springs** (both diagonals), in the Provot tradition.
- Integrated with **Verlet integration** (position-based: each node stores its
  previous position; velocity is implicit) and **Jakobsen-style constraint
  relaxation** — a few relaxation passes per frame pull every spring back toward its
  rest length.
- The **outer frame is pinned** (the trampoline rim). Balls are circles under gravity
  that **collide with the cloth**: they push the nearest grid nodes down, the springs
  pull back, and the ball gets launched upward — a real, emergent bounce, not a
  scripted animation.
- **Sonification rides the same physics.** Each genuine downward contact produces an
  impact whose loudness comes from the ball's real impact velocity and whose pitch
  comes from its real landing position, fed to a **tuned membrane-drum / bell voice**
  (a round body sine + inharmonic modal partials + a soft skin thump). The pad's
  brightness tracks the average displacement of the cloth, so the soft-body's
  standing waves literally shape the drone.

The physics and the music are the same system: the cloth's behavior *is* the score.

## Kids-safe audio
Everything routes through a fixed chain: `master gain ≤ 0.3 → lowpass ≤ 7500 Hz →
DynamicsCompressor(threshold −10, ratio 20:1) → destination`. Soft attacks, no
clicks, no sudden/scary sounds, no fail states. AudioContext only starts behind the
big start-button gesture (iOS-safe); visuals run regardless.

## Named references
- **Thomas Jakobsen, "Advanced Character Physics" (GDC 2001)** — Verlet integration
  and Jakobsen-style constraint relaxation (the relaxation loop here).
- **Xavier Provot (1995)** — mass-spring cloth with structural + shear springs.
- **JellyCar Worlds / "Toolkit for Verlet Motion" (2026)** — the soft-body Verlet
  lineage this trampoline belongs to.
- **Membrane / modal percussion synthesis** — a tuned membrane drum (body tone +
  inharmonic partials + skin thump) as the sonic model for each landing.

## Tech notes
- `"use client"`, Next.js App Router. **Canvas2D only** (no WebGL/WebGPU/three.js).
- Web Audio API + Canvas2D + React only — no new dependencies, no API route, no
  network. SSR/prerender-safe: all browser access lives inside effects/handlers.
- Files: `page.tsx` (scene, input, render loop), `membrane.ts` (the Verlet cloth +
  ball collision sim, pure/no browser globals), `audio.ts` (kids-safe chain +
  membrane-drum sonification).

## Known limitations
- Verlet relaxation is run at a fixed 4 passes/frame, so on very low-end devices a
  hard pile-up of all 10 balls can let the cloth stretch a little before springing
  back; it self-corrects within a frame or two.
- Collision uses the nearest-node cluster rather than continuous swept contact, so an
  extremely fast ball could in theory tunnel; ball speed is tuned (and dt clamped) so
  this isn't reachable in normal play.
- The pad-from-ripple modulation is an averaged readout, not per-mode spectral
  analysis — it captures the *feel* of the standing wave, not its exact harmonics.
- Pitch maps to horizontal landing position (center→low, edges→high) only; vertical
  position does not change pitch.
