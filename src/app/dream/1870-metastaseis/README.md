# 1870 — Metastaseis

## The one question

What if a Xenakis ruled-surface building IS the musical score — you fly through
the architecture and hear its geometry?

## The mechanic (inverse Xenakis)

Iannis Xenakis composed _Metastaseis_ (1953–54) as fields of straight string
glissandi, then turned that same ruled geometry into the **Philips Pavilion**
(Brussels Expo 1958, with Le Corbusier; home of his and Varèse's _Poème
électronique_) — nine warped hyperbolic-paraboloid shells.

A hyperbolic paraboloid is a **ruled surface**: it is woven from two families of
perfectly straight lines. This piece follows **arXiv:2607.06589, "Extending
Xenakis" (July 6 2026)**, which inverts Xenakis's move — instead of turning
glissandi into a building, it turns the building's ruling lines back into sound:

- We reconstruct 3 hypar shells as their **straight ruling lines** (three.js
  `LineSegments`, additive blending), sampled by bilinearly interpolating
  between two skew edges. Both ruling families are drawn, so the warp reads as
  an architectural shell rather than a flat plane.
- A seeded **playhead** sweeps the `u` axis of each shell. Every ruling line it
  crosses **lights up** (a smooth comet trail, no strobe) and **sounds its
  glissando**: one oscillator glides between the pitches mapped from the line's
  two endpoint heights (height → frequency, quantized to a pentatonic scale).
- **Point-density → energy blocks**: steep lines, where projected ruling density
  spikes, additionally fire a pizzicato — the percussive clusters Xenakis drew
  from density in the original score.
- The camera flies a **seeded deterministic path** around and through the
  shells. Pointer drag orbits/nudges it; the nudge decays so the flight resumes.
- Two labelled sliders: **sweep speed** and **surface warp** (morphs the shells
  from near-flat plane to deep saddle, rebuilding geometry deterministically).

## Autonomous self-demo

Everything is driven by a fixed-seed `mulberry32(0x1870)` PRNG and a frame
counter — **no `Math.random`, `Date.now`, or `new Date`** anywhere, so the same
architecture is drawn and sung on every load. Visuals animate the instant the
page mounts. Because browsers gate audio behind a gesture, a single **Begin**
tap unlocks the `AudioContext` (1 s fade-in); from then on it self-runs with no
further input — a 06:30 phone glance is never blank or silent.

## Audio safety

All voices → bus → `DynamicsCompressor` → master gain ≤ 0.18. Glissandi are
low-pass filtered sawtooths constrained to a scale and a bounded range; voices
are capped and released. Reduced motion (`prefers-reduced-motion`) slows the
sweep and thins the voicing but keeps the piece alive.

## Degrades gracefully

If a WebGL context can't be created, an on-brand `text-destructive` notice
appears and the seeded glissando score still plays (the audio trigger loop runs
independently of the renderer). On unmount everything is torn down: the
animation frame is cancelled, listeners removed, three.js geometries/materials/
renderer disposed, and the `AudioContext` faded and closed.

## Files

- `page.tsx` — client component: three.js scene, seeded flight, playhead,
  controls, chrome.
- `surface.ts` — `mulberry32` PRNG, hypar shell + ruling-line construction,
  height→scale pitch mapping, camera path.
- `audio.ts` — Web Audio engine (glissando voices, pizzicato, compressor/master).
