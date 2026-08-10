# 9560 · Handflux

## The one question

**What if your two hands could STIR a boundless river of light — tens of
thousands of particles flowing on the GPU — and the way they flow near your
hands is what you HEAR?**

Same soul as a hand-conducted field, but the field here is a **WebGPU compute
particle flow-field**, not a fragment shader. Your hands are curl/attractor
nodes that stir a living current of ~48k luminous particles, and the aggregate
particle motion near the hands drives an ambient synth. Meditative when still,
ecstatic when you stir it fast.

## The field — WebGPU compute particles

- ~48,000 particles live in a GPU storage buffer as `(pos.xy, vel.xy)`, positions
  in normalized image space `[0,1]×[0,1]`.
- A **compute pass** advects every particle each frame. Base motion is a
  slowly-evolving **2-D curl-noise** flow (divergence-free → a boundless swirling
  "river of light" that drifts forever). The curl of a scalar potential gives a
  flow with no sources or sinks, so nothing piles up or drains — it just streams.
- Each detected hand injects a local force: a **curl vortex** (tangential swirl)
  plus a gentle inward pull, so the hands *stir* the current — particles swirl
  toward and around them.
- A **render pass** draws each particle as an additive glowing point-sprite quad,
  coloured by speed: deep **indigo → violet → orchid → pale-gold**. Additive
  blending gives the bloom.
- Slow evolution, no strobe. Under `prefers-reduced-motion` the flow is calmed to
  a near-still gentle drift (forces ×0.12, heavier damping).

### Pinch → burst
A pinch (thumb-tip to index-tip distance below threshold) injects an outward
radial impulse at the pinch point — particles fountain out — **and** plucks an
audio voice.

### The §1083 deepening — velocity / strike
Each hand's inter-frame landmark speed is smoothed with an exponential moving
average (α = 0.3). That smoothed speed is the **stir force**: fast hand motion →
stronger vortex + the whole field surges brighter (global energy → render
brightness and flow strength). A **fast downward sweep** (smoothed downward
velocity + overall speed both over threshold) drags a stronger downward current
through the river **and** fires an **accent**: a louder, brighter transient.
Gentle = quiet, fast strike = boom — mirroring barefootdesigner's *Ripple Forge*
velocity mapping.

## Audio — flow drives the sound

Routed through the shared ear-safety master (`createSafeMaster(ctx, { gain: 0.18 })`)
— no hand-rolled limiter. The synth is driven by the flow near the hands, not
just static positions:

| Gesture / flow | Sound |
| --- | --- |
| hand height | register / root note (2-octave minor pentatonic) |
| flow speed near a hand (stir rate) | voice swell + shimmer depth |
| two-hand distance | reverb wet depth + brightness |
| particle density near hands | lowpass filter cutoff |
| pinch | plucked note (with the burst) |
| fast downward sweep | accent — louder, brighter transient |

Additive harmonic + shimmer bed with a slow cosmic attack; plucks and accents are
faster. Never autoplay — the AudioContext is created and resumed only after the
user taps **Start conducting**.

## Fallback chain (never a blank/broken screen)

1. **No WebGPU** (`!navigator.gpu` or device request fails) → a **Canvas2D** CPU
   particle field (`canvas2d.ts`, ~2,600 particles) running the same curl-flow +
   hand-vortex + burst forces, drawn as additive radial glow dots over a soft
   luminous fade. Shows "WebGPU unavailable — Canvas2D fallback".
2. **No camera** (permission denied / no `getUserMedia` / model fails to load) →
   a **seeded two-synthetic-hands auto-demo**: two virtual hands drift on smooth
   Lissajous orbits (phases derived from the seed) and stir the current
   themselves, so a muted phone with no camera permission always sees the art
   flowing and hears sound. Shows "Camera … — the seeded demo keeps conducting".
3. **Reduced motion** → the river is calmed to a near-still drift.

All motion-loop randomness is a seeded mulberry32 PRNG (`rng.ts`) — no
`Math.random()` / `Date.now()` in the render/update loop. The initial particle
layout and the demo-hand phases are both seeded deterministically.

## Hand tracking

`handLoader.ts` is copied verbatim from `1590-body-mirror`: a two-hand VIDEO-mode
MediaPipe Tasks-Vision `HandLandmarker`, loaded from a CDN at runtime with
`/* webpackIgnore: true */` (no package.json change). The video is mirrored
(selfie view). Landmark indices used: 0 = wrist, 4 = thumb tip, 8 = index tip,
9 = middle-finger MCP (palm centre = midpoint of 0 and 9). Pinch = `dist(4, 8)`
below threshold. Any failure degrades to the seeded auto-demo.

## References

- **barefootdesigner — "Ripple Forge" velocity mapping** (March 2026): gesture
  *speed* as an expressive axis — gentle contact is quiet, a fast strike booms.
  Adopted here as the velocity/strike deepening (stir force + downward-sweep
  accent).
- **WJARR 2026-0860** — MediaPipe hand landmarks driving a TouchDesigner-style
  reactive field: camera hands as continuous controllers for a generative visual.
- **MediaPipe Hands** (Google) — the 21-landmark hand model behind the tracker.
- **Robert Bridson — "Curl-Noise for Procedural Fluid Flow"** (SIGGRAPH 2007):
  advecting particles along the curl of a noise potential for divergence-free,
  fluid-looking flow — the boundless-river base motion.

## Next-cycle deepening

This is a claimed multi-cycle build.

- **Cycle 2** — per-finger vortices (each fingertip its own micro-vortex with its
  own sign) and a both-hands *duet*: when the two hands close, their vortices
  couple into a shared braided current with a harmonized voice pair.
- **Cycle 3** — record/replay a **gesture-score**: capture a stretch of stirring
  as a deterministic track and let the field re-perform it (a self-playing
  current) that you can then stir against, layering live hands over the replay.
