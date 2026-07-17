# 1856 · Murmuration

**The one question:** What if you conduct a living murmuration of sound — a
flock of birds where each bird is a voice — just by moving in front of your
camera?

## The mechanic

- **Input — optical flow (no mic, no keyboard, no model).** The camera frame is
  drawn, mirrored, to a 64×48 offscreen canvas. Comparing each frame to the last
  (pure Canvas pixel ops — no MediaPipe, no downloads) yields a motion field,
  from which three global signals are read: **total motion energy**, the
  **motion centroid (x, y)**, and a **dominant direction**.
- **Flock — Boids.** ~260 boids run classic Reynolds separation / alignment /
  cohesion over typed arrays. The motion centroid becomes a **moving attractor**
  the flock is herded toward (with a swirl term so it wheels rather than
  collapses); motion energy scales flock speed and agitation.
- **The flock IS the music.** The flock is split into four x-position clusters,
  one voice each: **centroid height → pentatonic pitch** (always consonant),
  **cluster coherence → filter cutoff / timbre**, **cluster x → stereo pan**.
  The headline mapping is **total motion energy → tempo & density**: a still
  body gives sparse, slow, quiet notes; big gestures give a dense, bright,
  louder swell. Everything runs through a `DynamicsCompressor` into a master
  gain ≤ 0.18 with a ~1 s fade-in and gentle attack/release — no clicks.
- **Render — WebGL2.** Additive round points along a violet ramp, coloured by
  cluster and flared by speed, over a faint per-frame fade so the murmuration
  trails into flowing ribbons.

## How to use it

It is **already alive and sounding on load** under a deterministic synthetic
conductor (a smooth Lissajous path + breathing energy sine) — no permission
needed. Press **Conduct with camera**, allow the camera, then move: sweep a hand
slowly for a calm swell, or dance for a dense, bright swarm. If the camera is
denied or unavailable, an on-brand notice appears and the self-demo keeps
running. If the browser blocks audio autoplay, a single **Tap to begin**
affordance resumes it.

## Named references

- **Craig Reynolds, _Boids_ (1987)** — flocking as separation / alignment /
  cohesion; the basis of the simulation.
- **Starling murmurations** — the natural phenomenon: thousands of birds moving
  as one fluid body.
- **Mermerci et al., _Real-Time Control of a Virtual Orchestra by Recognition of
  Conducting Gestures_ (arXiv 2604.27957, 2026-04-30)** — a KTH dome
  installation where visitors conduct an orchestra via vision-based body
  tracking. Its key finding drives the headline mapping here: the robust
  real-time channel a conductor commands is **temporal** — energy, tempo, when
  the beat lands — delivered by the whole moving body.

## Self-assessment

Honest read: the self-demo reads as genuinely alive — the Lissajous conductor
keeps the flock wheeling and the four sections keep a consonant, shifting
pentatonic texture going, so the page is never blank and never silent. The
energy→tempo mapping is the clearest and most legible link (still vs. dancing is
immediately audible); pitch-from-height and pan-from-x are subtler and can blur
when the flock is well-mixed across all four x-bands, which is the main
musical-legibility risk. Optical flow is deliberately coarse — it captures
*where* and *how much* you move reliably, but the dominant-direction signal is
approximate; that is an acceptable trade for a model-free, zero-download,
robust-on-a-phone input.

## Constraints honoured

- Deterministic only: `mulberry32(0x1856)` seeds the flock. No `Math.random`, no
  `Date.now` / `new Date`; `performance.now()` for timing only.
- No new npm deps — Web Audio + WebGL2 + Canvas only. No API route.
- Self-contained in this folder; imports only `PrototypeNav` from `_shared`.
- Handles no-WebGL2 (keeps audio) and reduced-motion (drops trails, stays
  alive); cleans up rAF, AudioContext, and the camera MediaStream on unmount.
